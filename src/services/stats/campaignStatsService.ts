import { db } from "../../db";
import { logger } from "../../lib/logger";

export interface CampaignStats {
  campaign_id: number;
  total_sent: number;
  unique_opens: number;
  total_opens: number;
  unique_clicks: number;
  total_clicks: number;
  bounces: number;
  unsubscribes: number;
  updated_at: Date;
}

/**
 * Computes aggregated stats for a campaign directly from raw event data.
 * Uses DB-level aggregation to avoid a read-modify-write pattern that
 * is vulnerable to partial overwrites in concurrent environments.
 */
export async function computeAggregatedStats(
  campaignId: number
): Promise<Omit<CampaignStats, "campaign_id" | "updated_at">> {
  const [sendResult, eventResult] = await Promise.all([
    // Total sent is sourced from the immutable sends ledger.
    db.campaignSends.aggregate([
      { $match: { campaign_id: campaignId } },
      { $count: "total_sent" },
    ]),

    // All open/click/bounce/unsub events are aggregated atomically.
    db.campaignEvents.aggregate([
      { $match: { campaign_id: campaignId } },
      {
        $group: {
          _id: "$campaign_id",
          unique_opens: {
            $sum: { $cond: [{ $eq: ["$event_type", "open"] }, 1, 0] },
          },
          total_opens: {
            $sum: { $cond: [{ $eq: ["$event_type", "open"] }, 1, 0] },
          },
          unique_clicks: {
            $sum: { $cond: [{ $eq: ["$event_type", "click"] }, 1, 0] },
          },
          total_clicks: {
            $sum: { $cond: [{ $eq: ["$event_type", "click"] }, 1, 0] },
          },
          bounces: {
            $sum: { $cond: [{ $eq: ["$event_type", "bounce"] }, 1, 0] },
          },
          unsubscribes: {
            $sum: { $cond: [{ $eq: ["$event_type", "unsubscribe"] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const totalSent: number = sendResult?.[0]?.total_sent ?? 0;
  const events = eventResult?.[0] ?? {};

  const stats = {
    total_sent: totalSent,
    unique_opens: events.unique_opens ?? 0,
    total_opens: events.total_opens ?? 0,
    unique_clicks: events.unique_clicks ?? 0,
    total_clicks: events.total_clicks ?? 0,
    bounces: events.bounces ?? 0,
    unsubscribes: events.unsubscribes ?? 0,
  };

  logger.debug(
    `[campaignStatsService] Computed stats for campaign ${campaignId}`,
    stats
  );

  return stats;
}

/**
 * Fetches the persisted stats record for a campaign.
 * Returns null if no record exists yet (e.g., aggregation has not run).
 */
export async function getCampaignStats(
  campaignId: number
): Promise<CampaignStats | null> {
  const record = await db.campaignStats.findOne({ campaign_id: campaignId });
  if (!record) {
    logger.warn(
      `[campaignStatsService] No stats record found for campaign ${campaignId}`
    );
    return null;
  }
  return record as CampaignStats;
}

/**
 * Applies atomic increments to an existing stats record.
 * Safe for high-frequency event ingestion — avoids full record overwrites.
 */
export async function incrementCampaignStatField(
  campaignId: number,
  field: keyof Omit<CampaignStats, "campaign_id" | "updated_at">,
  delta = 1
): Promise<void> {
  await db.campaignStats.updateOne(
    { campaign_id: campaignId },
    {
      $inc: { [field]: delta },
      $set: { updated_at: new Date() },
    },
    { upsert: true }
  );
}
