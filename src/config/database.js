const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.EPIDEMIO_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Conectado a PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('❌ Error en pool PostgreSQL:', err.message);
});

module.exports = pool;
