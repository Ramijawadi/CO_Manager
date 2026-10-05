import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createVercelHandler, restoreApiPath } from '../server/vercel-handler.mjs';
import { hashPassword, tokenHash, cookieOptions } from '../server/auth.mjs';
import { databaseConfig, DatabaseConfigError } from '../server/config.mjs';

async function startServer(handler, t) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('Vercel routes API before filesystem/SPA and targets a real function', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, 'vite');
  assert.equal(config.outputDirectory, 'dist');
  const match = new RegExp(`^${config.routes[0].src}$`).exec('/api/auth/session');
  assert.equal(match[1], 'auth/session');
  assert.equal(config.routes[0].dest, '/api/index?__path=$1');
  assert.deepEqual(config.routes[1], { handle: 'filesystem' });
  assert.equal(config.routes[2].dest, '/index.html');
  assert.ok(readFileSync(new URL('../api/index.mjs', import.meta.url), 'utf8').includes('export default'));
});

test('API rewrite restores nested paths and preserves query filters without internal parameters', () => {
  const req = { url: '/api/index?__path=subscriptions&customer_id=abc&status=active' };
  restoreApiPath(req);
  assert.equal(req.url, '/api/subscriptions?customer_id=abc&status=active');
  const direct = { url: '/api/auth/login' };
  restoreApiPath(direct);
  assert.equal(direct.url, '/api/auth/login');
});

test('Vercel pre-parsed queries do not leak rewrite parameters into strict API validation', async t => {
  const token = 'a'.repeat(64);
  const user = { id: '12345678-1234-1234-1234-123456789abc', email: 'test@example.com', role: 'admin' };
  const filters = [];
  const db = {
    collection: name => {
      if (name === 'users') return { findOne: async () => user };
      if (name === 'auth_sessions') return { findOne: async filter => {
        assert.equal(filter.token_hash, tokenHash(token));
        return { id: 'auth-session', user_id: user.id };
      } };
      return {
        find: filter => {
          filters.push({ name, filter });
          return { sort() { return this; }, toArray: async () => [] };
        },
        countDocuments: async filter => {
          filters.push({ name, filter });
          return name === 'subscriptions' ? 2 : 3;
        },
      };
    },
  };
  const handler = createVercelHandler({ connect: async () => ({ db, client: {} }) });
  const base = await startServer((req, res) => {
    const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    Object.defineProperty(req, 'query', { configurable: true, get: () => query });
    return handler(req, res);
  }, t);
  const headers = { Cookie: `co_manager_session=${token}` };
  const query = 'since=2026-10-04T23%3A00%3A00.000Z&active_on=2026-10-05';
  for (const path of [
    `/api/index?__path=dashboard%2Fdata&${query}`,
    `/api/dashboard/data?${query}`,
  ]) {
    const response = await fetch(`${base}${path}`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body, {
      sessions: [], session_products: [], activeSubscriptions: 2, activeSessions: 3,
    });
  }
  assert.deepEqual(filters.slice(0, 4), [
    { name: 'sessions', filter: { entry_time: { $gte: '2026-10-04T23:00:00.000Z' } } },
    { name: 'session_products', filter: { created_at: { $gte: '2026-10-04T23:00:00.000Z' } } },
    { name: 'subscriptions', filter: {
      status: 'active', start_date: { $lte: '2026-10-05' }, end_date: { $gte: '2026-10-05' },
    } },
    { name: 'sessions', filter: { status: 'active' } },
  ]);
  const subscriptions = await fetch(`${base}/api/index?__path=subscriptions&status=active&active_on=2026-10-05`, { headers });
  assert.equal(subscriptions.status, 200);
  assert.deepEqual(await subscriptions.json(), []);
  for (const invalid of [
    `${query}&unexpected=value`,
    'since=invalid&active_on=2026-10-05',
    'since=2026-10-04T23%3A00%3A00.000Z',
    `${query}&active_on=2026-10-06`,
  ]) {
    const response = await fetch(`${base}/api/index?__path=dashboard%2Fdata&${invalid}`, { headers });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).message);
  }
});

test('Vercel cookies stay secure even outside the production Node environment', t => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  });
  assert.equal(cookieOptions().secure, true);
  assert.equal(cookieOptions().httpOnly, true);
});

test('concurrent warm invocations reuse the same application and MongoDB connection', async t => {
  let connects = 0;
  let builds = 0;
  const handler = createVercelHandler({
    connect: async () => { connects++; await new Promise(resolve => setTimeout(resolve, 20)); return { db: {}, client: {} }; },
    buildApp: async options => {
      builds++;
      assert.equal(options.serverless, true);
      assert.equal(options.serveFrontend, false);
      return (req, res) => { res.end(req.url); };
    },
  });
  const base = await startServer(handler, t);
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`${base}/api/index?__path=health`)));
  for (const response of responses) {
    assert.equal(await response.text(), '/api/health');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(connects, 1);
  assert.equal(builds, 1);
});

test('failed cold starts return JSON and retry initialization on the next invocation', async t => {
  let attempts = 0;
  const handler = createVercelHandler({
    connect: async () => {
      if (++attempts === 1) throw new Error('Unavailable');
      return { db: {}, client: {} };
    },
    buildApp: async () => (_req, res) => { res.end('ready'); },
  });
  const base = await startServer(handler, t);
  const failure = await fetch(`${base}/api/index?__path=health`);
  assert.equal(failure.status, 503);
  assert.match(failure.headers.get('content-type'), /application\/json/);
  assert.match((await failure.json()).message, /MONGODB_URI/);
  const success = await fetch(`${base}/api/index?__path=health`);
  assert.equal(success.status, 200);
  assert.equal(await success.text(), 'ready');
  assert.equal(attempts, 2);
});

test('database configuration distinguishes missing and malformed deployment values without exposing them', () => {
  const valid = { MONGODB_URI: 'mongodb+srv://user:private-password@cluster.example.com/', MONGODB_DB_NAME: 'co_management' };
  assert.deepEqual(databaseConfig(valid), { uri: valid.MONGODB_URI, name: valid.MONGODB_DB_NAME });
  for (const [env, expected] of [
    [{ ...valid, MONGODB_URI: undefined }, /MONGODB_URI is missing/],
    [{ ...valid, MONGODB_URI: `"${valid.MONGODB_URI}"` }, /surrounding quotes/],
    [{ ...valid, MONGODB_URI: `MONGODB_URI=${valid.MONGODB_URI}` }, /must start/],
    [{ ...valid, MONGODB_URI: ` ${valid.MONGODB_URI}` }, /must start/],
    [{ ...valid, MONGODB_DB_NAME: undefined }, /MONGODB_DB_NAME is missing/],
    [{ ...valid, MONGODB_DB_NAME: '"co_management"' }, /without surrounding quotes/],
  ]) {
    assert.throws(() => databaseConfig(env), error => {
      assert.ok(error instanceof DatabaseConfigError);
      assert.match(error.message, expected);
      assert.equal(error.message.includes('private-password'), false);
      return true;
    });
  }
});

test('Vercel exposes only safe database configuration diagnostics', async t => {
  const handler = createVercelHandler({
    connect: async () => { databaseConfig({ MONGODB_URI: '"mongodb+srv://user:private-password@cluster.example.com/"' }); },
  });
  const base = await startServer(handler, t);
  const response = await fetch(`${base}/api/auth/session`);
  assert.equal(response.status, 503);
  const { message } = await response.json();
  assert.match(message, /MONGODB_URI contains surrounding quotes/);
  assert.equal(message.includes('private-password'), false);
});

test('serverless Express supports HTTPS proxy login, secure cookies, polling and API-only routing', async t => {
  const user = {
    id: '12345678-1234-1234-1234-123456789abc',
    email: 'test@example.com', role: 'admin', password_hash: await hashPassword('test-password'),
  };
  const sessions = [];
  const db = {
    command: async () => ({ ok: 1 }),
    collection: name => {
      if (name === 'users') return { findOne: async filter => filter.email === user.email || filter.id === user.id ? user : null };
      if (name === 'auth_sessions') return {
        insertOne: async session => { sessions.push(session); },
        findOne: async filter => sessions.find(session => session.token_hash === filter.token_hash && session.expires_at > filter.expires_at.$gt),
        deleteOne: async filter => { const index = sessions.findIndex(session => session.id === filter.id); if (index >= 0) sessions.splice(index, 1); },
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  };
  const handler = createVercelHandler({ connect: async () => ({ db, client: {} }) });
  const base = await startServer(handler, t);
  const origin = process.env.APP_ORIGIN || 'https://beta.example.com';
  const headers = { 'Content-Type': 'application/json', Origin: origin,
    Host: new URL(origin).host, 'X-Forwarded-Host': new URL(origin).host,
    'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '192.0.2.1' };
  const url = path => `${base}/api/index?__path=${encodeURIComponent(path)}`;
  const login = await fetch(url('auth/login'), {
    method: 'POST', headers, body: JSON.stringify({ email: user.email, password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.role, 'admin');
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(sessions[0].token_hash, tokenHash(cookie.split('=')[1]));
  const authenticated = { ...headers, Cookie: cookie };
  const session = await fetch(url('auth/session'), { headers: authenticated });
  assert.equal(session.status, 200);
  const polling = await fetch(url('realtime/config'), { headers: authenticated });
  assert.deepEqual(await polling.json(), { mode: 'polling', intervalMs: 15000 });
  const events = await fetch(url('events'), { headers: authenticated });
  assert.equal(events.status, 409);
  const invalid = await fetch(url('missing'), { headers: authenticated });
  assert.equal(invalid.status, 404);
  assert.match(invalid.headers.get('content-type'), /application\/json/);
  const foreign = await fetch(url('auth/logout'), {
    method: 'POST', headers: { ...authenticated, Origin: 'https://untrusted.example' },
  });
  assert.equal(foreign.status, 403);
  const logout = await fetch(url('auth/logout'), { method: 'POST', headers: authenticated });
  assert.equal(logout.status, 204);
  const expired = await fetch(url('auth/session'), { headers: authenticated });
  assert.equal(expired.status, 401);
  assert.equal(sessions.length, 0);
});
