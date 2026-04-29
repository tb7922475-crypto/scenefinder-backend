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

router.post('/library/:id/reindex', async (req, res) => {
  try {
    const { id } = req.params;

    const videoResult = await db.query(
      `SELECT id, title, status FROM videos WHERE id = $1`,
      [id]
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete existing frames so the indexer regenerates them
    await db.query(`DELETE FROM frames WHERE video_id = $1`, [id]);

    // Reset status to pending so the indexer picks it up
    await db.query(
      `UPDATE videos SET status = 'pending', frame_count = 0, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({
      message: `Video "${videoResult.rows[0].title}" queued for re-indexing`,
      video_id: id,
      status: 'pending',
    });
  } catch (err) {
    console.error('Re-index error:', err);
    res.status(500).json({
      error: 'Failed to queue re-index',
      details: err.message,
    });
  }
});

router.post('/library/reindex-all', async (req, res) => {
  try {
    // Delete all existing frames
    await db.query(`DELETE FROM frames`);

    // Reset all videos to pending
    const result = await db.query(
      `UPDATE videos SET status = 'pending', frame_count = 0, updated_at = NOW() RETURNING id, title`
    );

    res.json({
      message: `${result.rows.length} video(s) queued for re-indexing`,
      videos: result.rows.map(r => ({ video_id: r.id, title: r.title })),
    });
  } catch (err) {
    console.error('Re-index all error:', err);
    res.status(500).json({
      error: 'Failed to queue re-index',
      details: err.message,
    });
  }
});

module.exports = router;
