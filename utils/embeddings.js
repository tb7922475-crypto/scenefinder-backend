require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

/**
 * Generate an embedding vector for the given text using the Google Generative AI API.
 * @param {string} text - The input text to embed
 * @returns {Promise<number[]>} The embedding vector as an array of numbers
 */
const generateEmbedding = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    console.error('Embedding generation error:', err);
    throw err;
  }
};

module.exports = { generateEmbedding };
