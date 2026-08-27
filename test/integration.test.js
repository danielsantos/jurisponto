const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL deve apontar para o banco exclusivo de testes. Execute npm run test:integration:db primeiro.');
}

const { migrate } = require('../migrate');
const { createDatabasePool } = require('../database');

let appServer;
let app;
let pool;
let baseUrl;
let ensureUploadsDirectory;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDatabase({ timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const connectionPool = createDatabasePool();
    try {
      await connectionPool.query('SELECT 1');
      await connectionPool.end();
      return;
    } catch (error) {
      lastError = error;
      await connectionPool.end().catch(() => {});
      await wait(1000);
    }
  }
  throw new Error(`O MySQL de testes não ficou disponível em ${timeoutMs / 1000}s: ${lastError?.message || 'erro desconhecido'}`);
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie');
  return value ? value.split(';', 1)[0] : null;
}

async function request(path, { method = 'GET', body, cookie, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined)
  });
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    cookie: cookieFrom(response),
    body: contentType.includes('application/json') ? await response.json() : await response.text()
  };
}

async function createVerifiedOffice(label) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `teste.${suffix}@example.test`;
  const password = 'SenhaSegura123';
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    body: { name: `Responsavel ${label}`, office: `Teste integracao ${label} ${suffix}`, email, password, privacyAccepted: true }
  });
  assert.equal(signup.status, 201);
  assert.match(signup.body.data.developmentCode, /^\d{6}$/);

  const verification = await request('/api/auth/verify-email', {
    method: 'POST',
    body: { email, code: signup.body.data.developmentCode }
  });
  assert.equal(verification.status, 200);
  assert.ok(verification.cookie, 'a verificacao deve criar a sessao HTTP-only');
  return { email, password, cookie: verification.cookie, userId: signup.body.data.user.id };
}

async function cleanupTestData() {
  const [offices] = await pool.query("SELECT id FROM offices WHERE name LIKE 'Teste integracao %'");
  if (!offices.length) return;
  const ids = offices.map((office) => office.id);
  const marks = ids.map(() => '?').join(', ');
  const [files] = await pool.query(
    `SELECT d.file_path FROM documents d JOIN cases c ON c.id = d.case_id JOIN clients cl ON cl.id = c.client_id
     WHERE cl.office_id IN (${marks}) AND d.file_path IS NOT NULL`, ids
  );
  await Promise.all(files.map(({ file_path: filePath }) => {
    const fileName = path.basename(filePath);
    return fs.unlink(path.join(__dirname, '..', 'uploads', fileName)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }));
  await pool.query(`DELETE FROM financial_entries WHERE office_id IN (${marks})`, ids);
  await pool.query(`DELETE c FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE cl.office_id IN (${marks})`, ids);
  await pool.query(`DELETE FROM clients WHERE office_id IN (${marks})`, ids);
  await pool.query(`DELETE FROM offices WHERE id IN (${marks})`, ids);
}

test.before(async () => {
  await waitForDatabase();
  await migrate();
  ({ app, pool, ensureUploadsDirectory } = require('../server'));
  await ensureUploadsDirectory();
  await new Promise((resolve) => { appServer = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
  await cleanupTestData();
});

test.after(async () => {
  if (pool) await cleanupTestData();
  if (appServer) await new Promise((resolve, reject) => appServer.close((error) => error ? reject(error) : resolve()));
  if (pool) await pool.end();
});

test('versao publicada: endpoint publico identifica a entrega em execucao', async () => {
  const version = await request('/api/version');
  assert.equal(version.status, 200);
  assert.equal(version.body.data.version, require('../release').version);
  assert.equal(version.body.data.build, require('../release').build);
});

test('fluxo crítico: cadastro, verificação, recuperação e invalidação de sessão', async () => {
  const account = await createVerifiedOffice('autenticacao');

  const currentUser = await request('/api/auth/me', { cookie: account.cookie });
  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.data.user.email, account.email);

  const resetRequest = await request('/api/auth/request-password-reset', {
    method: 'POST', body: { email: account.email }
  });
  assert.equal(resetRequest.status, 200);
  const reset = await request('/api/auth/reset-password', {
    method: 'POST',
    body: { email: account.email, code: resetRequest.body.data.developmentCode, password: 'NovaSenha123' }
  });
  assert.equal(reset.status, 200);

  const oldSession = await request('/api/auth/me', { cookie: account.cookie });
  assert.equal(oldSession.status, 401, 'a troca de senha deve revogar sessões anteriores');
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email: account.email, password: 'NovaSenha123' }
  });
  assert.equal(login.status, 200);
  assert.ok(login.cookie);

  const logout = await request('/api/auth/logout', { method: 'POST', cookie: login.cookie });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.data.message, 'Sessao encerrada com sucesso.');
  assert.match(logout.cookie || '', /^rota_do_caso_session=/, 'o logout deve limpar o cookie de sessao');

  const revokedSession = await request('/api/auth/me', { cookie: login.cookie });
  assert.equal(revokedSession.status, 401, 'uma sessao encerrada nao pode acessar a area autenticada');
});

test('privacidade: exige aceite, registra solicitações e protege a exportação', async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const rejectedSignup = await request('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Sem aceite', office: `Teste integracao sem aceite ${suffix}`, email: `sem.aceite.${suffix}@example.test`, password: 'SenhaSegura123' }
  });
  assert.equal(rejectedSignup.status, 400);

  const privacyRequest = await request('/api/privacy/requests', {
    method: 'POST', body: { name: 'Titular de teste', email: `titular.${suffix}@example.test`, type: 'access', message: 'Solicito confirmação dos dados tratados.' }
  });
  assert.equal(privacyRequest.status, 201);

  const account = await createVerifiedOffice('privacidade');
  const exportResponse = await fetch(`${baseUrl}/api/privacy/export`, { headers: { cookie: account.cookie } });
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json();
  assert.equal(exported.office.name.startsWith('Teste integracao privacidade'), true);
  assert.equal(exported.users.length, 1);
});

test('fluxo crítico: isolamento de escritórios, documentos e financeiro', async () => {
  const officeA = await createVerifiedOffice('alfa');
  const officeB = await createVerifiedOffice('beta');
  const client = await request('/api/clients', {
    method: 'POST', cookie: officeA.cookie,
    body: { name: 'Cliente de teste', email: 'cliente.teste@example.test', phone: '+55 11 99999-9999' }
  });
  assert.equal(client.status, 201);
  assert.equal(client.body.data.phone, '5511999999999');

  const caseResponse = await request('/api/cases', {
    method: 'POST', cookie: officeA.cookie,
    body: { clientId: client.body.data.id, title: 'Caso de integração', dueDate: '2026-12-31' }
  });
  assert.equal(caseResponse.status, 201);

  const forbiddenClient = await request(`/api/clients/${client.body.data.id}`, { cookie: officeB.cookie });
  assert.equal(forbiddenClient.status, 404);
  const forbiddenCase = await request(`/api/cases/${caseResponse.body.data.id}`, { cookie: officeB.cookie });
  assert.equal(forbiddenCase.status, 404);

  const document = await request('/api/documents/request', {
    method: 'POST', cookie: officeA.cookie,
    body: { caseId: caseResponse.body.data.id, name: 'Documento de identidade' }
  });
  assert.equal(document.status, 201);
  const foreignDownload = await request(`/api/documents/${document.body.data.id}/download`, { cookie: officeB.cookie });
  assert.equal(foreignDownload.status, 404);

  const form = new FormData();
  form.set('file', new Blob(['%PDF-1.7\nTeste de documento'], { type: 'application/pdf' }), 'identidade.pdf');
  const uploaded = await request(`/api/documents/${document.body.data.id}/upload`, { method: 'POST', cookie: officeA.cookie, form });
  assert.equal(uploaded.status, 200);
  const downloaded = await fetch(`${baseUrl}/api/documents/${document.body.data.id}/download`, { headers: { cookie: officeA.cookie } });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), '%PDF-1.7\nTeste de documento');

  const financial = await request('/api/financial', {
    method: 'POST', cookie: officeA.cookie,
    body: { description: 'Honorários', type: 'income', amount: '1500,00', dueDate: '2026-12-31', installments: 2, clientId: client.body.data.id, caseId: caseResponse.body.data.id }
  });
  assert.equal(financial.status, 201);
  assert.equal(financial.body.data.length, 2);
  const ownEntries = await request('/api/financial', { cookie: officeA.cookie });
  assert.equal(ownEntries.status, 200);
  assert.equal(ownEntries.body.data.length, 2);
  const foreignEntries = await request('/api/financial', { cookie: officeB.cookie });
  assert.equal(foreignEntries.status, 200);
  assert.equal(foreignEntries.body.data.length, 0);
});
