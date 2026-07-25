const mysql = require('mysql2/promise');

function createDatabasePool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
  const databaseUrl = new URL(process.env.DATABASE_URL);
  return mysql.createPool({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true
  });
}

module.exports = { createDatabasePool };
