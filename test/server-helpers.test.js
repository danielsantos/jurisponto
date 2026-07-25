const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMeta,
  createRequirePermission,
  getCaseScope,
  getPermissions,
  parseUuidParam,
  readSessionToken,
  sendError
} = require('../server-helpers');

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('getPermissions returns full access for admin and fallback for unknown roles', () => {
  assert.equal(getPermissions('admin').manageOfficeUsers, true);
  assert.equal(getPermissions('admin').accessSettings, true);
  assert.equal(getPermissions('unknown').createCases, false);
  assert.equal(getPermissions('unknown').sendDocumentReminders, false);
});

test('getCaseScope restricts client by office and client id', () => {
  assert.deepEqual(
    getCaseScope({ role: 'client', office_id: 'office-1', client_id: 'client-9' }),
    {
      clause: 'cl.office_id = ? AND cl.id = ?',
      params: ['office-1', 'client-9']
    }
  );
});

test('getCaseScope restricts staff only by office', () => {
  assert.deepEqual(
    getCaseScope({ role: 'admin', office_id: 'office-1' }),
    {
      clause: 'cl.office_id = ?',
      params: ['office-1']
    }
  );
});

test('parseUuidParam accepts valid uuid and rejects invalid input', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(parseUuidParam(uuid), uuid);
  assert.throws(() => parseUuidParam('not-a-uuid', 'Uuid invalido.'), /Uuid invalido\./);
});

test('readSessionToken extracts and sanitizes the auth cookie', () => {
  const req = {
    headers: {
      cookie: 'foo=bar; jurisponto_session=abc123%0A; theme=light'
    }
  };

  assert.equal(readSessionToken(req), 'abc123');
});

test('sendError returns the API error contract with requestId metadata', () => {
  const req = { requestId: 'req-123' };
  const res = createMockResponse();

  sendError(req, res, {
    status: 403,
    code: 'FORBIDDEN',
    message: 'Sem acesso.'
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    data: null,
    meta: buildMeta(req),
    error: {
      code: 'FORBIDDEN',
      message: 'Sem acesso.'
    }
  });
});

test('requirePermission returns 401 when there is no authenticated user', () => {
  const requirePermission = createRequirePermission();
  const middleware = requirePermission('manageOfficeUsers');
  const req = { requestId: 'req-401' };
  const res = createMockResponse();
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('requirePermission returns 403 when the role lacks permission', () => {
  const requirePermission = createRequirePermission();
  const middleware = requirePermission('manageOfficeUsers');
  const req = {
    requestId: 'req-403',
    user: { role: 'assistant' }
  };
  const res = createMockResponse();
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

test('requirePermission calls next when the role has access', () => {
  const requirePermission = createRequirePermission();
  const middleware = requirePermission('sendDocumentReminders');
  const req = {
    requestId: 'req-200',
    user: { role: 'lawyer' }
  };
  const res = createMockResponse();
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.body, null);
});
