require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { createDatabasePool } = require('./database');

async function migrate() {
  const pool = createDatabasePool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const migrationsDirectory = path.join(__dirname, 'db', 'migrations');
  const files = (await fs.readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();

  for (const filename of files) {
    const [alreadyApplied] = await pool.query('SELECT filename FROM schema_migrations WHERE filename = ?', [filename]);
    if (alreadyApplied.length) continue;
    const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
      await connection.commit();
      console.log(`Aplicada: ${filename}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  await pool.end();
}

if (require.main === module) {
  migrate().catch((error) => { console.error('Falha ao aplicar migrations:', error); process.exitCode = 1; });
}

module.exports = { migrate };
