import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requiresTenantOwnership } from '../middleware/tenantScope';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} from '../controllers/campaignController';
import { getCampaignStats } from '../controllers/campaignStatsController';

const router = Router();

// All campaign routes require authentication.
router.use(authenticate);

// Collection routes — no ownership check needed (listCampaigns filters by tenant internally).
router.get('/', listCampaigns);
router.post('/', createCampaign);

// SECURITY: All single-resource routes apply requiresTenantOwnership so that
// every handler below is only reachable for campaigns owned by the requester's tenant.
router.get(
  '/:id',
  requiresTenantOwnership('campaigns', 'id'),
  getCampaign
);

router.put(
  '/:id',
  requiresTenantOwnership('campaigns', 'id'),
  updateCampaign
);

router.delete(
  '/:id',
  requiresTenantOwnership('campaigns', 'id'),
  deleteCampaign
);

// SECURITY FIX: stats sub-route now protected by tenant ownership middleware.
// Previously this route had no ownership guard — this was the IDOR vulnerability.
router.get(
  '/:id/stats',
  requiresTenantOwnership('campaigns', 'id'),
  getCampaignStats
);

export default router;
