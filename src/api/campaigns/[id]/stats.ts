import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { db } from '../../../db';
import { campaignStatsService } from '../../../services/campaignStatsService';
import { logger } from '../../../utils/logger';

/**
 * Next.js API Route: GET /api/campaigns/[id]/stats
 *
 * SECURITY FIX: Verifies tenant ownership before returning stats.
 * Previously returned stats for any campaign ID without an ownership check.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await getSession({ req });

  if (!session?.user?.tenantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const campaignId = req.query.id as string;
  const tenantId = session.user.tenantId as string;

  if (!campaignId) {
    res.status(400).json({ error: 'Missing campaign ID' });
    return;
  }

  // SECURITY FIX: scope lookup by both campaignId AND tenantId.
  const campaign = await db.campaigns.findOne({
    where: { id: campaignId, tenantId },
  });

  if (!campaign) {
    logger.warn('Next.js API: cross-tenant campaign stats access blocked', {
      campaignId,
      tenantId,
      userId: session.user.id,
    });
    // Return 403, not 404, to avoid confirming whether the campaign ID exists.
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  try {
    const stats = await campaignStatsService.getStats(campaignId, tenantId);
    res.status(200).json(stats);
  } catch (err) {
    logger.error('Next.js API: failed to retrieve campaign stats', { campaignId, tenantId, err });
    res.status(500).json({ error: 'Internal server error' });
  }
}
