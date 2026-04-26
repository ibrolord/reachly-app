import { cache } from "../lib/cache";
import { logger } from "../lib/logger";
import { CampaignStats } from "../services/stats/campaignStatsService";

const STATS_CACHE_PREFIX = "stats:campaign";
const CACHE_TTL_SECONDS = 300; // 5 minutes nominal TTL
const FALLBACK_TTL_SECONDS = 60; // 1 minute safety TTL on invalidation failure

function statsCacheKey(campaignId: number): string {
  return `${STATS_CACHE_PREFIX}:${campaignId}`;
}

/**
 * Reads campaign stats from cache.
 * Returns null on a cache miss or if the cached value is incomplete.
 */
export async function getCachedCampaignStats(
  campaignId: number
): Promise<CampaignStats | null> {
  try {
    const raw = await cache.get(statsCacheKey(campaignId));
    if (!raw) return null;

    const parsed: CampaignStats = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Guard: reject incomplete cache entries that could propagate corrupted data.
    if (parsed.unique_opens == null || parsed.total_sent == null) {
      logger.warn(
        `[statsCacheManager] Incomplete cache entry for campaign ${campaignId} — discarding`
      );
      await invalidateCampaignStatsCache(campaignId);
      return null;
    }

    return parsed;
  } catch (err) {
    logger.error(
      `[statsCacheManager] Cache read failed for campaign ${campaignId}`,
      err
    );
    return null;
  }
}

/**
 * Writes campaign stats to cache with the nominal TTL.
 */
export async function setCachedCampaignStats(
  campaignId: number,
  stats: CampaignStats
): Promise<void> {
  try {
    await cache.set(
      statsCacheKey(campaignId),
      JSON.stringify(stats),
      CACHE_TTL_SECONDS
    );
  } catch (err) {
    logger.error(
      `[statsCacheManager] Cache write failed for campaign ${campaignId}`,
      err
    );
    // Non-fatal — the DB remains the source of truth.
  }
}

/**
 * Invalidates the cache entry for a campaign.
 *
 * Previously, this call was silently swallowing exceptions, which meant
 * corrupted stat values were being cached indefinitely. Now we:
 *  1. Log the error explicitly.
 *  2. Fall back to a short TTL so the entry force-expires within 60 seconds
 *     even when explicit deletion fails.
 */
export async function invalidateCampaignStatsCache(
  campaignId: number
): Promise<void> {
  const key = statsCacheKey(campaignId);
  try {
    await cache.invalidate(key);
    logger.info(
      `[statsCacheManager] Cache invalidated for campaign ${campaignId}`
    );
  } catch (err) {
    logger.error(
      `[statsCacheManager] Cache invalidation failed for campaign ${campaignId} — applying fallback TTL`,
      err
    );
    // Fallback: force the entry to expire soon so stale data is not served forever.
    try {
      await cache.setTTL(key, FALLBACK_TTL_SECONDS);
      logger.warn(
        `[statsCacheManager] Fallback TTL (${FALLBACK_TTL_SECONDS}s) applied for campaign ${campaignId}`
      );
    } catch (ttlErr) {
      logger.error(
        `[statsCacheManager] Fallback TTL also failed for campaign ${campaignId} — cache may serve stale data`,
        ttlErr
      );
    }
  }
}

/**
 * Utility for emergency manual cache flush (e.g., ops runbook for billing incidents).
 */
export async function forceFlushCampaignStatsCache(
  campaignId: number
): Promise<void> {
  logger.warn(
    `[statsCacheManager] Force-flushing cache for campaign ${campaignId}`
  );
  await invalidateCampaignStatsCache(campaignId);
}
