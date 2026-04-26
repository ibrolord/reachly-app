import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { CampaignStats } from '../../services/campaignStatsService';

interface CampaignStatsDashboardProps {
  campaignId: string;
}

/**
 * CampaignStatsDashboard
 *
 * Renders analytics for a single campaign.
 *
 * SECURITY (defense-in-depth): Even though the backend now enforces tenant
 * ownership and will return 403 for cross-tenant requests, this component
 * adds a client-side guard: if the API somehow returns data whose tenantId
 * does not match the current session's tenantId, we refuse to render it
 * and redirect to safety. This is NOT a substitute for the backend fix.
 */
export const CampaignStatsDashboard: React.FC<CampaignStatsDashboardProps> = ({
  campaignId,
}) => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.replace('/login');
      return;
    }

    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/campaigns/${campaignId}/stats`, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.status === 403) {
          // Backend correctly blocked a cross-tenant request.
          // Redirect away — do NOT render any data.
          router.replace('/campaigns');
          return;
        }

        if (response.status === 401) {
          router.replace('/login');
          return;
        }

        if (!response.ok) {
          setError('Failed to load campaign stats. Please try again.');
          return;
        }

        const data: CampaignStats & { tenantId?: string } = await response.json();

        // SECURITY (defense-in-depth): verify the returned data belongs to the
        // current session's tenant. The backend should already enforce this, but
        // we add a client-side check as an additional safeguard.
        if (data.tenantId && data.tenantId !== session.user?.tenantId) {
          console.error(
            'CampaignStatsDashboard: tenantId mismatch — refusing to render cross-tenant data',
            { expected: session.user?.tenantId, received: data.tenantId }
          );
          router.replace('/campaigns');
          return;
        }

        setStats(data);
      } catch (err) {
        console.error('CampaignStatsDashboard: unexpected fetch error', err);
        setError('An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [campaignId, session, status, router]);

  if (status === 'loading' || loading) {
    return <div className="stats-loading">Loading campaign stats…</div>;
  }

  if (error) {
    return <div className="stats-error" role="alert">{error}</div>;
  }

  if (!stats) {
    return null;
  }

  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtNum = (n: number) => n.toLocaleString();
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <div className="campaign-stats-dashboard">
      <h2>Campaign Stats</h2>
      <dl className="stats-grid">
        <dt>Total Sends</dt>
        <dd>{fmtNum(stats.totalSends)}</dd>

        <dt>Delivered</dt>
        <dd>{fmtNum(stats.totalDelivered)}</dd>

        <dt>Open Rate</dt>
        <dd>{fmtPct(stats.openRate)}</dd>

        <dt>Click-Through Rate</dt>
        <dd>{fmtPct(stats.clickThroughRate)}</dd>

        <dt>Bounce Rate</dt>
        <dd>{fmtPct(stats.bounceRate)}</dd>

        <dt>Unsubscribe Rate</dt>
        <dd>{fmtPct(stats.unsubscribeRate)}</dd>

        <dt>Revenue</dt>
        <dd>{fmtCurrency(stats.totalRevenue)}</dd>
      </dl>
      <p className="stats-updated">
        Last updated: {new Date(stats.lastUpdatedAt).toLocaleString()}
      </p>
    </div>
  );
};

export default CampaignStatsDashboard;
