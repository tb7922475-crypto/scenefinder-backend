const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/library', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        id, title, anime_title, clip_name, drive_link, status,
        frame_count, duration_seconds, created_at, updated_at
       FROM videos
       ORDER BY created_at DESC`,
      []
    );

    const videos = result.rows.map(row => ({
      video_id: row.id,
      title: row.title,
      anime_title: row.anime_title || null,
      clip_name: row.clip_name || null,
      drive_link: row.drive_link || null,
      status: row.status,
      frame_count: row.frame_count || 0,
      duration: row.duration_seconds || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
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
      video_id: video.id,
      title: video.title,
      anime_title: video.anime_title || null,
      clip_name: video.clip_name || null,
      drive_link: video.drive_link || null,
      status: video.status,
      frame_count: video.frame_count || frameCount,
      duration: video.duration_seconds || 0,
      created_at: video.created_at,
      updated_at: video.updated_at,
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
