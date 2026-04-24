require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initSchema } = require('./db');
const logger = require('./utils/logger');
const libraryRoutes = require('./routes/library');
const searchRoutes = require('./routes/search');
const uploadRoutes = require('./routes/upload');
const indexStatusRoutes = require('./routes/index_status');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'scenefinder-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api', libraryRoutes);
app.use('/api', searchRoutes);
app.use('/api', uploadRoutes);
app.use('/api', indexStatusRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Initialize DB schema then start server
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`SceneFinder backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize database schema:', err);
    process.exit(1);
  });

module.exports = app;
