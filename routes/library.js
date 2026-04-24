const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/library', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        id, title, clip_name, status, frame_count, duration_seconds, 
        created_at, updated_at
       FROM videos
       ORDER BY created_at DESC`,
      []
    );

    const videos = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      clipName: row.clip_name,
      status: row.status,
      frameCount: row.frame_count || 0,
      duration: row.duration_seconds || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({
      videos,
      total: videos.length,
    });
  } catch (err) {
    console.error('Library fetch error:', err);
    res.status(500).json({
      error: 'Failed to fetch library',
      details: err.message,
    });
  }
});

router.get('/library/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const videoResult = await db.query(
      `SELECT * FROM videos WHERE id = $1`,
      [id]
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Video not found',
      });
    }

    const video = videoResult.rows[0];

    const framesResult = await db.query(
      `SELECT COUNT(*) as count FROM frames WHERE video_id = $1`,
      [id]
    );

    const frameCount = parseInt(framesResult.rows[0].count);

    res.json({
      id: video.id,
      title: video.title,
      clipName: video.clip_name,
      status: video.status,
      frameCount: video.frame_count || frameCount,
      duration: video.duration_seconds || 0,
      createdAt: video.created_at,
      updatedAt: video.updated_at,
    });
  } catch (err) {
    console.error('Library fetch error:', err);
    res.status(500).json({
      error: 'Failed to fetch video',
      details: err.message,
    });
  }
});

module.exports = router;
