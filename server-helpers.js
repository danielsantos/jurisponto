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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeTextInput(value, maxLength = 255) {
  if (typeof value !== 'string') return '';
  return normalizeWhitespace(value.replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, maxLength);
}

function isValidUuid(value) {
  return uuidPattern.test(value || '');
}

function getPermissions(role) {
  return permissionMap[role] || permissionMap.client;
}

function buildMeta(req, extra = {}) {
  return {
    requestId: req.requestId,
    ...extra
  };
}

function sendError(req, res, { status = 500, code = 'INTERNAL_ERROR', message = 'Nao foi possivel concluir esta operacao.', details } = {}) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({
    data: null,
    meta: buildMeta(req),
    error
  });
}

function parseUuidParam(value, label = 'Identificador invalido.') {
  const normalized = sanitizeTextInput(value, 36);
  if (!isValidUuid(normalized)) throw new Error(label);
  return normalized;
}

function getCaseScope(user) {
  if (user.role === 'client') {
    return {
      clause: 'cl.office_id = ? AND cl.id = ?',
      params: [user.office_id, user.client_id || '']
    };
  }

  return {
    clause: 'cl.office_id = ?',
    params: [user.office_id]
  };
}

function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((cookie) => {
    const index = cookie.indexOf('=');
    return [cookie.slice(0, index).trim(), decodeURIComponent(cookie.slice(index + 1))];
  }));
}

function readSessionToken(req) {
  return sanitizeTextInput(readCookies(req).jurisponto_session, 255);
}

function createRequirePermission() {
  return function requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return sendError(req, res, {
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Sua sessao expirou. Entre novamente para continuar.'
        });
      }
      if (getPermissions(req.user.role)[permission]) return next();
      return sendError(req, res, {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Seu perfil nao tem permissao para esta acao.'
      });
    };
  };
}

module.exports = {
  buildMeta,
  createRequirePermission,
  getCaseScope,
  getPermissions,
  isValidUuid,
  parseUuidParam,
  permissionMap,
  readCookies,
  readSessionToken,
  sanitizeTextInput,
  sendError
};
