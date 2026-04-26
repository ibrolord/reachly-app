import { Request, Response } from "express";
import { getCachedCampaignStats, setCachedCampaignStats } from "../../cache/statsCacheManager";
import { getCampaignStats } from "../../services/stats/campaignStatsService";
import { logger } from "../../lib/logger";
import { CampaignStats } from "../../services/stats/campaignStatsService";

/**
 * GET /api/campaigns/:campaignId/stats
 *
 * Returns aggregated stats for a single campaign.
 * Cache-aside pattern: check cache first, fall back to DB, then populate cache.
 *
 * Added defensive validation so an incomplete stats record (e.g., missing
 * unique_opens due to a partial write) is never forwarded to the client as
 * if it were valid — previously this caused the UI to render corrupted rates.
 */
export async function getCampaignStatsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const campaignId = parseInt(req.params.campaignId, 10);

  if (isNaN(campaignId)) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }

  try {
    // 1. Try cache first.
    let stats: CampaignStats | null = await getCachedCampaignStats(campaignId);

    // 2. Cache miss — fetch from DB.
    if (!stats) {
      stats = await getCampaignStats(campaignId);

      if (!stats) {
        res.status(404).json({
          error: `No stats found for campaign ${campaignId}. Aggregation may still be running.`,
        });
        return;
      }

      // Populate cache for subsequent requests.
      await setCachedCampaignStats(campaignId, stats);
    }

    // 3. Defensive integrity check — reject incomplete records before they
    //    reach the client. A missing unique_opens or total_sent field is a
    //    sign of a partial write from the previously unfixed race condition.
    if (!isStatsRecordComplete(stats)) {
      logger.error(
        `[statsController] Incomplete stats record for campaign ${campaignId} — refusing to serve`,
        { stats }
      );
      res.status(503).json({
        error:
          "Campaign stats are currently being recomputed. Please retry in a moment.",
        retryAfterSeconds: 30,
      });
      return;
    }

    res.status(200).json({
      campaign_id: campaignId,
      stats: serializeStats(stats),
    });
  } catch (err) {
    logger.error(
      `[statsController] Unexpected error fetching stats for campaign ${campaignId}`,
      err
    );
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Returns true only if every required numeric field is present and non-null.
 * Guards against partial writes that omit fields like unique_opens.
 */
function isStatsRecordComplete(stats: CampaignStats): boolean {
  const requiredFields: Array<keyof CampaignStats> = [
    "total_sent",
    "unique_opens",
    "total_opens",
    "unique_clicks",
    "total_clicks",
    "bounces",
    "unsubscribes",
  ];
  return requiredFields.every(
    (field) => stats[field] != null && typeof stats[field] === "number"
  );
}

/**
 * Serializes a stats record for API response, computing derived metrics
 * (open_rate, click_rate) with full null-safety.
 */
function serializeStats(stats: CampaignStats) {
  const openRate =
    stats.unique_opens != null && stats.total_sent > 0
      ? parseFloat(((stats.unique_opens / stats.total_sent) * 100).toFixed(2))
      : null;

  const clickRate =
    stats.unique_clicks != null && stats.total_sent > 0
      ? parseFloat(((stats.unique_clicks / stats.total_sent) * 100).toFixed(2))
      : null;

  return {
    total_sent: stats.total_sent,
    unique_opens: stats.unique_opens,
    total_opens: stats.total_opens,
    unique_clicks: stats.unique_clicks,
    total_clicks: stats.total_clicks,
    bounces: stats.bounces,
    unsubscribes: stats.unsubscribes,
    open_rate: openRate,
    click_rate: clickRate,
    updated_at: stats.updated_at,
  };
}
