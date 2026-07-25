require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs/promises');
const syncFs = require('fs');
const multer = require('multer');
const { createDatabasePool } = require('./database');
const { sendVerificationEmail, sendPasswordResetEmail } = require('./email-service');
const {
  buildMeta,
  createRequirePermission,
  getCaseScope,
  getPermissions,
  isValidUuid,
  parseUuidParam,
  readCookies,
  readSessionToken,
  sanitizeTextInput,
  sendError
} = require('./server-helpers');

const app = express();
const port = process.env.PORT || 3000;
const pool = createDatabasePool();
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const verificationCodeDuration = 15 * 60 * 1000;
const uploadsDirectory = path.join(__dirname, 'uploads');
const logsDirectory = path.join(__dirname, 'logs');
const logDestination = (process.env.LOG_DESTINATION || 'console').toLowerCase();
const logFilePath = process.env.LOG_FILE_PATH
  ? path.resolve(__dirname, process.env.LOG_FILE_PATH)
  : path.join(logsDirectory, 'app.log');
const allowedRoles = new Set(['admin', 'lawyer', 'assistant', 'client']);
const allowedUploadMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const phonePattern = /^[0-9+\-() ]{8,30}$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDirectory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname || '').slice(0, 12);
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  fileFilter: (_req, file, callback) => {
    if (!allowedUploadMimeTypes.has(file.mimetype)) {
      return callback(new Error('Tipo de arquivo nao permitido. Envie PDF, PNG, JPG, DOC ou DOCX.'));
    }
    return callback(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const roleLabels = {
  admin: 'Administrador',
  lawyer: 'Advogado',
  assistant: 'Assistente',
  client: 'Cliente'
};

const caseStatusLabels = {
  waiting: 'Aguardando cliente',
  review: 'Em analise',
  done: 'Concluido'
};

const allowedCaseStatusKeys = new Set(Object.keys(caseStatusLabels));
const allowedDocumentStatuses = new Set(['pending', 'received', 'rejected']);

const permissionMap = {
  admin: {
    manageOfficeUsers: true,
    createCases: true,
    viewAllOfficeCases: true,
    sendDocumentReminders: true,
    accessSettings: true
  },
  lawyer: {
    manageOfficeUsers: false,
    createCases: true,
    viewAllOfficeCases: true,
    sendDocumentReminders: true,
    accessSettings: false
  },
  assistant: {
    manageOfficeUsers: false,
    createCases: true,
    viewAllOfficeCases: true,
    sendDocumentReminders: true,
    accessSettings: false
  },
  client: {
    manageOfficeUsers: false,
    createCases: false,
    viewAllOfficeCases: false,
    sendDocumentReminders: false,
    accessSettings: false
  }
};

const formatDueDate = (dueDate) => {
  if (!dueDate) return 'Sem prazo';
  const date = dueDate instanceof Date ? dueDate : new Date(`${dueDate}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
};

const hashVerificationCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
const createVerificationCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');
const hashSessionToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = (value) => sanitizeTextInput(value, 255).toLowerCase();
const isValidEmail = (value) => emailPattern.test(value || '');
const sanitizeAvatarColor = (value) => hexColorPattern.test(value || '') ? value : '#a7c3b1';

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildRequestContext(req) {
  return {
    requestId: req.requestId,
    method: req.method,
    route: req.originalUrl || req.url,
    officeId: req.user?.office_id || null,
    userId: req.user?.id || null
  };
}

function getRequestIp(req) {
  const forwardedFor = sanitizeTextInput(req.headers['x-forwarded-for'], 255);
  const candidate = forwardedFor.split(',')[0] || req.ip || req.socket?.remoteAddress || '';
  return sanitizeTextInput(candidate, 45) || null;
}

function getRequestUserAgent(req) {
  return sanitizeTextInput(req.headers['user-agent'], 500) || null;
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
    stack: error.stack
  };
}

function writeStructuredLog(entry) {
  const line = `${JSON.stringify(entry)}\n`;
  if (logDestination === 'file') {
    syncFs.appendFile(logFilePath, line, (error) => {
      if (error) process.stderr.write(`[logger] Falha ao gravar log em arquivo: ${error.message}\n`);
    });
    return;
  }
  if (entry.level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
}

function logEvent(level, event, context = {}, extra = {}) {
  writeStructuredLog({
    timestamp: new Date().toISOString(),
    service: 'jurisponto-api',
    environment: process.env.NODE_ENV || 'development',
    level,
    event,
    ...context,
    ...extra
  });
}

function sendSuccess(req, res, { status = 200, data = null, meta = {} } = {}) {
  return res.status(status).json({
    data,
    meta: buildMeta(req, meta),
    error: null
  });
}

function parsePositiveInt(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parsePaginationParams(query, { defaultPage = 1, defaultPageSize = 20, maxPageSize = 100 } = {}) {
  const page = parsePositiveInt(query.page, defaultPage, { min: 1, max: 100000 });
  const pageSize = parsePositiveInt(query.pageSize, defaultPageSize, { min: 1, max: maxPageSize });
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function buildPaginationMeta({ page, pageSize, totalItems }) {
  const safeTotalItems = Number(totalItems || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / pageSize));
  return {
    pagination: {
      page,
      pageSize,
      totalItems: safeTotalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

function parseSearchTerm(value, maxLength = 100) {
  const normalized = sanitizeTextInput(value, maxLength);
  return normalized || '';
}

function buildLikePattern(value) {
  return `%${value}%`;
}

function parseRequiredText(value, label, { min = 2, max = 255 } = {}) {
  const normalized = sanitizeTextInput(value, max);
  if (!normalized || normalized.length < min) {
    throw new Error(label);
  }
  return normalized;
}

function parseOptionalDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Informe uma data valida no formato AAAA-MM-DD.');
  }
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Informe uma data valida no formato AAAA-MM-DD.');
  }
  return value;
}

function parseOptionalEmail(value) {
  if (value == null || value === '') return null;
  const normalized = normalizeEmail(value);
  if (!isValidEmail(normalized)) {
    throw new Error('Informe um e-mail valido.');
  }
  return normalized;
}

function parseOptionalPhone(value) {
  if (value == null || value === '') return null;
  const normalized = sanitizeTextInput(value, 40);
  if (!phonePattern.test(normalized)) {
    throw new Error('Informe um telefone valido.');
  }
  return normalized;
}

function parseOptionalDocumentId(value) {
  if (value == null || value === '') return null;
  const normalized = sanitizeTextInput(value, 40);
  if (normalized.length < 5) {
    throw new Error('Informe um documento valido.');
  }
  return normalized;
}

function parsePassword(value, { min = 8, max = 128, required = true } = {}) {
  if (value == null || value === '') {
    if (!required) return null;
    throw new Error(`A senha precisa ter entre ${min} e ${max} caracteres.`);
  }
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new Error(`A senha precisa ter entre ${min} e ${max} caracteres.`);
  }
  return value;
}

function parseRole(value) {
  const role = sanitizeTextInput(value, 20);
  if (!allowedRoles.has(role)) throw new Error('Perfil invalido.');
  return role;
}

function parseCaseStatusKey(value) {
  const normalized = sanitizeTextInput(value, 20);
  if (!allowedCaseStatusKeys.has(normalized)) throw new Error('Status do caso invalido.');
  return normalized;
}

function parseDocumentStatus(value) {
  const normalized = sanitizeTextInput(value, 20);
  if (!allowedDocumentStatuses.has(normalized)) throw new Error('Status do documento invalido.');
  return normalized;
}

function parseOptionalUuid(value, label) {
  if (value == null || value === '') return null;
  return parseUuidParam(value, label);
}

function parseChecklistItems(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new Error('Informe ao menos um item de checklist.');
  }

  const items = value
    .map((item, index) => ({
      name: parseRequiredText(item?.name ?? item, `Item ${index + 1} invalido.`, { min: 2, max: 500 }),
      required: item?.required !== false
    }))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase()) === index);

  if (!items.length) {
    throw new Error('Informe ao menos um item de checklist.');
  }

  return items;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    office: user.office_name,
    role: user.role,
    roleLabel: roleLabels[user.role] || user.role,
    permissions: getPermissions(user.role),
    clientId: user.client_id || null,
    clientName: user.client_name || null
  };
}

function formatTeamUser(row) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    roleLabel: roleLabels[row.role] || row.role,
    clientName: row.client_name || null,
    verified: Boolean(row.email_verified_at),
    createdAt: row.created_at
  };
}

function formatClient(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    phone: row.phone || null,
    documentId: row.document_id || null,
    notes: row.notes || '',
    avatarColor: sanitizeAvatarColor(row.avatar_color),
    caseCount: Number(row.case_count || 0),
    activeCaseCount: Number(row.active_case_count || 0),
    createdAt: row.created_at || null
  };
}

function formatCaseTask(row) {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date || null,
    done: Boolean(row.is_done),
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null
  };
}

function formatChecklistTemplateItem(row) {
  return {
    id: row.id,
    name: row.name,
    required: Boolean(row.is_required),
    sortOrder: Number(row.sort_order || 0)
  };
}

function formatChecklistTemplate(row, items = []) {
  return {
    id: row.id,
    name: row.name,
    serviceType: row.service_type || '',
    description: row.description || '',
    itemCount: Number(row.item_count || items.length || 0),
    items
  };
}

function formatDocument(row) {
  return {
    id: row.id,
    name: row.name,
    caseId: row.case_id || null,
    case: row.case_title,
    client: row.client_name,
    late: row.status === 'pending' && Boolean(row.is_late),
    status: row.status,
    requestedAt: row.requested_at,
    remindedAt: row.last_reminded_at,
    fileName: row.file_name,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    reviewedAt: row.reviewed_at || null,
    statusNote: row.status_note || '',
    resendRequestedAt: row.resend_requested_at || null,
    resendNote: row.resend_note || '',
    templateName: row.template_name || null,
    rejected: row.status === 'rejected'
  };
}

function formatCaseUpdate(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    case: row.case_title,
    client: row.client_name,
    title: row.title,
    message: row.message,
    authorName: row.author_name || 'Equipe JurisPonto',
    createdAt: row.created_at
  };
}

function formatActivityItem(row) {
  return {
    type: row.item_type,
    caseId: row.case_id,
    case: row.case_title,
    client: row.client_name,
    title: row.title,
    message: row.message,
    createdAt: row.created_at
  };
}

async function ensureUploadsDirectory() {
  await fs.mkdir(uploadsDirectory, { recursive: true });
  if (logDestination === 'file') {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  }
}

async function upsertClient(db, officeId, clientName) {
  if (!clientName) return null;
  await db.query(
    `INSERT INTO clients (id, office_id, name) VALUES (UUID(), ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [officeId, clientName]
  );

  const [clientRows] = await db.query(
    'SELECT id, name, avatar_color FROM clients WHERE office_id = ? AND name = ?',
    [officeId, clientName]
  );

  return clientRows[0] || null;
}

async function fetchAssignableUsers(db, officeId) {
  const [rows] = await db.query(
    `SELECT id, full_name
     FROM users
     WHERE office_id = ? AND role IN ('admin', 'lawyer', 'assistant')
     ORDER BY full_name ASC`,
    [officeId]
  );
  return rows;
}

async function assertResponsibleUser(db, officeId, userId) {
  if (!userId) return null;
  const [rows] = await db.query(
    `SELECT id, full_name
     FROM users
     WHERE id = ? AND office_id = ? AND role IN ('admin', 'lawyer', 'assistant')
     LIMIT 1`,
    [userId, officeId]
  );
  if (!rows[0]) {
    throw new ApiError(400, 'INVALID_RESPONSIBLE_USER', 'Selecione um responsavel valido do escritorio.');
  }
  return rows[0];
}

async function fetchCaseSummary(db, user, caseId) {
  const scope = getCaseScope(user);
  const [rows] = await db.query(
    `SELECT c.id, c.client_id, c.title, c.status, c.status_key, c.due_date, c.internal_notes, c.archived_at,
            c.responsible_user_id, cl.name AS client_name, cl.avatar_color, u.full_name AS responsible_name,
            COUNT(CASE WHEN d.status = 'received' THEN 1 END) AS completed_documents,
            COUNT(d.id) AS total_documents,
            (
              SELECT ct.title
              FROM case_tasks ct
              WHERE ct.case_id = c.id AND ct.is_done = 0
              ORDER BY ct.sort_order ASC, ct.created_at ASC
              LIMIT 1
            ) AS next_task_title
     FROM cases c
     JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN users u ON u.id = c.responsible_user_id
     LEFT JOIN documents d ON d.case_id = c.id
     WHERE c.id = ? AND ${scope.clause}
     GROUP BY c.id, cl.id, u.id
     LIMIT 1`,
    [caseId, ...scope.params]
  );
  return rows[0] || null;
}

async function fetchCaseTasks(db, caseId) {
  const [rows] = await db.query(
    `SELECT id, title, due_date, is_done, completed_at, created_at
     FROM case_tasks
     WHERE case_id = ?
     ORDER BY is_done ASC, sort_order ASC, created_at ASC`,
    [caseId]
  );
  return rows.map(formatCaseTask);
}

async function fetchChecklistTemplateItems(db, templateId) {
  const [rows] = await db.query(
    `SELECT id, name, sort_order, is_required
     FROM document_checklist_template_items
     WHERE template_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [templateId]
  );
  return rows.map(formatChecklistTemplateItem);
}

async function fetchChecklistTemplates(db, officeId) {
  const [rows] = await db.query(
    `SELECT t.id, t.name, t.service_type, t.description, COUNT(i.id) AS item_count
     FROM document_checklist_templates t
     LEFT JOIN document_checklist_template_items i ON i.template_id = t.id
     WHERE t.office_id = ?
     GROUP BY t.id
     ORDER BY t.service_type ASC, t.name ASC`,
    [officeId]
  );

  const templates = [];
  for (const row of rows) {
    templates.push(formatChecklistTemplate(row, await fetchChecklistTemplateItems(db, row.id)));
  }
  return templates;
}

async function fetchCaseUpdates(db, user, { caseId = null, limit = 50 } = {}) {
  const scope = getCaseScope(user);
  const filters = [scope.clause];
  const params = [...scope.params];

  if (caseId) {
    filters.push('c.id = ?');
    params.push(caseId);
  }

  const [rows] = await db.query(
    `SELECT cu.id, cu.case_id, cu.title, cu.message, cu.created_at,
            c.title AS case_title, cl.name AS client_name, u.full_name AS author_name
     FROM case_updates cu
     JOIN cases c ON c.id = cu.case_id
     JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN users u ON u.id = cu.author_user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY cu.created_at DESC
     LIMIT ?`,
    [...params, limit]
  );

  return rows.map(formatCaseUpdate);
}

async function fetchActivityFeed(db, user, { limit = 50 } = {}) {
  const scope = getCaseScope(user);
  const limitValue = Number(limit);
  const [rows] = await db.query(
    `SELECT *
     FROM (
       SELECT
         'update' AS item_type,
         cu.case_id,
         c.title AS case_title,
         cl.name AS client_name,
         cu.title AS title,
         cu.message AS message,
         cu.created_at AS created_at
       FROM case_updates cu
       JOIN cases c ON c.id = cu.case_id
       JOIN clients cl ON cl.id = c.client_id
       WHERE ${scope.clause}

       UNION ALL

       SELECT
         'document' AS item_type,
         d.case_id,
         c.title AS case_title,
         cl.name AS client_name,
         CASE
           WHEN d.status = 'received' THEN 'Documento recebido'
           WHEN d.status = 'rejected' THEN 'Documento precisa de reenvio'
           ELSE 'Documento solicitado'
         END AS title,
         CASE
           WHEN d.status = 'received' THEN CONCAT(d.name, ' foi recebido pelo escritorio.')
           WHEN d.status = 'rejected' THEN CONCAT(d.name, ' precisa ser reenviado. ', COALESCE(d.resend_note, d.status_note, ''))
           ELSE CONCAT(d.name, ' esta pendente no checklist do caso.')
         END AS message,
         COALESCE(d.reviewed_at, d.uploaded_at, d.requested_at) AS created_at
       FROM documents d
       JOIN cases c ON c.id = d.case_id
       JOIN clients cl ON cl.id = c.client_id
       WHERE ${scope.clause}
     ) feed
     ORDER BY created_at DESC
     LIMIT ?`,
    [...scope.params, ...scope.params, limitValue]
  );

  return rows.map(formatActivityItem);
}

async function countOfficeAdmins(db, officeId) {
  const [[result]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM users
     WHERE office_id = ? AND role = 'admin'`,
    [officeId]
  );
  return Number(result.total || 0);
}

async function fetchDocumentById(user, documentId) {
  const scope = getCaseScope(user);
  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.status, d.requested_at, d.last_reminded_at, d.file_name, d.mime_type, d.file_size, d.uploaded_at,
            d.reviewed_at, d.status_note, d.resend_requested_at, d.resend_note, d.file_path,
            d.source_template_id, t.name AS template_name,
            c.id AS case_id, c.title AS case_title, cl.name AS client_name, cl.office_id
     FROM documents d
     JOIN cases c ON c.id = d.case_id
     JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN document_checklist_templates t ON t.id = d.source_template_id
     WHERE d.id = ? AND ${scope.clause}
     LIMIT 1`,
    [documentId, ...scope.params]
  );

  return rows[0] || null;
}

async function recordDocumentAudit(db, req, { documentId, officeId, action, metadata = null }) {
  const payload = metadata == null ? null : JSON.stringify(metadata);
  await db.query(
    `INSERT INTO document_audit_logs (
       id, document_id, office_id, actor_user_id, action, request_id, ip_address, user_agent, metadata
     ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      documentId,
      officeId,
      req.user?.id || null,
      action,
      req.requestId || null,
      getRequestIp(req),
      getRequestUserAgent(req),
      payload
    ]
  );
}

function clearSessionCookie(res) {
  res.clearCookie('jurisponto_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

async function createUserSession(db, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const [[sessionIdResult]] = await db.query('SELECT UUID() AS id');
  await db.query(
    `INSERT INTO user_sessions (id, user_id, office_id, session_token_hash, session_version, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionIdResult.id,
      user.id,
      user.office_id,
      hashSessionToken(token),
      Number(user.session_version || 0),
      new Date(Date.now() + sessionDuration)
    ]
  );
  return token;
}

async function revokeSessionByToken(token) {
  if (!token) return;
  await pool.query(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE session_token_hash = ? AND revoked_at IS NULL`,
    [hashSessionToken(token)]
  );
}

async function revokeAllUserSessions(db, userId) {
  await db.query(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

const requirePermission = createRequirePermission();

async function saveVerificationCode(db, userId) {
  const code = createVerificationCode();
  const expiresAt = new Date(Date.now() + verificationCodeDuration);
  await db.query(
    `INSERT INTO email_verification_codes (user_id, code_hash, expires_at, attempts, last_sent_at)
     VALUES (?, ?, ?, 0, NOW())
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, last_sent_at = NOW()`,
    [userId, hashVerificationCode(code), expiresAt]
  );
  return code;
}

async function savePasswordResetCode(db, userId) {
  const code = createVerificationCode();
  const expiresAt = new Date(Date.now() + verificationCodeDuration);
  await db.query(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts, last_sent_at)
     VALUES (?, ?, ?, 0, NOW())
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, last_sent_at = NOW()`,
    [userId, hashVerificationCode(code), expiresAt]
  );
  return code;
}

app.use(express.json());
app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  req.startedAt = Date.now();
  next();
});
app.use('/uploads', express.static(uploadsDirectory));

function setSessionCookie(res, token) {
  res.cookie('jurisponto_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionDuration,
    path: '/'
  });
}

async function requireAuth(req, res, next) {
  const sessionToken = readSessionToken(req);
  if (!sessionToken) {
    return sendError(req, res, {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Sua sessao expirou. Entre novamente para continuar.'
    });
  }

  try {
    const [users] = await pool.query(
      `SELECT u.id, u.office_id, u.client_id, u.full_name, u.email, u.role, u.email_verified_at, u.session_version, u.trial_ends_at,
              o.name AS office_name, cl.name AS client_name,
              s.id AS session_id, s.office_id AS session_office_id, s.session_version AS persisted_session_version, s.expires_at, s.revoked_at
       FROM users u
       JOIN offices o ON o.id = u.office_id
       JOIN user_sessions s ON s.user_id = u.id
       LEFT JOIN clients cl ON cl.id = u.client_id AND cl.office_id = u.office_id
       WHERE s.session_token_hash = ?
       LIMIT 1`,
      [hashSessionToken(sessionToken)]
    );

    const user = users[0];
    if (!user || user.revoked_at || new Date(user.expires_at) <= new Date() || !user.email_verified_at || user.office_id !== user.session_office_id || Number(user.session_version) !== Number(user.persisted_session_version || 0)) {
      clearSessionCookie(res);
      return sendError(req, res, {
        status: 401,
        code: 'INVALID_SESSION',
        message: 'Sua sessao nao e mais valida.'
      });
    }

    if (user.role === 'client' && !user.client_id) {
      return sendError(req, res, {
        status: 403,
        code: 'CLIENT_NOT_LINKED',
        message: 'Seu acesso de cliente ainda nao foi vinculado a um cadastro.'
      });
    }

    await pool.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = ?', [user.session_id]);
    req.user = user;
    req.sessionToken = sessionToken;
    next();
  } catch (error) {
    next(error);
  }
}

const toCase = (row) => ({
  id: row.id,
  clientId: row.client_id || null,
  client: row.client_name,
  initials: row.client_name.split(' ').map((part) => part[0]).slice(0, 2).join(''),
  color: sanitizeAvatarColor(row.avatar_color),
  title: row.title,
  status: row.status,
  type: row.status_key,
  dueDate: row.due_date || null,
  due: formatDueDate(row.due_date),
  docs: [Number(row.completed_documents), Number(row.total_documents)],
  responsibleUserId: row.responsible_user_id || null,
  responsibleName: row.responsible_name || null,
  internalNotes: row.internal_notes || '',
  archivedAt: row.archived_at || null,
  archived: Boolean(row.archived_at),
  nextTask: row.next_task_title || null
});

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    sendSuccess(_req, res, { data: { status: 'ok' } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/signup', async (req, res, next) => {
  let fullName;
  let officeName;
  let email;
  let password;
  try {
    fullName = parseRequiredText(req.body.name, 'Informe seu nome completo.', { min: 2, max: 255 });
    officeName = parseRequiredText(req.body.office, 'Informe o nome do escritorio.', { min: 2, max: 255 });
    email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) {
      return sendError(req, res, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Informe um e-mail profissional valido.'
      });
    }
    password = parsePassword(req.body.password);
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();

    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ? FOR UPDATE', [email]);
    if (existingUsers.length) {
      await db.rollback();
      return sendError(req, res, {
        status: 409,
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'Ja existe uma conta com este e-mail. Faca login para continuar.'
      });
    }

    const [[officeIdResult]] = await db.query('SELECT UUID() AS id');
    const [[userIdResult]] = await db.query('SELECT UUID() AS id');
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 12);

    await db.query('INSERT INTO offices (id, name) VALUES (?, ?)', [officeIdResult.id, officeName]);
    await db.query(
      `INSERT INTO users (id, office_id, full_name, email, password_hash, role, trial_ends_at)
       VALUES (?, ?, ?, ?, ?, 'admin', ?)`,
      [userIdResult.id, officeIdResult.id, fullName, email, passwordHash, trialEndsAt]
    );

    const verificationCode = await saveVerificationCode(db, userIdResult.id);
    await db.commit();

    const delivery = await sendVerificationEmail({ to: email, name: fullName, code: verificationCode });
    sendSuccess(req, res, {
      status: 201,
      data: {
        message: 'Conta criada. Confirme seu e-mail para continuar.',
        user: {
          id: userIdResult.id,
          name: fullName,
          email,
          office: officeName,
          role: 'admin',
          roleLabel: roleLabels.admin,
          permissions: getPermissions('admin')
        },
        trialEndsAt,
        requiresVerification: true,
        developmentCode: delivery.mode === 'development' ? verificationCode : undefined
      }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/auth/verify-email', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const code = sanitizeTextInput(req.body.code, 6);
  if (!email || !/^\d{6}$/.test(code || '')) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Informe o codigo de 6 digitos.'
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [records] = await db.query(
      `SELECT u.id, u.office_id, u.client_id, u.full_name, u.email_verified_at, u.session_version, v.code_hash, v.expires_at, v.attempts
       FROM users u JOIN email_verification_codes v ON v.user_id = u.id WHERE u.email = ? FOR UPDATE`,
      [email]
    );

    const record = records[0];
    if (!record || record.email_verified_at) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'VERIFICATION_CODE_INVALID',
        message: 'Codigo invalido ou ja utilizado.'
      });
    }

    if (new Date(record.expires_at) < new Date()) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'VERIFICATION_CODE_EXPIRED',
        message: 'Este codigo expirou. Solicite um novo envio.'
      });
    }

    if (record.attempts >= 5) {
      await db.rollback();
      return sendError(req, res, {
        status: 429,
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Muitas tentativas. Solicite um novo codigo.'
      });
    }

    if (hashVerificationCode(code) !== record.code_hash) {
      await db.query('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = ?', [record.id]);
      await db.commit();
      return sendError(req, res, {
        status: 400,
        code: 'VERIFICATION_CODE_MISMATCH',
        message: 'Codigo incorreto. Tente novamente.'
      });
    }

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await db.query('UPDATE users SET email_verified_at = NOW(), trial_started_at = NOW(), trial_ends_at = ? WHERE id = ?', [trialEndsAt, record.id]);
    await db.query('DELETE FROM email_verification_codes WHERE user_id = ?', [record.id]);
    const sessionToken = await createUserSession(db, record);
    await db.commit();

    setSessionCookie(res, sessionToken);
    sendSuccess(req, res, {
      data: {
        message: 'E-mail confirmado.',
        trialEndsAt
      }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/auth/resend-verification', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Informe seu e-mail.'
    });
  }

  const db = await pool.getConnection();
  try {
    const [users] = await db.query('SELECT id, full_name, email, email_verified_at FROM users WHERE email = ?', [email]);
    const user = users[0];
    if (!user || user.email_verified_at) {
      return sendSuccess(req, res, {
        data: { message: 'Se houver uma conta pendente, enviaremos um novo codigo.' }
      });
    }

    const [previousCodes] = await db.query('SELECT last_sent_at FROM email_verification_codes WHERE user_id = ?', [user.id]);
    if (previousCodes[0] && Date.now() - new Date(previousCodes[0].last_sent_at).getTime() < 60000) {
      return sendError(req, res, {
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Aguarde um minuto para solicitar outro codigo.'
      });
    }

    await db.beginTransaction();
    const generatedCode = await saveVerificationCode(db, user.id);
    await db.commit();

    const delivery = await sendVerificationEmail({ to: user.email, name: user.full_name, code: generatedCode });
    sendSuccess(req, res, {
      data: {
        message: 'Novo codigo criado.',
        developmentCode: delivery.mode === 'development' ? generatedCode : undefined
      }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/auth/request-password-reset', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const genericResponse = { message: 'Se houver uma conta com este e-mail, enviaremos um codigo de redefinicao.' };
  if (!isValidEmail(email)) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Informe seu e-mail.'
    });
  }

  const db = await pool.getConnection();
  try {
    const [users] = await db.query('SELECT id, full_name, email FROM users WHERE email = ? AND email_verified_at IS NOT NULL', [email]);
    const user = users[0];
    if (!user) return sendSuccess(req, res, { data: genericResponse });

    const [previousCodes] = await db.query('SELECT last_sent_at FROM password_reset_codes WHERE user_id = ?', [user.id]);
    if (previousCodes[0] && Date.now() - new Date(previousCodes[0].last_sent_at).getTime() < 60000) {
      return sendError(req, res, {
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Aguarde um minuto para solicitar outro codigo.'
      });
    }

    await db.beginTransaction();
    const generatedCode = await savePasswordResetCode(db, user.id);
    await db.commit();

    const delivery = await sendPasswordResetEmail({ to: user.email, name: user.full_name, code: generatedCode });
    sendSuccess(req, res, {
      data: {
        ...genericResponse,
        developmentCode: delivery.mode === 'development' ? generatedCode : undefined
      }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const code = sanitizeTextInput(req.body.code, 6);
  let password;
  try {
    password = parsePassword(req.body.password);
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }
  if (!email || !/^\d{6}$/.test(code || '')) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Informe o codigo de 6 digitos.'
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [records] = await db.query(
      `SELECT u.id, r.code_hash, r.expires_at, r.attempts
       FROM users u JOIN password_reset_codes r ON r.user_id = u.id WHERE u.email = ? FOR UPDATE`,
      [email]
    );

    const record = records[0];
    if (!record || new Date(record.expires_at) < new Date()) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'PASSWORD_RESET_CODE_INVALID',
        message: 'Codigo invalido ou expirado.'
      });
    }

    if (record.attempts >= 5) {
      await db.rollback();
      return sendError(req, res, {
        status: 429,
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Muitas tentativas. Solicite um novo codigo.'
      });
    }

    if (hashVerificationCode(code) !== record.code_hash) {
      await db.query('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ?', [record.id]);
      await db.commit();
      return sendError(req, res, {
        status: 400,
        code: 'PASSWORD_RESET_CODE_MISMATCH',
        message: 'Codigo incorreto. Tente novamente.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [passwordHash, record.id]);
    await revokeAllUserSessions(db, record.id);
    await db.query('DELETE FROM password_reset_codes WHERE user_id = ?', [record.id]);
    await db.commit();

    sendSuccess(req, res, {
      data: { message: 'Senha redefinida. Entre com sua nova senha.' }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : null;
  if (!isValidEmail(email) || !password) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Informe e-mail e senha.'
    });
  }

  try {
    const [users] = await pool.query(
      `SELECT u.id, u.office_id, u.client_id, u.full_name, u.email, u.role, u.password_hash, u.email_verified_at, u.session_version, u.trial_ends_at,
              o.name AS office_name, cl.name AS client_name
       FROM users u
       JOIN offices o ON o.id = u.office_id
       LEFT JOIN clients cl ON cl.id = u.client_id AND cl.office_id = u.office_id
       WHERE u.email = ?`,
      [email]
    );

    const user = users[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return sendError(req, res, {
        status: 401,
        code: 'LOGIN_FAILED',
        message: 'E-mail ou senha incorretos.'
      });
    }

    if (!user.email_verified_at) {
      return sendError(req, res, {
        status: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirme seu e-mail para entrar.',
        details: { requiresVerification: true }
      });
    }

    if (user.role === 'client' && !user.client_id) {
      return sendError(req, res, {
        status: 403,
        code: 'CLIENT_NOT_LINKED',
        message: 'Seu acesso de cliente ainda nao foi vinculado a um cadastro.'
      });
    }

    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const sessionToken = await createUserSession(db, user);
      await db.commit();
      setSessionCookie(res, sessionToken);
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
    sendSuccess(req, res, {
      data: {
        user: sanitizeUser(user),
        trialEndsAt: user.trial_ends_at
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    await revokeSessionByToken(readSessionToken(req));
    clearSessionCookie(res);
    sendSuccess(req, res, {
      data: { message: 'Sessao encerrada com sucesso.' }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  sendSuccess(req, res, {
    data: {
      user: sanitizeUser(req.user),
      trialEndsAt: req.user.trial_ends_at
    }
  });
});

app.get('/api/clients', requireAuth, async (req, res, next) => {
  if (req.user.role === 'client') {
    return sendError(req, res, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Seu perfil nao pode visualizar a base de clientes.'
    });
  }

  try {
    const pagination = parsePaginationParams(req.query, { defaultPageSize: 1000, maxPageSize: 1000 });
    const search = parseSearchTerm(req.query.search);
    const filters = ['cl.office_id = ?'];
    const params = [req.user.office_id];

    if (search) {
      filters.push('(cl.name LIKE ? OR cl.email LIKE ? OR cl.phone LIKE ? OR cl.document_id LIKE ?)');
      params.push(buildLikePattern(search), buildLikePattern(search), buildLikePattern(search), buildLikePattern(search));
    }

    const whereClause = filters.join(' AND ');
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM clients cl
       WHERE ${whereClause}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT cl.id, cl.name, cl.email, cl.phone, cl.document_id, cl.notes, cl.avatar_color, cl.created_at,
              COUNT(DISTINCT c.id) AS case_count,
              COUNT(DISTINCT CASE WHEN c.archived_at IS NULL THEN c.id END) AS active_case_count
       FROM clients cl
       LEFT JOIN cases c ON c.client_id = cl.id
       WHERE ${whereClause}
       GROUP BY cl.id
       ORDER BY cl.name ASC
       LIMIT ? OFFSET ?`,
      [...params, pagination.pageSize, pagination.offset]
    );

    sendSuccess(req, res, {
      data: rows.map(formatClient),
      meta: buildPaginationMeta({
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: countRows[0]?.total
      })
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/clients/:id', requireAuth, async (req, res, next) => {
  if (req.user.role === 'client') {
    return sendError(req, res, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Seu perfil nao pode visualizar a base de clientes.'
    });
  }

  try {
    const clientId = parseUuidParam(req.params.id, 'Cliente invalido.');
    const [rows] = await pool.query(
      `SELECT cl.id, cl.name, cl.email, cl.phone, cl.document_id, cl.notes, cl.avatar_color, cl.created_at,
              COUNT(DISTINCT c.id) AS case_count,
              COUNT(DISTINCT CASE WHEN c.archived_at IS NULL THEN c.id END) AS active_case_count
       FROM clients cl
       LEFT JOIN cases c ON c.client_id = cl.id
       WHERE cl.id = ? AND cl.office_id = ?
       GROUP BY cl.id
       LIMIT 1`,
      [clientId, req.user.office_id]
    );

    if (!rows[0]) {
      return sendError(req, res, {
        status: 404,
        code: 'CLIENT_NOT_FOUND',
        message: 'Cliente nao encontrado.'
      });
    }

    sendSuccess(req, res, { data: formatClient(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/clients', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let name;
  let email;
  let phone;
  let documentId;
  let notes;
  try {
    name = parseRequiredText(req.body.name, 'Informe o nome do cliente.', { min: 2, max: 255 });
    email = parseOptionalEmail(req.body.email);
    phone = parseOptionalPhone(req.body.phone);
    documentId = parseOptionalDocumentId(req.body.documentId);
    notes = sanitizeTextInput(req.body.notes, 5000) || '';
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[clientIdResult]] = await db.query('SELECT UUID() AS id');
    await db.query(
      `INSERT INTO clients (id, office_id, name, email, phone, document_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clientIdResult.id, req.user.office_id, name, email, phone, documentId, notes]
    );
    const [rows] = await db.query(
      `SELECT cl.id, cl.name, cl.email, cl.phone, cl.document_id, cl.notes, cl.avatar_color, cl.created_at,
              0 AS case_count, 0 AS active_case_count
       FROM clients cl
       WHERE cl.id = ? AND cl.office_id = ?`,
      [clientIdResult.id, req.user.office_id]
    );
    await db.commit();
    sendSuccess(req, res, { status: 201, data: formatClient(rows[0]) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.patch('/api/clients/:id', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let clientId;
  let name;
  let email;
  let phone;
  let documentId;
  let notes;
  try {
    clientId = parseUuidParam(req.params.id, 'Cliente invalido.');
    name = parseRequiredText(req.body.name, 'Informe o nome do cliente.', { min: 2, max: 255 });
    email = parseOptionalEmail(req.body.email);
    phone = parseOptionalPhone(req.body.phone);
    documentId = parseOptionalDocumentId(req.body.documentId);
    notes = sanitizeTextInput(req.body.notes, 5000) || '';
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [existingRows] = await db.query(
      'SELECT id FROM clients WHERE id = ? AND office_id = ? FOR UPDATE',
      [clientId, req.user.office_id]
    );
    if (!existingRows[0]) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CLIENT_NOT_FOUND',
        message: 'Cliente nao encontrado.'
      });
    }

    await db.query(
      `UPDATE clients
       SET name = ?, email = ?, phone = ?, document_id = ?, notes = ?
       WHERE id = ? AND office_id = ?`,
      [name, email, phone, documentId, notes, clientId, req.user.office_id]
    );

    const [rows] = await db.query(
      `SELECT cl.id, cl.name, cl.email, cl.phone, cl.document_id, cl.notes, cl.avatar_color, cl.created_at,
              COUNT(DISTINCT c.id) AS case_count,
              COUNT(DISTINCT CASE WHEN c.archived_at IS NULL THEN c.id END) AS active_case_count
       FROM clients cl
       LEFT JOIN cases c ON c.client_id = cl.id
       WHERE cl.id = ? AND cl.office_id = ?
       GROUP BY cl.id
       LIMIT 1`,
      [clientId, req.user.office_id]
    );

    await db.commit();
    sendSuccess(req, res, { data: formatClient(rows[0]) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.delete('/api/clients/:id', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let clientId;
  try {
    clientId = parseUuidParam(req.params.id, 'Cliente invalido.');
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [clientRows] = await db.query(
      'SELECT id FROM clients WHERE id = ? AND office_id = ? FOR UPDATE',
      [clientId, req.user.office_id]
    );
    if (!clientRows[0]) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CLIENT_NOT_FOUND',
        message: 'Cliente nao encontrado.'
      });
    }

    const [[usage]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM cases WHERE client_id = ?) AS case_count,
         (SELECT COUNT(*) FROM users WHERE client_id = ? AND office_id = ?) AS linked_users`,
      [clientId, clientId, req.user.office_id]
    );

    if (Number(usage.case_count || 0) > 0 || Number(usage.linked_users || 0) > 0) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'CLIENT_IN_USE',
        message: 'Este cliente ainda possui casos ou acessos vinculados e nao pode ser removido.'
      });
    }

    await db.query('DELETE FROM clients WHERE id = ? AND office_id = ?', [clientId, req.user.office_id]);
    await db.commit();
    sendSuccess(req, res, { data: { message: 'Cliente removido com sucesso.' } });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/cases', requireAuth, async (req, res, next) => {
  let dueFrom;
  let dueTo;
  let responsibleUserId;
  try {
    dueFrom = req.query.dueFrom ? parseOptionalDate(req.query.dueFrom) : null;
    dueTo = req.query.dueTo ? parseOptionalDate(req.query.dueTo) : null;
    responsibleUserId = parseOptionalUuid(req.query.responsibleUserId, 'Responsavel invalido.');
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  try {
    const scope = getCaseScope(req.user);
    const pagination = parsePaginationParams(req.query, { defaultPageSize: 1000, maxPageSize: 1000 });
    const search = parseSearchTerm(req.query.search);
    const status = sanitizeTextInput(req.query.status, 50);
    const type = sanitizeTextInput(req.query.type, 20);
    const archived = sanitizeTextInput(req.query.archived, 10).toLowerCase();
    const dueWindow = sanitizeTextInput(req.query.dueWindow, 20).toLowerCase();

    const filters = [scope.clause];
    const filterParams = [...scope.params];

    if (search) {
      filters.push(`(
        c.title LIKE ? OR
        cl.name LIKE ? OR
        EXISTS (
          SELECT 1
          FROM documents d_search
          WHERE d_search.case_id = c.id AND d_search.name LIKE ?
        )
      )`);
      filterParams.push(buildLikePattern(search), buildLikePattern(search), buildLikePattern(search));
    }
    if (status) {
      filters.push('c.status = ?');
      filterParams.push(status);
    }
    if (type) {
      filters.push('c.status_key = ?');
      filterParams.push(type);
    }
    if (responsibleUserId) {
      filters.push('c.responsible_user_id = ?');
      filterParams.push(responsibleUserId);
    }
    if (archived === 'true') {
      filters.push('c.archived_at IS NOT NULL');
    } else if (archived !== 'all') {
      filters.push('c.archived_at IS NULL');
    }
    if (dueFrom) {
      filters.push('c.due_date >= ?');
      filterParams.push(dueFrom);
    }
    if (dueTo) {
      filters.push('c.due_date <= ?');
      filterParams.push(dueTo);
    }
    if (dueWindow === 'overdue') {
      filters.push('c.due_date IS NOT NULL AND c.due_date < CURDATE()');
    } else if (dueWindow === 'today') {
      filters.push('c.due_date = CURDATE()');
    } else if (dueWindow === 'week') {
      filters.push('c.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)');
    } else if (dueWindow === 'none') {
      filters.push('c.due_date IS NULL');
    }

    const whereClause = filters.join(' AND ');
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       WHERE ${whereClause}`,
      filterParams
    );

    const [rows] = await pool.query(
      `SELECT c.id, c.client_id, c.title, c.status, c.status_key, c.due_date, c.internal_notes, c.archived_at,
              c.responsible_user_id, cl.name AS client_name, cl.avatar_color, u.full_name AS responsible_name,
              COUNT(CASE WHEN d.status = 'received' THEN 1 END) AS completed_documents,
              COUNT(d.id) AS total_documents,
              (
                SELECT ct.title
                FROM case_tasks ct
                WHERE ct.case_id = c.id AND ct.is_done = 0
                ORDER BY ct.sort_order ASC, ct.created_at ASC
                LIMIT 1
              ) AS next_task_title
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN users u ON u.id = c.responsible_user_id
       LEFT JOIN documents d ON d.case_id = c.id
       WHERE ${whereClause}
       GROUP BY c.id, cl.id, u.id
       ORDER BY c.archived_at IS NOT NULL ASC, c.due_date IS NULL ASC, c.due_date ASC, c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, pagination.pageSize, pagination.offset]
    );

    sendSuccess(req, res, {
      data: rows.map(toCase),
      meta: buildPaginationMeta({
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: countRows[0]?.total
      })
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cases/:id', requireAuth, async (req, res, next) => {
  try {
    const caseId = parseUuidParam(req.params.id, 'Caso invalido.');
    const db = await pool.getConnection();
    try {
      const summary = await fetchCaseSummary(db, req.user, caseId);
      if (!summary) {
        return sendError(req, res, {
          status: 404,
          code: 'CASE_NOT_FOUND',
          message: 'Caso nao encontrado.'
        });
      }

      const tasks = await fetchCaseTasks(db, caseId);
      sendSuccess(req, res, {
        data: {
          ...toCase(summary),
          tasks
        }
      });
    } finally {
      db.release();
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/cases', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let clientName;
  let title;
  let dueDate;
  let responsibleUserId;
  let internalNotes;
  try {
    clientName = parseRequiredText(req.body.client, 'Cliente e titulo do caso sao obrigatorios.', { min: 2, max: 255 });
    title = parseRequiredText(req.body.title, 'Cliente e titulo do caso sao obrigatorios.', { min: 2, max: 500 });
    dueDate = parseOptionalDate(req.body.dueDate);
    responsibleUserId = parseOptionalUuid(req.body.responsibleUserId, 'Responsavel invalido.');
    internalNotes = sanitizeTextInput(req.body.internalNotes, 5000) || '';
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const client = await upsertClient(db, req.user.office_id, clientName);
    await assertResponsibleUser(db, req.user.office_id, responsibleUserId);
    const [[caseIdResult]] = await db.query('SELECT UUID() AS id');

    await db.query(
      `INSERT INTO cases (id, client_id, responsible_user_id, title, due_date, internal_notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [caseIdResult.id, client.id, responsibleUserId, title, dueDate, internalNotes]
    );

    const createdCase = await fetchCaseSummary(db, req.user, caseIdResult.id);
    await db.commit();

    sendSuccess(req, res, {
      status: 201,
      data: toCase(createdCase)
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.patch('/api/cases/:id', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let caseId;
  let title;
  let statusKey;
  let dueDate;
  let responsibleUserId;
  let internalNotes;
  try {
    caseId = parseUuidParam(req.params.id, 'Caso invalido.');
    title = parseRequiredText(req.body.title, 'Informe o titulo do caso.', { min: 2, max: 500 });
    statusKey = parseCaseStatusKey(req.body.statusKey);
    dueDate = parseOptionalDate(req.body.dueDate);
    responsibleUserId = parseOptionalUuid(req.body.responsibleUserId, 'Responsavel invalido.');
    internalNotes = sanitizeTextInput(req.body.internalNotes, 5000) || '';
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const currentCase = await fetchCaseSummary(db, req.user, caseId);
    if (!currentCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado.'
      });
    }

    await assertResponsibleUser(db, req.user.office_id, responsibleUserId);
    await db.query(
      `UPDATE cases
       SET title = ?, status_key = ?, status = ?, due_date = ?, responsible_user_id = ?, internal_notes = ?
       WHERE id = ?`,
      [title, statusKey, caseStatusLabels[statusKey], dueDate, responsibleUserId, internalNotes, caseId]
    );

    const updatedCase = await fetchCaseSummary(db, req.user, caseId);
    await db.commit();
    sendSuccess(req, res, { data: toCase(updatedCase) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/cases/:id/archive', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let caseId;
  const archive = String(req.body?.archive ?? 'true').toLowerCase() !== 'false';
  try {
    caseId = parseUuidParam(req.params.id, 'Caso invalido.');
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const currentCase = await fetchCaseSummary(db, req.user, caseId);
    if (!currentCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado.'
      });
    }

    await db.query(
      `UPDATE cases
       SET archived_at = ?, archived_by_user_id = ?
       WHERE id = ?`,
      [archive ? new Date() : null, archive ? req.user.id : null, caseId]
    );

    const updatedCase = await fetchCaseSummary(db, req.user, caseId);
    await db.commit();
    sendSuccess(req, res, { data: toCase(updatedCase) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/cases/:id/tasks', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let caseId;
  let title;
  let dueDate;
  try {
    caseId = parseUuidParam(req.params.id, 'Caso invalido.');
    title = parseRequiredText(req.body.title, 'Informe a tarefa ou proximo passo.', { min: 2, max: 500 });
    dueDate = parseOptionalDate(req.body.dueDate);
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const currentCase = await fetchCaseSummary(db, req.user, caseId);
    if (!currentCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado.'
      });
    }

    const [[sortOrderRow]] = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM case_tasks WHERE case_id = ?',
      [caseId]
    );
    const [[taskIdResult]] = await db.query('SELECT UUID() AS id');
    await db.query(
      `INSERT INTO case_tasks (id, case_id, title, due_date, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [taskIdResult.id, caseId, title, dueDate, Number(sortOrderRow.next_sort_order || 1)]
    );
    const [rows] = await db.query(
      `SELECT id, title, due_date, is_done, completed_at, created_at
       FROM case_tasks
       WHERE id = ?
       LIMIT 1`,
      [taskIdResult.id]
    );
    await db.commit();
    sendSuccess(req, res, { status: 201, data: formatCaseTask(rows[0]) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.patch('/api/cases/:caseId/tasks/:taskId', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let caseId;
  let taskId;
  let title;
  let dueDate;
  const done = req.body.done === true || req.body.done === 'true';
  try {
    caseId = parseUuidParam(req.params.caseId, 'Caso invalido.');
    taskId = parseUuidParam(req.params.taskId, 'Tarefa invalida.');
    title = parseRequiredText(req.body.title, 'Informe a tarefa ou proximo passo.', { min: 2, max: 500 });
    dueDate = parseOptionalDate(req.body.dueDate);
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const currentCase = await fetchCaseSummary(db, req.user, caseId);
    if (!currentCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado.'
      });
    }

    const [existingRows] = await db.query(
      'SELECT id FROM case_tasks WHERE id = ? AND case_id = ? FOR UPDATE',
      [taskId, caseId]
    );
    if (!existingRows[0]) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_TASK_NOT_FOUND',
        message: 'Tarefa nao encontrada.'
      });
    }

    await db.query(
      `UPDATE case_tasks
       SET title = ?, due_date = ?, is_done = ?, completed_at = ?
       WHERE id = ? AND case_id = ?`,
      [title, dueDate, done ? 1 : 0, done ? new Date() : null, taskId, caseId]
    );

    const [rows] = await db.query(
      `SELECT id, title, due_date, is_done, completed_at, created_at
       FROM case_tasks
       WHERE id = ?
       LIMIT 1`,
      [taskId]
    );
    await db.commit();
    sendSuccess(req, res, { data: formatCaseTask(rows[0]) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.delete('/api/cases/:caseId/tasks/:taskId', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let caseId;
  let taskId;
  try {
    caseId = parseUuidParam(req.params.caseId, 'Caso invalido.');
    taskId = parseUuidParam(req.params.taskId, 'Tarefa invalida.');
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const currentCase = await fetchCaseSummary(db, req.user, caseId);
    if (!currentCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado.'
      });
    }

    const [result] = await db.query(
      'DELETE FROM case_tasks WHERE id = ? AND case_id = ?',
      [taskId, caseId]
    );
    await db.commit();

    if (!result.affectedRows) {
      return sendError(req, res, {
        status: 404,
        code: 'CASE_TASK_NOT_FOUND',
        message: 'Tarefa nao encontrada.'
      });
    }

    sendSuccess(req, res, { data: { message: 'Tarefa removida com sucesso.' } });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/document-templates', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  const db = await pool.getConnection();
  try {
    const templates = await fetchChecklistTemplates(db, req.user.office_id);
    sendSuccess(req, res, { data: templates });
  } catch (error) {
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/document-templates', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  let name;
  let serviceType;
  let description;
  let items;
  try {
    name = parseRequiredText(req.body.name, 'Informe o nome do modelo.', { min: 2, max: 255 });
    serviceType = sanitizeTextInput(req.body.serviceType, 255) || null;
    description = sanitizeTextInput(req.body.description, 2000) || '';
    items = parseChecklistItems(req.body.items);
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[templateIdResult]] = await db.query('SELECT UUID() AS id');
    await db.query(
      `INSERT INTO document_checklist_templates (id, office_id, name, service_type, description)
       VALUES (?, ?, ?, ?, ?)`,
      [templateIdResult.id, req.user.office_id, name, serviceType, description]
    );

    for (const [index, item] of items.entries()) {
      const [[itemIdResult]] = await db.query('SELECT UUID() AS id');
      await db.query(
        `INSERT INTO document_checklist_template_items (id, template_id, name, sort_order, is_required)
         VALUES (?, ?, ?, ?, ?)`,
        [itemIdResult.id, templateIdResult.id, item.name, index + 1, item.required ? 1 : 0]
      );
    }

    const templates = await fetchChecklistTemplates(db, req.user.office_id);
    const createdTemplate = templates.find((template) => template.id === templateIdResult.id);
    await db.commit();
    sendSuccess(req, res, { status: 201, data: createdTemplate });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.patch('/api/document-templates/:id', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  let templateId;
  let name;
  let serviceType;
  let description;
  let items;
  try {
    templateId = parseUuidParam(req.params.id, 'Modelo invalido.');
    name = parseRequiredText(req.body.name, 'Informe o nome do modelo.', { min: 2, max: 255 });
    serviceType = sanitizeTextInput(req.body.serviceType, 255) || null;
    description = sanitizeTextInput(req.body.description, 2000) || '';
    items = parseChecklistItems(req.body.items);
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [existingRows] = await db.query(
      'SELECT id FROM document_checklist_templates WHERE id = ? AND office_id = ? FOR UPDATE',
      [templateId, req.user.office_id]
    );

    if (!existingRows[0]) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_TEMPLATE_NOT_FOUND',
        message: 'Modelo de checklist nao encontrado.'
      });
    }

    await db.query(
      `UPDATE document_checklist_templates
       SET name = ?, service_type = ?, description = ?
       WHERE id = ? AND office_id = ?`,
      [name, serviceType, description, templateId, req.user.office_id]
    );
    await db.query('DELETE FROM document_checklist_template_items WHERE template_id = ?', [templateId]);

    for (const [index, item] of items.entries()) {
      const [[itemIdResult]] = await db.query('SELECT UUID() AS id');
      await db.query(
        `INSERT INTO document_checklist_template_items (id, template_id, name, sort_order, is_required)
         VALUES (?, ?, ?, ?, ?)`,
        [itemIdResult.id, templateId, item.name, index + 1, item.required ? 1 : 0]
      );
    }

    const templates = await fetchChecklistTemplates(db, req.user.office_id);
    const updatedTemplate = templates.find((template) => template.id === templateId);
    await db.commit();
    sendSuccess(req, res, { data: updatedTemplate });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/document-templates/:id/apply', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  let templateId;
  let caseId;
  try {
    templateId = parseUuidParam(req.params.id, 'Modelo invalido.');
    caseId = parseUuidParam(req.body.caseId, 'Selecione um caso valido para aplicar o checklist.');
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const scope = getCaseScope(req.user);
    const [caseRows] = await db.query(
      `SELECT c.id, c.title, cl.name AS client_name
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ? AND ${scope.clause}
       LIMIT 1`,
      [caseId, ...scope.params]
    );
    const linkedCase = caseRows[0];
    if (!linkedCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado para este escritorio.'
      });
    }

    const [templateRows] = await db.query(
      `SELECT id, name
       FROM document_checklist_templates
       WHERE id = ? AND office_id = ?
       LIMIT 1`,
      [templateId, req.user.office_id]
    );
    if (!templateRows[0]) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_TEMPLATE_NOT_FOUND',
        message: 'Modelo de checklist nao encontrado.'
      });
    }

    const items = await fetchChecklistTemplateItems(db, templateId);
    if (!items.length) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'DOCUMENT_TEMPLATE_EMPTY',
        message: 'Este modelo ainda nao possui itens de checklist.'
      });
    }

    const [existingDocs] = await db.query(
      `SELECT source_template_item_id
       FROM documents
       WHERE case_id = ? AND source_template_id = ? AND source_template_item_id IS NOT NULL`,
      [caseId, templateId]
    );
    const existingIds = new Set(existingDocs.map((row) => row.source_template_item_id));
    const createdDocuments = [];

    for (const item of items) {
      if (existingIds.has(item.id)) continue;
      const [[documentIdResult]] = await db.query('SELECT UUID() AS id');
      await db.query(
        `INSERT INTO documents (
           id, case_id, requested_by_user_id, name, status, requested_at, source_template_id, source_template_item_id
         ) VALUES (?, ?, ?, ?, 'pending', NOW(), ?, ?)`,
        [documentIdResult.id, caseId, req.user.id, item.name, templateId, item.id]
      );

      createdDocuments.push({
        id: documentIdResult.id,
        name: item.name,
        case_title: linkedCase.title,
        case_id: caseId,
        client_name: linkedCase.client_name,
        status: 'pending',
        requested_at: new Date().toISOString(),
        last_reminded_at: null,
        file_name: null,
        file_size: null,
        uploaded_at: null,
        reviewed_at: null,
        status_note: '',
        resend_requested_at: null,
        resend_note: '',
        template_name: templateRows[0].name,
        is_late: 0
      });
    }

    await db.commit();
    sendSuccess(req, res, {
      data: {
        templateId,
        caseId,
        createdCount: createdDocuments.length,
        documents: createdDocuments.map(formatDocument)
      }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/documents/pending', requireAuth, async (req, res, next) => {
  let caseId;
  try {
    caseId = req.query.caseId ? parseUuidParam(req.query.caseId, 'Caso invalido.') : null;
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  try {
    const scope = getCaseScope(req.user);
    const pagination = parsePaginationParams(req.query, { defaultPageSize: 1000, maxPageSize: 1000 });
    const search = parseSearchTerm(req.query.search);
    const status = sanitizeTextInput(req.query.status, 20);
    const uploaded = sanitizeTextInput(req.query.uploaded, 5).toLowerCase();

    const filters = [scope.clause];
    const filterParams = [...scope.params];

    if (search) {
      filters.push('(d.name LIKE ? OR c.title LIKE ? OR cl.name LIKE ? OR t.name LIKE ?)');
      filterParams.push(buildLikePattern(search), buildLikePattern(search), buildLikePattern(search), buildLikePattern(search));
    }
    if (status) {
      filters.push('d.status = ?');
      filterParams.push(status);
    }
    if (caseId) {
      filters.push('c.id = ?');
      filterParams.push(caseId);
    }
    if (uploaded === 'true') {
      filters.push('d.uploaded_at IS NOT NULL');
    } else if (uploaded === 'false') {
      filters.push('d.uploaded_at IS NULL');
    }

    const whereClause = filters.join(' AND ');
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM documents d
       JOIN cases c ON c.id = d.case_id
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN document_checklist_templates t ON t.id = d.source_template_id
       WHERE ${whereClause}`,
      filterParams
    );

    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.status, d.requested_at, d.last_reminded_at, d.file_name, d.file_size, d.uploaded_at,
              d.reviewed_at, d.status_note, d.resend_requested_at, d.resend_note,
              c.id AS case_id, c.title AS case_title, cl.name AS client_name, t.name AS template_name,
              CASE
                WHEN d.status = 'pending' AND d.requested_at <= DATE_SUB(NOW(), INTERVAL 48 HOUR) THEN 1
                ELSE 0
              END AS is_late
       FROM documents d
       JOIN cases c ON c.id = d.case_id
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN document_checklist_templates t ON t.id = d.source_template_id
       WHERE ${whereClause}
       ORDER BY c.title ASC, d.requested_at ASC, d.id ASC
       LIMIT ? OFFSET ?`,
      [...filterParams, pagination.pageSize, pagination.offset]
    );

    sendSuccess(req, res, {
      data: rows.map(formatDocument),
      meta: buildPaginationMeta({
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: countRows[0]?.total
      })
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/request', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  let caseId;
  let name;
  try {
    caseId = parseUuidParam(req.body.caseId, 'Selecione um caso valido para vincular o documento.');
    name = parseRequiredText(req.body.name, 'Informe o nome do documento solicitado.', { min: 3, max: 500 });
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const scope = getCaseScope(req.user);
    const [caseRows] = await db.query(
      `SELECT c.id, c.title, cl.name AS client_name
       FROM cases c
       JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ? AND ${scope.clause}
       LIMIT 1`,
      [caseId, ...scope.params]
    );

    const linkedCase = caseRows[0];
    if (!linkedCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado para este escritorio.'
      });
    }

    const [[documentIdResult]] = await db.query('SELECT UUID() AS id');
    await db.query(
      `INSERT INTO documents (id, case_id, requested_by_user_id, name, status, requested_at)
       VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [documentIdResult.id, caseId, req.user.id, name]
    );
    await recordDocumentAudit(db, req, {
      documentId: documentIdResult.id,
      officeId: req.user.office_id,
      action: 'document_created',
      metadata: {
        caseId,
        caseTitle: linkedCase.title,
        clientName: linkedCase.client_name,
        documentName: name,
        status: 'pending'
      }
    });

    await db.commit();
    sendSuccess(req, res, {
      status: 201,
      data: formatDocument({
        id: documentIdResult.id,
        name,
        case_id: caseId,
        case_title: linkedCase.title,
        client_name: linkedCase.client_name,
        is_late: 0,
        status: 'pending',
        requested_at: new Date().toISOString(),
        last_reminded_at: null,
        file_name: null,
        file_size: null,
        uploaded_at: null,
        reviewed_at: null,
        status_note: '',
        resend_requested_at: null,
        resend_note: '',
        template_name: null
      })
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/documents/:id/remind', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const documentId = parseUuidParam(req.params.id, 'Documento invalido.');
    const scope = getCaseScope(req.user);
    const [result] = await db.query(
      `UPDATE documents d
       JOIN cases c ON c.id = d.case_id
       JOIN clients cl ON cl.id = c.client_id
       SET d.last_reminded_at = NOW()
       WHERE d.id = ? AND d.status = 'pending' AND ${scope.clause}`,
      [documentId, ...scope.params]
    );

    if (!result.affectedRows) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Documento pendente nao encontrado.'
      });
    }
    await recordDocumentAudit(db, req, {
      documentId,
      officeId: req.user.office_id,
      action: 'document_updated',
      metadata: {
        changeType: 'reminder_sent'
      }
    });
    await db.commit();
    sendSuccess(req, res, {
      data: { id: documentId, remindedAt: new Date().toISOString() }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.patch('/api/documents/:id/status', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  let documentId;
  let status;
  let note;
  try {
    documentId = parseUuidParam(req.params.id, 'Documento invalido.');
    status = parseDocumentStatus(req.body.status);
    note = sanitizeTextInput(req.body.note, 5000) || '';
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const document = await fetchDocumentById(req.user, documentId);
    if (!document) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Documento nao encontrado para este acesso.'
      });
    }

    await db.query(
      `UPDATE documents
       SET status = ?,
           reviewed_by_user_id = ?,
           reviewed_at = NOW(),
           status_note = ?,
           uploaded_at = CASE
             WHEN ? = 'received' AND uploaded_at IS NULL THEN NOW()
             WHEN ? <> 'received' THEN uploaded_at
             ELSE uploaded_at
           END
       WHERE id = ?`,
      [status, req.user.id, note, status, status, documentId]
    );
    await recordDocumentAudit(db, req, {
      documentId,
      officeId: document.office_id || req.user.office_id,
      action: 'document_updated',
      metadata: {
        changeType: 'status_changed',
        status,
        note
      }
    });
    await db.commit();

    const updatedDocument = await fetchDocumentById(req.user, documentId);
    sendSuccess(req, res, {
      data: formatDocument({
        ...updatedDocument,
        case_title: updatedDocument.case_title,
        client_name: updatedDocument.client_name,
        is_late: updatedDocument.status === 'pending' ? 1 : 0
      })
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.post('/api/documents/:id/request-resend', requireAuth, requirePermission('sendDocumentReminders'), async (req, res, next) => {
  let documentId;
  let note;
  try {
    documentId = parseUuidParam(req.params.id, 'Documento invalido.');
    note = sanitizeTextInput(req.body.note, 5000);
    if (!note) {
      throw new Error('Informe a observacao do reenvio.');
    }
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const document = await fetchDocumentById(req.user, documentId);
    if (!document) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Documento nao encontrado para este acesso.'
      });
    }

    await db.query(
      `UPDATE documents
       SET status = 'pending',
           reviewed_by_user_id = ?,
           reviewed_at = NOW(),
           resend_requested_at = NOW(),
           resend_note = ?,
           status_note = ?
       WHERE id = ?`,
      [req.user.id, note, note, documentId]
    );
    await recordDocumentAudit(db, req, {
      documentId,
      officeId: document.office_id || req.user.office_id,
      action: 'document_updated',
      metadata: {
        changeType: 'resend_requested',
        note
      }
    });
    await db.commit();

    const updatedDocument = await fetchDocumentById(req.user, documentId);
    sendSuccess(req, res, {
      data: formatDocument({
        ...updatedDocument,
        case_title: updatedDocument.case_title,
        client_name: updatedDocument.client_name,
        is_late: 0
      })
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/updates', requireAuth, async (req, res, next) => {
  try {
    const caseId = req.query.caseId ? parseUuidParam(req.query.caseId, 'Caso invalido.') : null;
    const limit = parsePositiveInt(req.query.limit, 50, { min: 1, max: 200 });
    const db = await pool.getConnection();
    try {
      const updates = await fetchCaseUpdates(db, req.user, { caseId, limit });
      sendSuccess(req, res, { data: updates });
    } finally {
      db.release();
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/cases/:id/updates', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  let caseId;
  let title;
  let message;
  try {
    caseId = parseUuidParam(req.params.id, 'Caso invalido.');
    title = parseRequiredText(req.body.title, 'Informe um titulo simples para a atualizacao.', { min: 2, max: 255 });
    message = parseRequiredText(req.body.message, 'Escreva a atualizacao em linguagem simples.', { min: 8, max: 5000 });
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const linkedCase = await fetchCaseSummary(db, req.user, caseId);
    if (!linkedCase) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'CASE_NOT_FOUND',
        message: 'Caso nao encontrado.'
      });
    }

    const [[updateIdResult]] = await db.query('SELECT UUID() AS id');
    await db.query(
      `INSERT INTO case_updates (id, case_id, office_id, author_user_id, title, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [updateIdResult.id, caseId, req.user.office_id, req.user.id, title, message]
    );

    const [rows] = await db.query(
      `SELECT cu.id, cu.case_id, cu.title, cu.message, cu.created_at,
              c.title AS case_title, cl.name AS client_name, u.full_name AS author_name
       FROM case_updates cu
       JOIN cases c ON c.id = cu.case_id
       JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN users u ON u.id = cu.author_user_id
       WHERE cu.id = ?
       LIMIT 1`,
      [updateIdResult.id]
    );

    await db.commit();
    sendSuccess(req, res, { status: 201, data: formatCaseUpdate(rows[0]) });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/activity-feed', requireAuth, async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, { min: 1, max: 200 });
    const db = await pool.getConnection();
    try {
      const items = await fetchActivityFeed(db, req.user, { limit });
      sendSuccess(req, res, { data: items });
    } finally {
      db.release();
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents/:id/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const documentId = parseUuidParam(req.params.id, 'Documento invalido.');
    if (!req.file) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Envie um arquivo para concluir o upload.'
      });
    }

    const document = await fetchDocumentById(req.user, documentId);
    if (!document) {
      await db.rollback();
      await fs.unlink(req.file.path).catch(() => {});
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Documento nao encontrado para este acesso.'
      });
    }

    const scope = getCaseScope(req.user);
    const [result] = await db.query(
      `UPDATE documents d
       JOIN cases c ON c.id = d.case_id
       JOIN clients cl ON cl.id = c.client_id
       SET d.status = 'received',
           d.reviewed_by_user_id = ?,
           d.reviewed_at = NOW(),
           d.status_note = '',
           d.resend_requested_at = NULL,
           d.resend_note = NULL,
           d.file_name = ?,
           d.file_path = ?,
           d.mime_type = ?,
           d.file_size = ?,
           d.uploaded_at = NOW()
       WHERE d.id = ? AND ${scope.clause}`,
      [
        req.user.id,
        sanitizeTextInput(req.file.originalname, 500),
        sanitizeTextInput(req.file.filename, 255),
        sanitizeTextInput(req.file.mimetype, 255),
        req.file.size,
        documentId,
        ...scope.params
      ]
    );
    if (!result.affectedRows) {
      await db.rollback();
      await fs.unlink(req.file.path).catch(() => {});
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Documento nao encontrado para este acesso.'
      });
    }
    await recordDocumentAudit(db, req, {
      documentId,
      officeId: document.office_id || req.user.office_id,
      action: 'document_updated',
      metadata: {
        changeType: 'file_uploaded',
        status: 'received',
        fileName: sanitizeTextInput(req.file.originalname, 500),
        fileSize: req.file.size,
        mimeType: sanitizeTextInput(req.file.mimetype, 255)
      }
    });
    await db.commit();

    sendSuccess(req, res, {
      data: formatDocument({
        ...document,
        status: 'received',
        file_name: sanitizeTextInput(req.file.originalname, 500),
        file_size: req.file.size,
        uploaded_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
        status_note: '',
        resend_requested_at: null,
        resend_note: '',
        is_late: 0
      })
    });
  } catch (error) {
    await db.rollback();
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/documents/:id/download', requireAuth, async (req, res, next) => {
  const db = await pool.getConnection();
  try {
    const documentId = parseUuidParam(req.params.id, 'Documento invalido.');
    const document = await fetchDocumentById(req.user, documentId);
    if (!document || !document.file_path) {
      return sendError(req, res, {
        status: 404,
        code: 'DOCUMENT_FILE_NOT_FOUND',
        message: 'Arquivo ainda nao foi enviado para este documento.'
      });
    }
    await recordDocumentAudit(db, req, {
      documentId,
      officeId: document.office_id || req.user.office_id,
      action: 'document_downloaded',
      metadata: {
        fileName: sanitizeTextInput(document.file_name || document.name, 500),
        mimeType: sanitizeTextInput(document.mime_type, 255),
        fileSize: document.file_size || null
      }
    });

    res.download(path.join(uploadsDirectory, sanitizeTextInput(document.file_path, 255)), sanitizeTextInput(document.file_name || document.name, 500));
  } catch (error) {
    next(error);
  } finally {
    db.release();
  }
});

app.get('/api/team/assignable', requireAuth, requirePermission('createCases'), async (req, res, next) => {
  try {
    const rows = await fetchAssignableUsers(pool, req.user.office_id);
    sendSuccess(req, res, {
      data: rows.map((row) => ({
        id: row.id,
        name: row.full_name
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/team/users', requireAuth, requirePermission('manageOfficeUsers'), async (req, res, next) => {
  try {
    const pagination = parsePaginationParams(req.query, { defaultPageSize: 1000, maxPageSize: 1000 });
    const search = parseSearchTerm(req.query.search);
    const role = sanitizeTextInput(req.query.role, 20);
    const verified = sanitizeTextInput(req.query.verified, 5).toLowerCase();

    const filters = ['u.office_id = ?'];
    const filterParams = [req.user.office_id];

    if (search) {
      filters.push('(u.full_name LIKE ? OR u.email LIKE ? OR cl.name LIKE ?)');
      filterParams.push(buildLikePattern(search), buildLikePattern(search), buildLikePattern(search));
    }
    if (role) {
      filters.push('u.role = ?');
      filterParams.push(role);
    }
    if (verified === 'true') {
      filters.push('u.email_verified_at IS NOT NULL');
    } else if (verified === 'false') {
      filters.push('u.email_verified_at IS NULL');
    }

    const whereClause = filters.join(' AND ');
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u
       LEFT JOIN clients cl ON cl.id = u.client_id AND cl.office_id = u.office_id
       WHERE ${whereClause}`,
      filterParams
    );

    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.email_verified_at, u.created_at, cl.name AS client_name
       FROM users u
       LEFT JOIN clients cl ON cl.id = u.client_id AND cl.office_id = u.office_id
       WHERE ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, pagination.pageSize, pagination.offset]
    );

    sendSuccess(req, res, {
      data: rows.map(formatTeamUser),
      meta: buildPaginationMeta({
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: countRows[0]?.total
      })
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/team/users', requireAuth, requirePermission('manageOfficeUsers'), async (req, res, next) => {
  let fullName;
  let email;
  let password;
  let role;
  let clientName;
  try {
    fullName = parseRequiredText(req.body.name, 'Informe o nome completo.', { min: 2, max: 255 });
    email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) {
      return sendError(req, res, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Informe um e-mail valido.'
      });
    }
    password = parsePassword(req.body.password);
    role = parseRole(req.body.role);
    clientName = role === 'client'
      ? parseRequiredText(req.body.clientName, 'Informe o nome do cliente vinculado.', { min: 2, max: 255 })
      : null;
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ? FOR UPDATE', [email]);
    if (existingUsers.length) {
      await db.rollback();
      return sendError(req, res, {
        status: 409,
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'Ja existe uma conta com este e-mail.'
      });
    }

    let linkedClientId = null;
    if (role === 'client') {
      linkedClientId = (await upsertClient(db, req.user.office_id, clientName))?.id || null;
    }

    const [[userIdResult]] = await db.query('SELECT UUID() AS id');
    const passwordHash = await bcrypt.hash(password, 12);
    const trialEndsAt = req.user.trial_ends_at || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO users (id, office_id, client_id, full_name, email, password_hash, role, trial_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userIdResult.id, req.user.office_id, linkedClientId, fullName, email, passwordHash, role, trialEndsAt]
    );

    const verificationCode = await saveVerificationCode(db, userIdResult.id);
    await db.commit();

    const delivery = await sendVerificationEmail({ to: email, name: fullName, code: verificationCode });
    sendSuccess(req, res, {
      status: 201,
      data: {
        user: {
          id: userIdResult.id,
          name: fullName,
          email,
          role,
          roleLabel: roleLabels[role] || role,
          clientName: clientName || null,
          verified: false
        },
        message: 'Usuario criado. Ele precisa confirmar o e-mail antes do primeiro acesso.',
        developmentCode: delivery.mode === 'development' ? verificationCode : undefined
      }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.patch('/api/team/users/:id', requireAuth, requirePermission('manageOfficeUsers'), async (req, res, next) => {
  let fullName;
  let email;
  let role;
  let clientName;
  let userId;
  try {
    userId = parseUuidParam(req.params.id, 'Membro invalido.');
    fullName = parseRequiredText(req.body.name, 'Informe o nome completo.', { min: 2, max: 255 });
    email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) {
      return sendError(req, res, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Informe um e-mail valido.'
      });
    }
    role = parseRole(req.body.role);
    clientName = role === 'client'
      ? parseRequiredText(req.body.clientName, 'Informe o nome do cliente vinculado.', { min: 2, max: 255 })
      : null;
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.query(
      `SELECT id, office_id, role
       FROM users
       WHERE id = ? AND office_id = ?
       FOR UPDATE`,
      [userId, req.user.office_id]
    );

    const targetUser = rows[0];
    if (!targetUser) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'TEAM_MEMBER_NOT_FOUND',
        message: 'Membro nao encontrado.'
      });
    }

    if (targetUser.id === req.user.id && role !== 'admin') {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'SELF_ROLE_CHANGE_FORBIDDEN',
        message: 'Seu proprio acesso deve permanecer como administrador.'
      });
    }

    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id <> ? FOR UPDATE',
      [email, userId]
    );
    if (existingUsers.length) {
      await db.rollback();
      return sendError(req, res, {
        status: 409,
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'Ja existe outra conta com este e-mail.'
      });
    }

    if (targetUser.role === 'admin' && role !== 'admin') {
      const adminCount = await countOfficeAdmins(db, req.user.office_id);
      if (adminCount <= 1) {
        await db.rollback();
        return sendError(req, res, {
          status: 400,
          code: 'LAST_ADMIN_REQUIRED',
          message: 'O escritorio precisa manter ao menos um administrador.'
        });
      }
    }

    const linkedClient = role === 'client' ? await upsertClient(db, req.user.office_id, clientName) : null;
    await db.query(
      `UPDATE users
       SET full_name = ?, email = ?, role = ?, client_id = ?
       WHERE id = ? AND office_id = ?`,
      [fullName, email, role, linkedClient?.id || null, userId, req.user.office_id]
    );

    const [updatedRows] = await db.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.email_verified_at, u.created_at, cl.name AS client_name
       FROM users u
       LEFT JOIN clients cl ON cl.id = u.client_id AND cl.office_id = u.office_id
       WHERE u.id = ? AND u.office_id = ?`,
      [userId, req.user.office_id]
    );

    await db.commit();
    sendSuccess(req, res, { data: { user: formatTeamUser(updatedRows[0]) } });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.delete('/api/team/users/:id', requireAuth, requirePermission('manageOfficeUsers'), async (req, res, next) => {
  let userId;
  try {
    userId = parseUuidParam(req.params.id, 'Membro invalido.');
  } catch (error) {
    return sendError(req, res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: error.message
    });
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.query(
      `SELECT id, role
       FROM users
       WHERE id = ? AND office_id = ?
       FOR UPDATE`,
      [userId, req.user.office_id]
    );

    const targetUser = rows[0];
    if (!targetUser) {
      await db.rollback();
      return sendError(req, res, {
        status: 404,
        code: 'TEAM_MEMBER_NOT_FOUND',
        message: 'Membro nao encontrado.'
      });
    }

    if (targetUser.id === req.user.id) {
      await db.rollback();
      return sendError(req, res, {
        status: 400,
        code: 'SELF_DELETE_FORBIDDEN',
        message: 'Nao e possivel excluir o proprio acesso.'
      });
    }

    if (targetUser.role === 'admin') {
      const adminCount = await countOfficeAdmins(db, req.user.office_id);
      if (adminCount <= 1) {
        await db.rollback();
        return sendError(req, res, {
          status: 400,
          code: 'LAST_ADMIN_REQUIRED',
          message: 'O escritorio precisa manter ao menos um administrador.'
        });
      }
    }

    await db.query('DELETE FROM users WHERE id = ? AND office_id = ?', [userId, req.user.office_id]);
    await db.commit();
    sendSuccess(req, res, {
      data: { message: 'Acesso removido com sucesso.' }
    });
  } catch (error) {
    await db.rollback();
    next(error);
  } finally {
    db.release();
  }
});

app.use((error, req, res, _next) => {
  const status = error instanceof ApiError
    ? error.status
    : error instanceof multer.MulterError || error.message?.includes('Tipo de arquivo nao permitido')
      ? 400
      : 500;
  logEvent('error', 'request_failed', buildRequestContext(req), {
    status,
    durationMs: req.startedAt ? Date.now() - req.startedAt : undefined,
    error: serializeError(error)
  });
  if (error instanceof ApiError) {
    return sendError(req, res, {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details
    });
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return sendError(req, res, {
        status: 400,
        code: 'FILE_TOO_LARGE',
        message: 'O arquivo excede o limite de 10 MB.'
      });
    }
    return sendError(req, res, {
      status: 400,
      code: 'UPLOAD_PROCESSING_FAILED',
      message: 'Nao foi possivel processar o upload enviado.'
    });
  }
  if (error.message?.includes('Tipo de arquivo nao permitido')) {
    return sendError(req, res, {
      status: 400,
      code: 'INVALID_FILE_TYPE',
      message: error.message
    });
  }
  return sendError(req, res, {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Nao foi possivel concluir esta operacao.'
  });
});

app.get('/styles.css', (_req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/marketing.css', (_req, res) => res.sendFile(path.join(__dirname, 'marketing.css')));
app.get('/marketing.js', (_req, res) => res.sendFile(path.join(__dirname, 'marketing.js')));
app.get('/app', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'home.html')));

ensureUploadsDirectory()
  .then(() => {
    app.listen(port, () => {
      logEvent('info', 'server_started', {
        port,
        logDestination,
        logFilePath: logDestination === 'file' ? logFilePath : null
      });
    });
  })
  .catch((error) => {
    logEvent('error', 'startup_failed', {
      uploadsDirectory,
      logDestination,
      logFilePath: logDestination === 'file' ? logFilePath : null
    }, {
      error: serializeError(error)
    });
    process.exit(1);
  });
