const express = require('express');
const db = require('../db');
const { generateEmbedding } = require('../utils/embeddings');
const { performSimilaritySearch, groupFramesIntoScenes } = require('../utils/sceneGrouping');

const router = express.Router();

router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        error: 'Search query is required',
      });
    }

    const queryEmbedding = await generateEmbedding(query);

    const frameResult = await db.query(
      `SELECT 
        f.id, f.video_id, f.timestamp_seconds, f.description, 
        f.embedding, f.thumbnail_path,
        v.title, v.clip_name, v.file_path
       FROM frames f
       JOIN videos v ON f.video_id = v.id
       WHERE v.status = 'ready'`,
      []
    );

    const frames = frameResult.rows.map(row => ({
      id: row.id,
      videoId: row.video_id,
      timestamp_seconds: row.timestamp_seconds,
      description: row.description,
      embedding: row.embedding ? JSON.parse(row.embedding) : null,
      thumbnailPath: row.thumbnail_path,
      title: row.title,
      clipName: row.clip_name,
      filePath: row.file_path,
    }));

    if (frames.length === 0) {
      return res.json({
        query,
        results: [],
        totalResults: 0,
      });
    }

    const searchResults = performSimilaritySearch(queryEmbedding, frames, 20, 0.5);

    const groupedByVideo = {};
    searchResults.forEach(result => {
      if (!groupedByVideo[result.videoId]) {
        groupedByVideo[result.videoId] = {
          videoId: result.videoId,
          title: result.title,
          clipName: result.clipName,
          filePath: result.filePath,
          frames: [],
        };
      }
      groupedByVideo[result.videoId].frames.push(result);
    });

    const scenes = [];
    Object.values(groupedByVideo).forEach(videoGroup => {
      const sortedFrames = videoGroup.frames.sort(
        (a, b) => a.timestamp_seconds - b.timestamp_seconds
      );

      const videoScenes = groupFramesIntoScenes(sortedFrames, 0.65, 1.0);

      videoScenes.forEach(scene => {
        scenes.push({
          animeTitle: videoGroup.title,
          clipName: videoGroup.clipName,
          videoId: videoGroup.videoId,
          startTimestamp: parseFloat(scene.startTimestamp.toFixed(2)),
          endTimestamp: parseFloat(scene.endTimestamp.toFixed(2)),
          confidence: parseFloat(scene.confidence.toFixed(4)),
          averageConfidence: parseFloat(scene.averageConfidence.toFixed(4)),
          thumbnail: scene.thumbnail,
          description: scene.description,
          durationSeconds: parseFloat((scene.endTimestamp - scene.startTimestamp).toFixed(2)),
        });
      });
    });

    const sortedScenes = scenes.sort((a, b) => b.confidence - a.confidence);

    res.json({
      query,
      results: sortedScenes,
      totalResults: sortedScenes.length,
      framesSearched: frames.length,
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      error: 'Search failed',
      details: err.message,
    });
  }
});

module.exports = router;