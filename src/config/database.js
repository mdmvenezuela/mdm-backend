const { Pool } = require('pg');

// ❌ NO cargar dotenv en producción
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está definida');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en PostgreSQL:', err);
  process.exit(1);
});

module.exports = pool;
