const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getCampaignStats, listCampaigns } = require('./campaigns');

const router = express.Router();
router.use(authenticate);
router.get('/campaigns', listCampaigns);
router.get('/campaigns/:id/stats', getCampaignStats);

module.exports = router;
