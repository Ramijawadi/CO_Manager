import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function loadApi(base) {
  const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.VITE_API_URL', 'environment.VITE_API_URL');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  });
  const requests = [];
  const exports = {};
  new Function('exports', 'environment', 'fetch', outputText)(
    exports, { VITE_API_URL: base }, async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => [] };
    },
  );
  return { ...exports, requests };
}

test('API URLs stay on the current deployment with configured and default bases', async () => {
  for (const base of [undefined, '', '/api', '/api/']) {
    const api = loadApi(base);
    for (const path of ['/auth/session', '/settings?limit=1', '/customers', '/users', '/events']) {
      assert.equal(api.apiUrl(path), `/api${path}`);
      await api.apiRequest(path);
      assert.equal(api.requests.at(-1).url, `/api${path}`);
      assert.equal(api.requests.at(-1).options.credentials, 'same-origin');
    }
    assert.equal(api.apiUrl('products'), '/api/products');
  }
});

test('misconfigured API bases cannot send requests to another origin or a development port', async () => {
  for (const base of ['http://localhost:3001/api', 'http://127.0.0.1:5000/api', '//foreign.example/api', '"/api"']) {
    const api = loadApi(base);
    await assert.rejects(api.apiRequest('/settings'), /VITE_API_URL must be \/api/);
    assert.equal(api.requests.length, 0);
  }
});
