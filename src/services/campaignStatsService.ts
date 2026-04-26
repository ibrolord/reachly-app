import { db } from '../db';
import { logger } from '../utils/logger';

export interface CampaignStats {
  campaignId: string;
  totalSends: number;
  totalDelivered: number;
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  totalBounces: number;
  totalUnsubscribes: number;
  totalRevenue: number;
  openRate: number;
  clickThroughRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  lastUpdatedAt: Date;
}

/**
 * getStats
 *
 * Retrieves analytics for a campaign.
 *
 * SECURITY: `tenantId` is a required parameter. The stats query is scoped to
 * the owning tenant so that even if a caller bypasses the controller-level
 * ownership check, no cross-tenant data can be returned from this layer.
 */
export async function getStats(
  campaignId: string,
  tenantId: string
): Promise<CampaignStats> {
  if (!tenantId) {
    // Defensive: this should never happen if routes are properly guarded.
    logger.error('getStats called without tenantId — refusing to execute', { campaignId });
    throw new Error('tenantId is required to fetch campaign stats');
  }

  // Join through campaigns to enforce tenant scoping at the DB query level.
  const row = await db.campaignStats.findOne({
    where: { campaignId },
    include: [
      {
        model: db.campaigns,
        where: { id: campaignId, tenantId }, // SECURITY: double-check ownership in query
        attributes: [],
      },
    ],
  });

  if (!row) {
    logger.warn('campaignStatsService.getStats — no stats found for campaign/tenant pair', {
      campaignId,
      tenantId,
    });
    throw new Error('Campaign stats not found');
  }

  const totalSends = row.totalSends ?? 0;
  const totalDelivered = row.totalDelivered ?? 0;
  const uniqueOpens = row.uniqueOpens ?? 0;
  const uniqueClicks = row.uniqueClicks ?? 0;
  const totalBounces = row.totalBounces ?? 0;
  const totalUnsubscribes = row.totalUnsubscribes ?? 0;

  return {
    campaignId,
    totalSends,
    totalDelivered,
    totalOpens: row.totalOpens ?? 0,
    uniqueOpens,
    totalClicks: row.totalClicks ?? 0,
    uniqueClicks,
    totalBounces,
    totalUnsubscribes,
    totalRevenue: row.totalRevenue ?? 0,
    openRate: totalDelivered > 0 ? uniqueOpens / totalDelivered : 0,
    clickThroughRate: totalDelivered > 0 ? uniqueClicks / totalDelivered : 0,
    bounceRate: totalSends > 0 ? totalBounces / totalSends : 0,
    unsubscribeRate: totalDelivered > 0 ? totalUnsubscribes / totalDelivered : 0,
    lastUpdatedAt: row.updatedAt,
  };
}

export const campaignStatsService = { getStats };
