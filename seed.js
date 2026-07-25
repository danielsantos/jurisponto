require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { createDatabasePool } = require('./database');

function parseSeedName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('Informe o nome do seed. Exemplo: npm run seed -- demo');
  }
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    throw new Error('Informe um seed valido. Exemplo: npm run seed:demo');
  }
  return normalized;
}

async function runSeed() {
  const seedName = parseSeedName(process.argv[2]);
  const seedPath = path.join(__dirname, 'db', 'seeds', `${seedName}.sql`);
  const sql = await fs.readFile(seedPath, 'utf8');
  const pool = createDatabasePool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(sql);
    await connection.commit();
    console.log(`Seed aplicada: ${seedName}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runSeed().catch((error) => {
  console.error('Falha ao aplicar seed:', error.message || error);
  process.exitCode = 1;
});
