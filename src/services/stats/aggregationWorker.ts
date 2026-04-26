import { db } from "../../db";
import { redisLock } from "../../lib/redisLock";
import { logger } from "../../lib/logger";
import { computeAggregatedStats } from "./campaignStatsService";
import { invalidateCampaignStatsCache } from "../../cache/statsCacheManager";

const LOCK_TTL_MS = 30_000; // 30 seconds

/**
 * Aggregates and persists stats for a single campaign.
 * Uses a distributed Redis lock to prevent concurrent writes
 * to the same campaign_id — the root cause of the race condition
 * that produced corrupted open rates.
 */
export async function aggregateCampaignStats(campaignId: number): Promise<void> {
  const lockKey = `lock:stats:campaign:${campaignId}`;

  await redisLock(lockKey, LOCK_TTL_MS, async () => {
    logger.info(`[aggregationWorker] Acquired lock for campaign ${campaignId}`);

    let stats: Record<string, number>;
    try {
      stats = await computeAggregatedStats(campaignId);
    } catch (err) {
      logger.error(
        `[aggregationWorker] Failed to compute stats for campaign ${campaignId}`,
        err
      );
      throw err;
    }

    try {
      // Atomic upsert — replaces the previous read-modify-write pattern
      // that was vulnerable to concurrent partial overwrites.
      await db.campaignStats.updateOne(
        { campaign_id: campaignId },
        {
          $set: {
            ...stats,
            updated_at: new Date(),
          },
        },
        { upsert: true }
      );

      logger.info(
        `[aggregationWorker] Stats persisted for campaign ${campaignId}`
      );
    } catch (err) {
      logger.error(
        `[aggregationWorker] DB write failed for campaign ${campaignId}`,
        err
      );
      throw err;
    }

    // Invalidate the cache AFTER the write succeeds so stale data is not served.
    await invalidateCampaignStatsCache(campaignId);
  });

  logger.info(`[aggregationWorker] Released lock for campaign ${campaignId}`);
}

/**
 * Entry point for bulk aggregation across all active campaigns.
 * Each campaign is processed sequentially to bound Redis lock contention.
 * For large fleets, swap for a bounded worker-pool approach.
 */
export async function aggregateAllCampaignStats(
  campaignIds: number[]
): Promise<void> {
  for (const id of campaignIds) {
    try {
      await aggregateCampaignStats(id);
    } catch (err) {
      // Log and continue — one failed campaign should not block the rest.
      logger.error(
        `[aggregationWorker] Skipping campaign ${id} due to error`,
        err
      );
    }
  }
}
