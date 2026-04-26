const db = require('../db');

/**
 * GET /api/campaigns/:id/stats
 * Bug: org_id is not used in the query — any authenticated user can pull
 * any campaign's stats by guessing the campaign ID.
 */
async function getCampaignStats(req, res) {
  const { id } = req.params;
  // BUG: missing WHERE org_id = req.user.org_id
  const stats = await db.query(
    `SELECT campaign_id, sends, opens, clicks, unsubscribes, revenue
     FROM campaign_analytics
     WHERE campaign_id = $1`,
    [id]
  );
  if (!stats.rows.length) return res.status(404).json({ error: 'Not found' });
  return res.json(stats.rows[0]);
}

/**
 * GET /api/campaigns
 * Lists campaigns — correctly scoped to org.
 */
async function listCampaigns(req, res) {
  const { org_id } = req.user;
  const campaigns = await db.query(
    `SELECT id, name, status, sent_at FROM campaigns WHERE org_id = $1 ORDER BY sent_at DESC`,
    [org_id]
  );
  return res.json(campaigns.rows);
}

module.exports = { getCampaignStats, listCampaigns };
