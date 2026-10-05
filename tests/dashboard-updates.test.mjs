import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function loadHook(config, { failRefresh = false } = {}) {
  const source = readFileSync(new URL('../src/hooks/useDatabaseRealtime.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  });
  const states = [];
  const timers = [];
  const streams = [];
  const requests = [];
  let cleanup;
  let refreshes = 0;
  const client = { invalidateQueries: async () => {
    refreshes++;
    if (failRefresh) throw new Error('Offline');
  } };
  const dependencies = {
    react: {
      useState: initial => [initial, value => states.push(value)],
      useEffect: callback => { cleanup = callback(); },
    },
    '@tanstack/react-query': { useQueryClient: () => client },
    '../lib/api': { apiRequest: async (...args) => { requests.push(args); return config; } },
  };
  class FakeEventSource {
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; streams.push(this); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    close() { this.closed = true; }
  }
  const exports = {};
  new Function('require', 'exports', 'EventSource', 'setTimeout', 'clearTimeout', 'console', outputText)(
    name => dependencies[name], exports, FakeEventSource,
    (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    timer => { if (timer) timer.cleared = true; },
    { error: (...args) => requests.push(['error', ...args]) },
  );
  exports.useDatabaseRealtime();
  return { states, timers, streams, requests, cleanup: () => cleanup(), refreshes: () => refreshes };
}

const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('Vercel polling refreshes immediately and every 15 seconds without EventSource', async () => {
  const hook = loadHook({ mode: 'polling', intervalMs: 15000 });
  await flush();
  assert.equal(hook.requests[0][0], '/realtime/config');
  assert.equal(hook.refreshes(), 1);
  assert.deepEqual(hook.states, ['polling']);
  assert.equal(hook.streams.length, 0);
  assert.equal(hook.timers[0].delay, 15000);
  await hook.timers[0].callback();
  await flush();
  assert.equal(hook.refreshes(), 2);
  hook.cleanup();
  assert.equal(hook.timers.at(-1).cleared, true);
  assert.equal(hook.requests[0][1].signal.aborted, true);
});

test('polling reports failed data refreshes instead of a connected status and retries', async () => {
  const hook = loadHook({ mode: 'polling', intervalMs: 15000 }, { failRefresh: true });
  await flush();
  assert.deepEqual(hook.states, ['error']);
  assert.ok(hook.requests.some(([name]) => name === 'error'));
  assert.equal(hook.timers[0].delay, 15000);
  hook.cleanup();
});

test('traditional hosting retains event streaming and closes the connection on unmount', async () => {
  const hook = loadHook({ mode: 'streaming' });
  await flush();
  assert.equal(hook.streams.length, 1);
  assert.equal(hook.streams[0].url, '/api/events');
  hook.streams[0].listeners.ready();
  assert.equal(hook.states.at(-1), 'connected');
  hook.streams[0].onmessage({ data: '{"table":"sessions"}' });
  assert.equal(hook.refreshes(), 2);
  hook.cleanup();
  assert.equal(hook.streams[0].closed, true);
  assert.equal(hook.timers.length, 0);
});
