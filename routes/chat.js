const express = require('express');
const db = require('../db');
const { generateEmbedding } = require('../utils/embeddings');
const { performSimilaritySearch, groupFramesIntoScenes } = require('../utils/sceneGrouping');
const logger = require('../utils/logger');

const router = express.Router();

const SUPPORTED_ANIME = ['Jujutsu Kaisen', 'Chainsaw Man', 'Demon Slayer'];

/**
 * Format seconds as MM:SS.
 */
const formatTimestamp = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * POST /chat
 * Conversational endpoint that mimics the SceneFinder.AI agent.
 * Accepts { message } and returns a natural-language response with scene matches.
 */
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        response: 'Please describe the action or scene you are looking for.',
      });
    }

    const lowerMessage = message.toLowerCase();

    // Handle help / greeting messages
    if (/^(hi|hello|hey|help|what can you do)/i.test(lowerMessage)) {
      return res.json({
        response:
          "Hi! I'm SceneFinder.AI \u2014 your anime scene search assistant.\n\n" +
          'Describe any action from an anime fight clip and I\'ll find the exact timestamp for you.\n\n' +
          '**Supported anime:** ' + SUPPORTED_ANIME.join(', ') + '\n\n' +
          '**Example queries:**\n' +
          '- "Toji slashes through the dragon"\n' +
          '- "Gojo removes his blindfold"\n' +
          '- "Denji transforms into Chainsaw Man"\n\n' +
          'Try describing a specific action, character, weapon, or movement!',
        results: [],
      });
    }

    // Generate embedding for the user's query
    const queryEmbedding = await generateEmbedding(message);

    // Fetch all indexed frames
    const frameResult = await db.query(
      `SELECT 
        f.id, f.video_id, f.timestamp_seconds, f.description, 
        f.embedding, f.thumbnail_path,
        v.title, v.anime_title, v.clip_name, v.file_path, v.drive_link
       FROM frames f
       JOIN videos v ON f.video_id = v.id
       WHERE v.status = 'ready'`,
      []
    );

    const frames = frameResult.rows.map(row => ({
      id: row.id,
      videoId: row.video_id,
      timestamp_seconds: parseFloat(row.timestamp_seconds),
      description: row.description,
      embedding: row.embedding ? JSON.parse(row.embedding) : null,
      thumbnailPath: row.thumbnail_path,
      title: row.title,
      animeTitle: row.anime_title,
      clipName: row.clip_name,
      filePath: row.file_path,
      driveLink: row.drive_link,
    }));

    if (frames.length === 0) {
      return res.json({
        response:
          'No videos have been indexed yet. Upload some anime clips first, then try searching!',
        results: [],
      });
    }

    // Perform similarity search
    const searchResults = performSimilaritySearch(queryEmbedding, frames, 20, 0.5);

    if (searchResults.length === 0) {
      return res.json({
        response:
          'No strong match found. Try describing the action with more detail ' +
          '(character, weapon, movement, enemy, environment).',
        results: [],
      });
    }

    // Group into scenes per video
    const groupedByVideo = {};
    searchResults.forEach(result => {
      if (!groupedByVideo[result.videoId]) {
        groupedByVideo[result.videoId] = {
          videoId: result.videoId,
          title: result.title,
          animeTitle: result.animeTitle,
          clipName: result.clipName,
          driveLink: result.driveLink,
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
          animeTitle: videoGroup.animeTitle || videoGroup.title,
          clipName: videoGroup.clipName,
          videoId: videoGroup.videoId,
          driveLink: videoGroup.driveLink,
          startTimestamp: parseFloat(scene.startTimestamp.toFixed(2)),
          endTimestamp: parseFloat(scene.endTimestamp.toFixed(2)),
          confidence: parseFloat(scene.confidence.toFixed(4)),
          description: scene.description,
        });
      });
    });

    const sortedScenes = scenes.sort((a, b) => b.confidence - a.confidence);
    const topScenes = sortedScenes.slice(0, 5);

    // Build natural-language response
    let responseText = '';

    if (topScenes.length === 1) {
      responseText = '**Match found!**\n\n';
    } else {
      responseText = `**${topScenes.length} matches found!**\n\n`;
    }

    topScenes.forEach((scene, idx) => {
      const start = formatTimestamp(scene.startTimestamp);
      const end = formatTimestamp(scene.endTimestamp);

      if (topScenes.length > 1) {
        responseText += `**#${idx + 1}**\n`;
      }

      responseText += `**Anime:** ${scene.animeTitle}\n`;
      if (scene.clipName) {
        responseText += `**Clip:** ${scene.clipName}\n`;
      }
      responseText += `**Timestamp:** ${start} \u2013 ${end}\n`;
      responseText += `**Confidence:** ${scene.confidence.toFixed(2)}\n`;
      if (scene.driveLink) {
        responseText += `**Download:** [Google Drive](${scene.driveLink})\n`;
      }
      if (scene.description) {
        responseText += `**Scene:** ${scene.description}\n`;
      }
      responseText += '\n';
    });

    // Build structured results for the frontend
    const structuredResults = topScenes.map(scene => ({
      anime_title: scene.animeTitle,
      clip_name: scene.clipName,
      video_id: scene.videoId,
      start_timestamp: scene.startTimestamp,
      end_timestamp: scene.endTimestamp,
      confidence: scene.confidence,
      drive_link: scene.driveLink || null,
      description: scene.description || null,
    }));

    res.json({
      response: responseText.trim(),
      results: structuredResults,
    });
  } catch (err) {
    logger.error('Chat error:', err.message);
    res.status(500).json({
      response: 'Something went wrong while searching. Please try again.',
      error: err.message,
    });
  }
});

module.exports = router;
