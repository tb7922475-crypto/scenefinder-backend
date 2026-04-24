require('dotenv').config();

const express = require('express');
const cors = require('cors');

const libraryRoutes = require('./routes/library');
const searchRoutes = require('./routes/search');

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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`SceneFinder backend running on port ${PORT}`);
});

module.exports = app;
