require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

/**
 * Execute a SQL query against the PostgreSQL pool.
 * @param {string} text - SQL query string (use $1, $2, ... for parameters)
 * @param {Array} params - Query parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};

module.exports = { query, pool };
