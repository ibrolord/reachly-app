import React from "react";

interface CampaignStats {
  unique_opens?: number | null;
  total_sent?: number | null;
  open_rate?: number | null; // pre-computed by API if available
  updated_at?: string | null;
}

interface OpenRateWidgetProps {
  stats: CampaignStats | null | undefined;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Displays the open rate for a campaign.
 *
 * Bug fix: previously, accessing `stats.unique_opens` without a null-check
 * threw `TypeError: Cannot read properties of undefined (reading 'unique_opens')`
 * when the stats record was incomplete (e.g., from a partial write during the
 * aggregation race condition). The component then fell back to a stale rendered
 * value, contributing to wildly incorrect displayed percentages.
 *
 * Now:
 *  - If stats is null/undefined or required fields are missing → renders "N/A"
 *    with a helpful tooltip rather than a corrupted number.
 *  - Prefers the API-computed `open_rate` field; falls back to client-side
 *    computation only when necessary, with full null-safety.
 *  - Never divides when total_sent is 0 or null.
 */
export const OpenRateWidget: React.FC<OpenRateWidgetProps> = ({
  stats,
  isLoading = false,
  error = null,
}) => {
  if (isLoading) {
    return (
      <div className="open-rate-widget open-rate-widget--loading">
        <span className="open-rate-widget__label">Open Rate</span>
        <span className="open-rate-widget__value open-rate-widget__value--placeholder">
          —
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="open-rate-widget open-rate-widget--error">
        <span className="open-rate-widget__label">Open Rate</span>
        <span
          className="open-rate-widget__value open-rate-widget__value--na"
          title={`Unable to load stats: ${error}`}
        >
          N/A
        </span>
      </div>
    );
  }

  const openRate = computeOpenRate(stats);

  return (
    <div className="open-rate-widget">
      <span className="open-rate-widget__label">Open Rate</span>
      {openRate !== null ? (
        <span className="open-rate-widget__value">
          {openRate.toFixed(1)}%
        </span>
      ) : (
        <span
          className="open-rate-widget__value open-rate-widget__value--na"
          title="Stats are being computed or data is unavailable. Please refresh shortly."
        >
          N/A
        </span>
      )}
      {stats?.updated_at && (
        <span className="open-rate-widget__updated">
          Updated {new Date(stats.updated_at).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
};

/**
 * Safely computes an open rate percentage.
 *
 * Returns null (rendered as "N/A") instead of a corrupted value whenever:
 *  - stats is null or undefined
 *  - unique_opens is null or undefined
 *  - total_sent is null, undefined, or zero (avoids division by zero)
 *
 * Prefers the API-provided `open_rate` to avoid redundant client-side math.
 */
function computeOpenRate(stats: CampaignStats | null | undefined): number | null {
  if (!stats) return null;

  // Prefer server-computed value when available and within a plausible range.
  if (stats.open_rate != null && isPlausibleRate(stats.open_rate)) {
    return stats.open_rate;
  }

  // Client-side fallback — only when both fields are present and valid.
  if (stats.unique_opens == null || stats.total_sent == null || stats.total_sent <= 0) {
    return null;
  }

  const rate = (stats.unique_opens / stats.total_sent) * 100;

  // Sanity clamp: an open rate above 100% is physically impossible.
  // Return null rather than display a nonsensical value.
  if (!isPlausibleRate(rate)) {
    return null;
  }

  return rate;
}

/** Open rate must be a finite number between 0 and 100 inclusive. */
function isPlausibleRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

export default OpenRateWidget;
