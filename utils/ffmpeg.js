const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const logger = require('./logger');

// Point fluent-ffmpeg at the bundled static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Extract frames from a video file at a regular interval.
 *
 * @param {string} videoPath   - Absolute path to the source video file
 * @param {string} outputDir   - Directory where extracted frame images are saved
 * @param {number} [interval=1] - Interval in seconds between extracted frames
 * @returns {Promise<string[]>} Sorted array of absolute paths to the extracted frame images
 */
const extractFrames = (videoPath, outputDir, interval = 1) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      return reject(new Error(`Video file not found: ${videoPath}`));
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const filenamePattern = 'frame-%04d.jpg';

    logger.info(`Extracting frames from ${path.basename(videoPath)} every ${interval}s → ${outputDir}`);

    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=1/${interval}`,   // one frame every <interval> seconds
        '-q:v 2',                  // JPEG quality (2 = high quality, low compression)
      ])
      .output(path.join(outputDir, filenamePattern))
      .on('end', () => {
        try {
          const files = fs
            .readdirSync(outputDir)
            .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
            .sort()
            .map((f) => path.join(outputDir, f));

          logger.info(`Extracted ${files.length} frames from ${path.basename(videoPath)}`);
          resolve(files);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        logger.error('FFmpeg frame extraction error:', err.message);
        reject(err);
      })
      .run();
  });
};

module.exports = { extractFrames };
