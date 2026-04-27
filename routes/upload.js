const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { extractFrames } = require('../utils/ffmpeg');
const { generateImageEmbedding } = require('../utils/embeddings');
const logger = require('../utils/logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer configuration – store uploads in /tmp/scenefinder/uploads
// ---------------------------------------------------------------------------
const UPLOAD_DIR = path.join('/tmp', 'scenefinder', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are accepted'));
    }
  },
});

// ---------------------------------------------------------------------------
// Multer error-handling wrapper
// Multer errors (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE, fileFilter rejections)
// are passed to next(err) by Express but only if the route uses a proper
// error-handling middleware (4-argument form).  Wrapping the middleware here
// ensures those errors are caught and returned as JSON rather than falling
// through to the generic 404 handler.
// ---------------------------------------------------------------------------
const uploadMiddleware = (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      // MulterError has a .code property; plain Errors come from fileFilter
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: err.message || 'File upload error',
        code: err.code || 'UPLOAD_ERROR',
      });
    }
    next();
  });
};

// ---------------------------------------------------------------------------
// POST /upload
// ---------------------------------------------------------------------------
router.post('/upload', uploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const title = req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname));
  const clipName = req.body.clipName || req.body.clip_name || null;
  const videoPath = req.file.path;
  const FRAME_INTERVAL = parseInt(req.body.frameInterval, 10) || 1; // seconds

  let videoId;

  try {
    // ------------------------------------------------------------------
    // 1. Insert video record with status = 'pending' and respond immediately
    // ------------------------------------------------------------------
    const videoInsert = await db.query(
      `INSERT INTO videos (title, clip_name, file_path, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [title, clipName, videoPath]
    );
    videoId = videoInsert.rows[0].id;

    logger.info(`Video record created: ${videoId} – "${title}"`);

    // Respond immediately so the client isn't left waiting for the full
    // indexing pipeline (which can take minutes for long videos).
    res.json({
      videoId,
      status: 'pending',
      frameCount: 0,
      message: 'Upload accepted. Indexing will begin shortly.',
    });
  } catch (err) {
    logger.error('Upload DB insert error:', err.message);
    return res.status(500).json({ error: 'Failed to create video record', details: err.message });
  }

  // --------------------------------------------------------------------
  // 2. Run the indexing pipeline as a fire-and-forget background job.
  //    The response has already been sent above; errors here are logged
  //    and the video record is marked 'failed' but never reach the client.
  // --------------------------------------------------------------------
  (async () => {
    try {
      // Mark as processing now that the background job has started
      await db.query(
        `UPDATE videos SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [videoId]
      );

      // ------------------------------------------------------------------
      // 3. Extract frames
      // ------------------------------------------------------------------
      const framesDir = path.join('/tmp', 'scenefinder', 'frames', videoId);
      const framePaths = await extractFrames(videoPath, framesDir, FRAME_INTERVAL);

      // ------------------------------------------------------------------
      // 4. Generate embeddings and persist each frame
      // ------------------------------------------------------------------
      let indexedCount = 0;
      for (let i = 0; i < framePaths.length; i++) {
        const framePath = framePaths[i];
        const timestampSeconds = i * FRAME_INTERVAL;

        try {
          const { embedding, description } = await generateImageEmbedding(framePath);

          await db.query(
            `INSERT INTO frames (video_id, timestamp_seconds, description, embedding, thumbnail_path)
             VALUES ($1, $2, $3, $4, $5)`,
            [videoId, timestampSeconds, description, JSON.stringify(embedding), framePath]
          );
          indexedCount++;
        } catch (frameErr) {
          logger.warn(`Skipping frame ${i} for video ${videoId}: ${frameErr.message}`);
        }
      }

      // ------------------------------------------------------------------
      // 5. Mark video as ready and update frame count
      // ------------------------------------------------------------------
      await db.query(
        `UPDATE videos
         SET status = 'ready', frame_count = $1, updated_at = NOW()
         WHERE id = $2`,
        [indexedCount, videoId]
      );

      // ------------------------------------------------------------------
      // 6. Refresh index_status aggregate row
      // ------------------------------------------------------------------
      await db.query(`
        UPDATE index_status
        SET
          total_videos   = (SELECT COUNT(*) FROM videos),
          total_frames   = (SELECT COUNT(*) FROM frames),
          indexed_frames = (SELECT COUNT(*) FROM frames WHERE embedding IS NOT NULL),
          last_updated   = NOW()
        WHERE id = (SELECT id FROM index_status ORDER BY id LIMIT 1)
      `);

      logger.info(`Video ${videoId} indexed: ${indexedCount}/${framePaths.length} frames`);
    } catch (err) {
      logger.error(`Background indexing error for video ${videoId}:`, err.message);

      // Mark the video as failed so the client can detect it via index-status
      await db.query(
        `UPDATE videos SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [videoId]
      ).catch(() => {});
    }
  })();
});

module.exports = router;
