import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string; // REQUIRED — must always be present for tenant scoping
  email: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      verifiedResourceId?: string;
    }
  }
}

/**
 * authenticate
 *
 * Validates the Bearer JWT and hydrates req.user.
 *
 * SECURITY: tenantId is asserted to be present in the token payload.
 * Any token missing tenantId is rejected — this prevents a class of bugs
 * where tenant-scoped queries silently degrade to unscoped queries.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — missing Bearer token' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch (err) {
    logger.warn('authenticate: invalid or expired JWT', { err });
    res.status(401).json({ error: 'Unauthorized — invalid token' });
    return;
  }

  // SECURITY: tenantId MUST be present in the token. Fail-fast if it is not.
  if (!payload.tenantId || typeof payload.tenantId !== 'string') {
    logger.error('authenticate: JWT is missing tenantId claim — rejecting request', {
      sub: payload.sub,
    });
    res.status(401).json({ error: 'Unauthorized — malformed token' });
    return;
  }

  if (!payload.sub || !payload.email) {
    res.status(401).json({ error: 'Unauthorized — malformed token' });
    return;
  }

  req.user = {
    id: payload.sub,
    tenantId: payload.tenantId,
    email: payload.email,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
  };

  next();
}
