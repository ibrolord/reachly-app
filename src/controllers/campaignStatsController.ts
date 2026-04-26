import { Request, Response } from 'express';
import { campaignStatsService } from '../services/campaignStatsService';
import { db } from '../db';
import { logger } from '../utils/logger';

/**
 * GET /api/campaigns/:id/stats
 *
 * SECURITY: campaign ownership is verified against req.user.tenantId before
 * any data is fetched. Returns 403 (not 404) to avoid leaking resource existence.
 */
export async function getCampaignStats(req: Request, res: Response): Promise<Response> {
  const { id: campaignId } = req.params;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    // Should never reach here if auth middleware is applied, but fail-fast defensively.
    logger.error('getCampaignStats called without tenantId on req.user', { campaignId });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // SECURITY FIX: scope the lookup by BOTH campaignId AND tenantId.
  // If the campaign does not belong to this tenant, treat it as not found
  // and return 403 — never 404 — to avoid confirming whether the ID exists.
  const campaign = await db.campaigns.findOne({
    where: { id: campaignId, tenantId },
  });

  if (!campaign) {
    logger.warn('Cross-tenant campaign stats access attempt blocked', {
      campaignId,
      tenantId,
      userId: req.user?.id,
    });
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const stats = await campaignStatsService.getStats(campaignId, tenantId);
    return res.status(200).json(stats);
  } catch (err) {
    logger.error('Failed to retrieve campaign stats', { campaignId, tenantId, err });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
