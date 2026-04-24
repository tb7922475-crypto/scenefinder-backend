const express = require('express');
const db = require('../db');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /index-status
 * Returns aggregate indexing statistics from the index_status table,
 * supplemented with live counts from the videos and frames tables.
 */
router.get('/index-status', async (req, res) => {
  try {
    // Live counts are always accurate; the index_status row is a cached summary
    const [videosResult, framesResult, indexedResult, statusRow] = await Promise.all([
      db.query(`SELECT COUNT(*) AS count FROM videos`),
      db.query(`SELECT COUNT(*) AS count FROM frames`),
      db.query(`SELECT COUNT(*) AS count FROM frames WHERE embedding IS NOT NULL`),
      db.query(`SELECT * FROM index_status ORDER BY id LIMIT 1`),
    ]);

    const totalVideos = parseInt(videosResult.rows[0].count, 10);
    const totalFrames = parseInt(framesResult.rows[0].count, 10);
    const indexedFrames = parseInt(indexedResult.rows[0].count, 10);

    // Derive a human-readable status
    let status = 'idle';
    if (totalVideos > 0) {
      if (indexedFrames === 0) {
        status = 'pending';
      } else if (indexedFrames < totalFrames) {
        status = 'indexing';
      } else {
        status = 'ready';
      }
    }

    const lastUpdated = statusRow.rows[0]?.last_updated || null;

    res.json({
      totalVideos,
      totalFrames,
      indexedFrames,
      pendingFrames: totalFrames - indexedFrames,
      status,
      lastUpdated,
    });
  } catch (err) {
    logger.error('Index-status fetch error:', err.message);
    res.status(500).json({
      error: 'Failed to fetch index status',
      details: err.message,
    });
  }
});

module.exports = router;
