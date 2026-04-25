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

/**
 * GET /index-status/:videoId
 * Returns per-video indexing progress so the frontend can poll after upload.
 */
router.get('/index-status/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const [videoResult, framesResult] = await Promise.all([
      db.query(`SELECT id, status, frame_count FROM videos WHERE id = $1`, [videoId]),
      db.query(`SELECT COUNT(*) AS count FROM frames WHERE video_id = $1`, [videoId]),
    ]);

    if (videoResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Video not found',
        details: `No video with id ${videoId}`,
      });
    }

    const video = videoResult.rows[0];
    const framesProcessed = parseInt(framesResult.rows[0].count, 10);
    // total_frames is the authoritative count once indexing completes;
    // while processing, use the live frame count as the best estimate.
    const totalFrames = video.frame_count || framesProcessed;

    const statusMessages = {
      pending:    'Upload received. Indexing will begin shortly.',
      processing: 'Frame extraction and embedding generation in progress.',
      ready:      'Indexing complete. Video is available for search.',
      failed:     'Indexing failed. Please re-upload the video.',
    };

    res.json({
      videoId: video.id,
      status: video.status,
      frames_processed: framesProcessed,
      total_frames: totalFrames,
      message: statusMessages[video.status] || 'Unknown status.',
    });
  } catch (err) {
    logger.error(`Index-status fetch error for video ${videoId}:`, err.message);
    res.status(500).json({
      error: 'Failed to fetch index status',
      details: err.message,
    });
  }
});

module.exports = router;
