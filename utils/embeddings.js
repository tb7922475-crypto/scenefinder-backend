require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./logger');

// Accept either GEMINI_API_KEY (preferred) or the legacy GOOGLE_API_KEY
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Generate a text embedding vector using the text-embedding-004 model.
 * @param {string} text - The input text to embed
 * @returns {Promise<number[]>} The embedding vector as an array of numbers
 */
const generateEmbedding = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    logger.error('Text embedding generation error:', err.message);
    throw err;
  }
};

/**
 * Generate an image embedding vector using the Gemini Vision API.
 * The image is read from disk, base64-encoded, and sent to the model.
 * @param {string} imagePath - Absolute or relative path to the image file
 * @returns {Promise<number[]>} The embedding vector as an array of numbers
 */
const generateImageEmbedding = async (imagePath) => {
  try {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

    // Use gemini-pro-vision to generate a rich description, then embed that text.
    // The text-embedding-004 model does not accept raw image bytes directly.
    const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const visionResult = await visionModel.generateContent([
      {
        inlineData: { data: base64Image, mimeType },
      },
      'Describe this video frame in detail for semantic search indexing.',
    ]);
    const description = visionResult.response.text();

    // Embed the description text
    const embedding = await generateEmbedding(description);
    return { embedding, description };
  } catch (err) {
    logger.error('Image embedding generation error:', err.message);
    throw err;
  }
};

module.exports = { generateEmbedding, generateImageEmbedding };
