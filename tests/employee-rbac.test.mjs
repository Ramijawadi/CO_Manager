import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../server/app.mjs';
import { hashPassword, newToken, tokenHash, verifyPassword } from '../server/auth.mjs';

const uuid = () => randomUUID();

function makeDatabase() {
  const collections = new Map();
  const rows = name => {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name);
  };
  const matches = (row, filter = {}) => Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some(condition => matches(row, condition));
    const value = row[key];
    if (Array.isArray(value) && !Array.isArray(expected)) return value.includes(expected);
    if (expected instanceof RegExp) return expected.test(value);
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('$in' in expected && !expected.$in.includes(value)) return false;
      if ('$gt' in expected && !(value > expected.$gt)) return false;
      if ('$ne' in expected && value === expected.$ne) return false;
      if ('$regex' in expected && !new RegExp(expected.$regex, expected.$options).test(value)) return false;
      return true;
    }
    return value === expected;
  });
  const collection = name => ({
    findOne: async filter => rows(name).find(row => matches(row, filter)) ?? null,
    find: filter => {
      let result = rows(name).filter(row => matches(row, filter));
      const cursor = {
        sort(order) {
          const [[key, direction]] = Object.entries(order);
          result = [...result].sort((left, right) => {
            const a = left[key] instanceof Date ? left[key].getTime() : left[key];
            const b = right[key] instanceof Date ? right[key].getTime() : right[key];
            return (a < b ? -1 : a > b ? 1 : 0) * direction;
          });
          return cursor;
        },
        skip(count) { result = result.slice(count); return cursor; },
        limit(count) { result = result.slice(0, count); return cursor; },
        toArray: async () => result.map(row => ({ ...row })),
      };
      return cursor;
    },
    insertOne: async document => {
      if (name === 'users' && rows(name).some(row => row.email === document.email)) {
        throw Object.assign(new Error('duplicate email'), { code: 11000 });
      }
      if (name === 'work_sessions' && document.status === 'active' &&
          rows(name).some(row => row.employee_id === document.employee_id && row.status === 'active')) {
        throw Object.assign(new Error('duplicate active shift'), { code: 11000 });
      }
      if (name === 'operational_requests' && rows(name).some(row =>
        row.employee_id === document.employee_id && row.idempotency_key === document.idempotency_key)) {
        throw Object.assign(new Error('duplicate operational request'), { code: 11000 });
      }
      if (name === 'notifications' && rows(name).some(row =>
        row.recipient_id === document.recipient_id && row.dedupe_key === document.dedupe_key)) {
        throw Object.assign(new Error('duplicate notification'), { code: 11000 });
      }
      rows(name).push(document);
      return { insertedId: document.id };
    },
    findOneAndUpdate: async (filter, update) => {
      const row = rows(name).find(item => matches(item, filter));
      if (!row) return null;
      Object.assign(row, update.$set ?? {});
      for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
      for (const [key, value] of Object.entries(update.$push ?? {})) {
        row[key] ??= [];
        row[key].push(...value.$each);
        if (value.$slice < 0) row[key] = row[key].slice(value.$slice);
      }
      return { ...row };
    },
    updateOne: async (filter, update) => {
      const row = rows(name).find(item => matches(item, filter));
      if (row) Object.assign(row, update.$set ?? {});
      return { matchedCount: row ? 1 : 0 };
    },
    updateMany: async (filter, update) => {
      const matching = rows(name).filter(row => matches(row, filter));
      for (const row of matching) Object.assign(row, update.$set ?? {});
      return { modifiedCount: matching.length };
    },
    deleteOne: async filter => {
      const index = rows(name).findIndex(row => matches(row, filter));
      if (index >= 0) rows(name).splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    deleteMany: async filter => {
      const before = rows(name).length;
      collections.set(name, rows(name).filter(row => !matches(row, filter)));
      return { deletedCount: before - rows(name).length };
    },
    countDocuments: async filter => rows(name).filter(row => matches(row, filter)).length,
  });
  return {
    collection,
    seed: (name, document) => rows(name).push(document),
    all: name => rows(name),
    command: async () => ({ ok: 1 }),
  };
}

test('employee registration, shifts, ownership, admin controls and account revocation', async t => {
  const db = makeDatabase();
  const adminId = uuid();
  const otherEmployeeId = uuid();
  db.seed('users', {
    id: adminId, email: 'admin@example.com', role: 'admin', status: 'active',
    full_name: 'Admin', password_hash: await hashPassword('admin-password-123'),
  });
  db.seed('users', {
    id: otherEmployeeId, email: 'other@example.com', role: 'employee', status: 'active',
    full_name: 'Other Employee', password_hash: await hashPassword('other-password-123'),
  });

  const createCookie = userId => {
    const token = newToken();
    db.seed('auth_sessions', {
      id: uuid(), token_hash: tokenHash(token), user_id: userId,
      expires_at: new Date(Date.now() + 60_000),
    });
    return `co_manager_session=${token}`;
  };
  const adminCookie = createCookie(adminId);
  const otherCookie = createCookie(otherEmployeeId);
  const client = { withSession: callback => callback({ withTransaction: operation => operation() }) };
  const app = await createApp({ db, client, serverless: true, serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, method = 'GET', body, cookie, expected = 200) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return { value, response };
  };

  const registration = await request('/auth/register', 'POST', {
    fullName: 'Registered Employee', email: '  employee@example.com  ',
    phone: '+21600000000', password: 'employee-password-123',
  }, undefined, 201);
  assert.equal(registration.value.user.role, 'employee');
  assert.equal(registration.value.status, 'active');
  const createdUser = db.all('users').find(user => user.email === 'employee@example.com');
  assert.equal(createdUser.full_name, 'Registered Employee');
  assert.notEqual(createdUser.password_hash, 'employee-password-123');
  assert.equal(await verifyPassword('employee-password-123', createdUser.password_hash), true);
  await request('/auth/register', 'POST', {
    fullName: 'Escalation Attempt', email: 'escalate@example.com',
    password: 'employee-password-123', role: 'admin',
  }, undefined, 400);
  const previousApprovalSetting = process.env.EMPLOYEE_APPROVAL_REQUIRED;
  process.env.EMPLOYEE_APPROVAL_REQUIRED = 'true';
  let pendingRegistration;
  try {
    pendingRegistration = await request('/auth/register', 'POST', {
      fullName: 'Pending Employee', email: 'pending@example.com',
      password: 'employee-password-123',
    }, undefined, 201);
  } finally {
    if (previousApprovalSetting === undefined) delete process.env.EMPLOYEE_APPROVAL_REQUIRED;
    else process.env.EMPLOYEE_APPROVAL_REQUIRED = previousApprovalSetting;
  }
  assert.equal(pendingRegistration.value.status, 'pending');
  assert.equal(db.all('notifications').filter(item => item.type === 'employee_approval').length, 1);
  await request('/auth/login', 'POST', {
    email: 'pending@example.com', password: 'employee-password-123',
  }, undefined, 401);

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: createdUser.email, password: 'employee-password-123' }),
  });
  assert.equal(login.status, 200);
  const employeeCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await login.json()).user.role, 'employee');

  await request('/admin/employees', 'GET', undefined, employeeCookie, 403);
  await request('/settings', 'GET', undefined, employeeCookie, 403);
  await request('/reports/financial?year=2026', 'GET', undefined, employeeCookie, 403);
  await request('/admin/employees', 'GET', undefined, adminCookie, 200);
  await request('/admin/employees', 'GET', undefined, otherCookie, 403);

  await request('/employee/work-sessions', 'POST', {}, employeeCookie, 400);
  const startRequestId = uuid();
  const overlappingStartRequestId = uuid();
  const started = await request('/employee/work-sessions', 'POST', { requestId: startRequestId }, employeeCookie, 201);
  const retryStart = await request('/employee/work-sessions', 'POST', { requestId: startRequestId }, employeeCookie, 200);
  assert.equal(retryStart.value.id, started.value.id);
  const overlappingStart = await request(
    '/employee/work-sessions', 'POST', { requestId: overlappingStartRequestId }, employeeCookie, 200,
  );
  assert.equal(overlappingStart.value.id, started.value.id);
  const otherHistory = await request('/employee/work-sessions', 'GET', undefined, otherCookie);
  assert.equal(otherHistory.value.active, null);
  await request(`/employee/work-sessions/${started.value.id}/end`, 'POST', {}, otherCookie, 404);
  const ended = await request(`/employee/work-sessions/${started.value.id}/end`, 'POST', {}, employeeCookie);
  assert.equal(ended.value.status, 'completed');
  assert.ok(ended.value.end_time);
  assert.ok(ended.value.duration_minutes >= 0);
  const retryEnd = await request(`/employee/work-sessions/${started.value.id}/end`, 'POST', {}, employeeCookie);
  assert.equal(retryEnd.value.end_time, ended.value.end_time);
  const lateRetryStart = await request(
    '/employee/work-sessions', 'POST', { requestId: startRequestId }, employeeCookie,
  );
  assert.equal(lateRetryStart.value.id, started.value.id);
  assert.equal(lateRetryStart.value.status, 'completed');
  const lateOverlappingStart = await request(
    '/employee/work-sessions', 'POST', { requestId: overlappingStartRequestId }, employeeCookie,
  );
  assert.equal(lateOverlappingStart.value.id, started.value.id);
  await request('/employee/work-sessions', 'GET', undefined, undefined, 401);

  const employeeRequestBody = {
    type: 'assistance', title: 'Matériel à vérifier', message: 'La caisse ne répond plus.',
    idempotencyKey: uuid(),
  };
  const employeeRequest = await request('/employee/requests', 'POST', employeeRequestBody, employeeCookie, 201);
  assert.equal(employeeRequest.value.idempotency_key, undefined);
  const repeatedEmployeeRequest = await request('/employee/requests', 'POST', employeeRequestBody, employeeCookie);
  assert.equal(repeatedEmployeeRequest.value.id, employeeRequest.value.id);
  assert.equal(db.all('operational_requests').length, 1);
  await request('/employee/requests', 'POST', {
    type: 'issue', title: ' ', message: 'Invalid submission.', idempotencyKey: uuid(),
  }, employeeCookie, 400);
  assert.equal(db.all('operational_requests').length, 1);
  assert.equal(db.all('notifications').filter(item => item.type === 'operational_request').length, 1);
  assert.equal(db.all('notifications').filter(item => item.type === 'operational_request').length, 1);
  const employeeNotifications = await request('/notifications?state=all', 'GET', undefined, employeeCookie);
  assert.deepEqual(employeeNotifications.value.items, []);
  const adminNotifications = await request('/notifications?state=unread', 'GET', undefined, adminCookie);
  assert.equal(adminNotifications.value.items.filter(item => item.type === 'operational_request').length, 1);
  const adminRequestList = await request('/admin/requests', 'GET', undefined, adminCookie);
  assert.equal(adminRequestList.value.items[0].employee.id, createdUser.id);
  await request('/admin/requests', 'GET', undefined, employeeCookie, 403);
  await request('/admin/notifications', 'POST', {
    recipientId: otherEmployeeId, title: 'Information', message: 'Fermeture à 18 h.',
    priority: 'normal', idempotencyKey: uuid(),
  }, employeeCookie, 403);
  const announcementKey = uuid();
  const announcementBody = {
    recipientId: otherEmployeeId, title: 'Information', message: 'Fermeture à 18 h.',
    priority: 'normal', idempotencyKey: announcementKey,
  };
  const announcement = await request('/admin/notifications', 'POST', announcementBody, adminCookie, 201);
  assert.equal(announcement.value.sent, 1);
  await request('/admin/notifications', 'POST', announcementBody, adminCookie, 201);
  assert.equal(db.all('notifications').filter(item => item.type === 'admin_announcement').length, 1);
  const otherNotifications = await request('/notifications?state=unread', 'GET', undefined, otherCookie);
  const announcementItem = otherNotifications.value.items.find(item => item.type === 'admin_announcement');
  assert.ok(announcementItem);
  await request(`/notifications/${announcementItem.id}/action`, 'PATCH', { action: 'read' }, employeeCookie, 404);
  await request(`/notifications/${announcementItem.id}/action`, 'PATCH', { action: 'read' }, otherCookie);
  const count = await request('/notifications/unread-count', 'GET', undefined, otherCookie);
  assert.equal(count.value.count, 0);
  await request(`/notifications/${announcementItem.id}/action`, 'PATCH', { action: 'unread' }, otherCookie);
  assert.equal((await request('/notifications/unread-count', 'GET', undefined, otherCookie)).value.count, 1);
  await request('/notifications/read-all', 'POST', {}, otherCookie);
  assert.equal((await request('/notifications/unread-count', 'GET', undefined, otherCookie)).value.count, 0);
  const updatedRequest = await request(`/admin/requests/${employeeRequest.value.id}`, 'PATCH', {
    status: 'resolved', response: 'La caisse a été redémarrée.',
  }, adminCookie);
  assert.equal(updatedRequest.value.status, 'resolved');
  assert.equal(db.all('notifications').filter(item => item.type === 'request_update').length, 1);
  const ticketFallback = await request('/notifications/socket-ticket', 'POST', {}, adminCookie);
  assert.equal(ticketFallback.value.mode, 'polling');

  const activeShift = await request('/employee/work-sessions', 'POST', { requestId: uuid() }, employeeCookie, 201);
  await request(`/admin/work-sessions/${activeShift.value.id}/end`, 'POST', {
    reason: 'Unauthorized close attempt.',
  }, employeeCookie, 403);
  await request(`/admin/work-sessions/${activeShift.value.id}/end`, 'POST', {
    reason: 'Employee left unexpectedly.',
  }, adminCookie);
  const audit = db.all('admin_audit_logs').find(row => row.target_id === activeShift.value.id);
  assert.equal(audit.actor_id, adminId);
  assert.equal(audit.reason, 'Employee left unexpectedly.');
  assert.equal(db.all('notifications').filter(item => item.type === 'shift_admin_closed').length, 1);

  await request(`/admin/employees/${createdUser.id}/status`, 'PATCH', {
    status: 'disabled', reason: 'Contract ended.',
  }, adminCookie);
  assert.equal(db.all('users').find(user => user.id === createdUser.id).status, 'disabled');
  assert.equal(db.all('notifications').filter(item => item.type === 'account_status').length, 1);
  assert.equal(db.all('admin_audit_logs').length, 2);
  await request('/auth/session', 'GET', undefined, employeeCookie, 401);
  await request('/employee/work-sessions', 'GET', undefined, employeeCookie, 401);
});
