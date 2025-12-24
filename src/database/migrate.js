const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );

  await pool.query(sql);
  console.log('✅ Migraciones aplicadas correctamente');
}

module.exports = migrate;
