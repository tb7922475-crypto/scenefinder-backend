require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const logger = require('./logger');

// Accept either GEMINI_API_KEY (preferred) or the legacy GOOGLE_API_KEY
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey });

/**
 * Generate a text embedding vector using the gemini-embedding-001 model.
 * @param {string} text - The input text to embed
 * @returns {Promise<number[]>} The embedding vector as an array of numbers
 */
const generateEmbedding = async (text) => {
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
    });
    return result.embeddings[0].values;
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

    // Use gemini-2.0-flash to generate a rich description, then embed that text.
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: 'Describe this video frame in detail for semantic search indexing.' },
          ],
        },
      ],
    });
    const description = result.text;

    // Embed the description text
    const embedding = await generateEmbedding(description);
    return { embedding, description };
  } catch (err) {
    logger.error('Image embedding generation error:', err.message);
    throw err;
  }
};

module.exports = { generateEmbedding, generateImageEmbedding };
