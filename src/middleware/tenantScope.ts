import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { logger } from '../utils/logger';

/**
 * requiresTenantOwnership
 *
 * Middleware factory that verifies the resource identified by `paramName`
 * belongs to the authenticated user's tenant before passing control to the
 * route handler. Apply to any route that exposes a tenant-owned resource by ID.
 *
 * Usage:
 *   router.get('/:id/stats', requiresTenantOwnership('campaigns', 'id'), handler)
 *
 * Returns 403 (not 404) on ownership failure to avoid leaking resource existence.
 */
export function requiresTenantOwnership(
  tableName: string,
  paramName: string = 'id'
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const resourceId = req.params[paramName];
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!resourceId) {
      res.status(400).json({ error: 'Missing resource identifier' });
      return;
    }

    const record = await db[tableName].findOne({
      where: { id: resourceId, tenantId },
      attributes: ['id'], // only fetch what we need for the check
    });

    if (!record) {
      logger.warn('Tenant ownership check failed — access blocked', {
        table: tableName,
        resourceId,
        tenantId,
        userId: req.user?.id,
        path: req.path,
      });
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Attach the verified record ID so downstream handlers don't re-fetch for auth.
    req.verifiedResourceId = resourceId;
    next();
  };
}
