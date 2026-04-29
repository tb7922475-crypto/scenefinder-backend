require('dotenv').config();

const { Pool } = require('pg');

// Prefer DATABASE_URL (Railway / Heroku style) but fall back to individual vars
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT, 10) || 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

pool.on('error', (err) => {
  console.error('[SceneFinder] Unexpected PostgreSQL client error:', err);
});

/**
 * Execute a SQL query against the PostgreSQL pool.
 * @param {string} text - SQL query string (use $1, $2, ... for parameters)
 * @param {Array} [params] - Query parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error('[SceneFinder] Database query error:', err);
    throw err;
  }
};

/**
 * Create all required tables if they do not already exist.
 * Called once at server startup.
 */
const initSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      anime_title TEXT,
      clip_name   TEXT,
      file_path   TEXT,
      drive_link  TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      frame_count INTEGER DEFAULT 0,
      duration_seconds NUMERIC DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Add columns if they don't exist (for existing databases)
    DO $$ BEGIN
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS anime_title TEXT;
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS drive_link TEXT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS frames (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id         UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      timestamp_seconds NUMERIC NOT NULL,
      description      TEXT,
      embedding        TEXT,
      thumbnail_path   TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS index_status (
      id              SERIAL PRIMARY KEY,
      total_videos    INTEGER DEFAULT 0,
      total_frames    INTEGER DEFAULT 0,
      indexed_frames  INTEGER DEFAULT 0,
      last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Seed a single index_status row if none exists
    INSERT INTO index_status (total_videos, total_frames, indexed_frames)
    SELECT 0, 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM index_status);
  `);
  console.log('[SceneFinder] Database schema initialised');
};

module.exports = { query, pool, initSchema };
