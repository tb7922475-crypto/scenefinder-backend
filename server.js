require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initSchema } = require('./db');
const logger = require('./utils/logger');

logger.info('Loading route modules...');
logger.info('Loading library routes');
const libraryRoutes = require('./routes/library');
logger.info('Loading search routes');
const searchRoutes = require('./routes/search');
logger.info('Loading upload routes');
const uploadRoutes = require('./routes/upload');
logger.info('Loading index_status routes');
const indexStatusRoutes = require('./routes/index_status');
logger.info('All route modules loaded');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration – must be registered before any routes so that OPTIONS
// preflight requests (sent by browsers before multipart/form-data POSTs) are
// handled correctly and never reach the route layer as a 405.
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

// Respond to all OPTIONS preflight requests before any other middleware runs.
app.options('*', cors(corsOptions));

// Apply CORS headers to every subsequent request.
app.use(cors(corsOptions));

// Body parsers – after CORS so preflight never hits these.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger – runs before any route handler so every inbound request
// is visible in the logs regardless of which handler (or 404) it reaches.
app.use((req, _res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`);
  next();
});

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
logger.info('Registering /api routes...');
logger.info('Registering library routes at /api');
app.use('/api', libraryRoutes);
logger.info('Registering search routes at /api');
app.use('/api', searchRoutes);
logger.info('Registering upload routes at /api');
app.use('/api', uploadRoutes);
logger.info('Registering index_status routes at /api');
app.use('/api', indexStatusRoutes);
logger.info('All /api routes registered');

logger.info('Routes registered: GET /api/library, POST /api/search, POST /api/upload, GET /api/index-status');

// 404 handler
app.use((req, res) => {
  logger.warn(`404 handler hit: ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`);
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
