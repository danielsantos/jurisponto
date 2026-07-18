require('dotenv').config();

const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 3000;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
const databaseUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.replace(/^\//, ''),
  waitForConnections: true,
  connectionLimit: 10
});
const formatDueDate = (dueDate) => {
  if (!dueDate) return 'Sem prazo';
  const date = dueDate instanceof Date ? dueDate : new Date(`${dueDate}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
};

app.use(express.json());

const toCase = (row) => ({
  id: row.id,
  client: row.client_name,
  initials: row.client_name.split(' ').map((part) => part[0]).slice(0, 2).join(''),
  color: row.avatar_color,
  title: row.title,
  status: row.status,
  type: row.status_key,
  docs: [Number(row.completed_documents), Number(row.total_documents)],
  due: formatDueDate(row.due_date)
});

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) { next(error); }
});

app.get('/api/cases', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.title, c.status, c.status_key, c.due_date, cl.name AS client_name, cl.avatar_color,
        COUNT(CASE WHEN d.status = 'received' THEN 1 END) AS completed_documents,
        COUNT(d.id) AS total_documents
      FROM cases c
      JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN documents d ON d.case_id = c.id
      GROUP BY c.id, cl.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows.map(toCase));
  } catch (error) { next(error); }
});

app.post('/api/cases', async (req, res, next) => {
  const { client, title, dueDate } = req.body;
  if (!client?.trim() || !title?.trim()) return res.status(400).json({ error: 'Cliente e título do caso são obrigatórios.' });
  const db = await pool.getConnection();
  try {
    await db.query('BEGIN');
    await db.query(
      `INSERT INTO clients (id, name) VALUES (UUID(), ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [client.trim()]
    );
    const [clientRows] = await db.query('SELECT id, name, avatar_color FROM clients WHERE name = ?', [client.trim()]);
    const caseId = (await db.query('SELECT UUID() AS id'))[0][0].id;
    await db.query(
      `INSERT INTO cases (id, client_id, title, due_date) VALUES (?, ?, ?, ?)`,
      [caseId, clientRows[0].id, title.trim(), dueDate || null]
    );
    const [caseRows] = await db.query('SELECT id, title, status, status_key, due_date FROM cases WHERE id = ?', [caseId]);
    await db.query('COMMIT');
    res.status(201).json(toCase({ ...caseRows[0], client_name: clientRows[0].name, avatar_color: clientRows[0].avatar_color, completed_documents: 0, total_documents: 0 }));
  } catch (error) {
    await db.query('ROLLBACK'); next(error);
  } finally { db.release(); }
});

app.get('/api/documents/pending', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.id, d.name, d.status, d.requested_at, c.title AS case_title, cl.name AS client_name
      FROM documents d JOIN cases c ON c.id = d.case_id JOIN clients cl ON cl.id = c.client_id
      WHERE d.status = 'pending' ORDER BY d.requested_at ASC
    `);
    res.json(rows.map((row, index) => ({
      id: row.id, name: row.name, case: row.case_title, client: row.client_name,
      late: index === 0, requestedAt: row.requested_at
    })));
  } catch (error) { next(error); }
});

app.post('/api/documents/:id/remind', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `UPDATE documents SET last_reminded_at = NOW() WHERE id = ? AND status = 'pending'`,
      [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Documento pendente não encontrado.' });
    res.json({ id: req.params.id, remindedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Não foi possível concluir esta operação.' });
});

app.get('/styles.css', (_req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/marketing.css', (_req, res) => res.sendFile(path.join(__dirname, 'marketing.css')));
app.get('/marketing.js', (_req, res) => res.sendFile(path.join(__dirname, 'marketing.js')));
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.listen(port, () => console.log(`JurisPonto disponível em http://localhost:${port}`));
