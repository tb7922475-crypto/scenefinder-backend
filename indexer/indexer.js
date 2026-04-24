/**
 * Background indexer – monitors for videos in 'pending' status and indexes them.
 *
 * This module can be run as a standalone process (`node indexer/indexer.js`)
 * or imported and started via startIndexer() from within the main server.
 *
 * It polls the database every POLL_INTERVAL_MS milliseconds, picks up any
 * video that is still in 'pending' state, extracts frames, generates
 * embeddings, and marks the video as 'ready'.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const db = require('../db');
const { extractFrames } = require('../utils/ffmpeg');
const { generateImageEmbedding } = require('../utils/embeddings');
const logger = require('../utils/logger');

const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS, 10) || 30_000; // 30 s
const FRAME_INTERVAL = parseInt(process.env.INDEXER_FRAME_INTERVAL, 10) || 1; // seconds

let running = false;

/**
 * Process a single pending video: extract frames, embed, persist.
 * @param {{ id: string, title: string, file_path: string }} video
 */
const processVideo = async (video) => {
  const { id: videoId, title, file_path: videoPath } = video;
  logger.info(`Indexer: processing video ${videoId} – "${title}"`);

  try {
    // Mark as processing so other indexer instances skip it
    await db.query(
      `UPDATE videos SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [videoId]
    );

    const framesDir = path.join('/tmp', 'scenefinder', 'frames', videoId);
    const framePaths = await extractFrames(videoPath, framesDir, FRAME_INTERVAL);

    let indexedCount = 0;
    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const timestampSeconds = i * FRAME_INTERVAL;

      try {
        const { embedding, description } = await generateImageEmbedding(framePath);

        await db.query(
          `INSERT INTO frames (video_id, timestamp_seconds, description, embedding, thumbnail_path)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [videoId, timestampSeconds, description, JSON.stringify(embedding), framePath]
        );
        indexedCount++;
      } catch (frameErr) {
        logger.warn(`Indexer: skipping frame ${i} for video ${videoId}: ${frameErr.message}`);
      }
    }

    await db.query(
      `UPDATE videos
       SET status = 'ready', frame_count = $1, updated_at = NOW()
       WHERE id = $2`,
      [indexedCount, videoId]
    );

    // Refresh aggregate index_status row
    await db.query(`
      UPDATE index_status
      SET
        total_videos   = (SELECT COUNT(*) FROM videos),
        total_frames   = (SELECT COUNT(*) FROM frames),
        indexed_frames = (SELECT COUNT(*) FROM frames WHERE embedding IS NOT NULL),
        last_updated   = NOW()
      WHERE id = (SELECT id FROM index_status ORDER BY id LIMIT 1)
    `);

    logger.info(`Indexer: video ${videoId} done – ${indexedCount}/${framePaths.length} frames indexed`);
  } catch (err) {
    logger.error(`Indexer: failed to process video ${videoId}:`, err.message);
    await db.query(
      `UPDATE videos SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [videoId]
    ).catch(() => {});
  }
};

/**
 * Single poll cycle: find all pending videos and process them sequentially.
 */
const poll = async () => {
  if (running) return; // prevent overlapping runs
  running = true;

  try {
    const result = await db.query(
      `SELECT id, title, file_path FROM videos WHERE status = 'pending' ORDER BY created_at ASC`
    );

    if (result.rows.length > 0) {
      logger.info(`Indexer: found ${result.rows.length} pending video(s)`);
      for (const video of result.rows) {
        await processVideo(video);
      }
    }
  } catch (err) {
    logger.error('Indexer poll error:', err.message);
  } finally {
    running = false;
  }
};

/**
 * Start the background indexer loop.
 * Safe to call multiple times – subsequent calls are no-ops.
 */
let intervalHandle = null;
const startIndexer = () => {
  if (intervalHandle) return; // already started
  logger.info(`Indexer: starting (poll interval ${POLL_INTERVAL_MS}ms)`);
  poll(); // run immediately on start
  intervalHandle = setInterval(poll, POLL_INTERVAL_MS);
};

/**
 * Stop the background indexer loop.
 */
const stopIndexer = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Indexer: stopped');
  }
};

module.exports = { startIndexer, stopIndexer };

// Allow running as a standalone process: `node indexer/indexer.js`
if (require.main === module) {
  db.initSchema()
    .then(() => startIndexer())
    .catch((err) => {
      logger.error('Indexer startup error:', err);
      process.exit(1);
    });
}
