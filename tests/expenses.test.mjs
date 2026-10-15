import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { createApp } from '../server/app.mjs';
import { schemas } from '../server/validation.mjs';
import { initializeDatabase } from '../server/schema.mjs';

const input = {
  name: 'Facture internet', category: 'Internet', amount: 60500,
  expense_date: '2026-10-14', notes: 'Octobre',
};

test('expense validation accepts custom categories and rejects invalid financial records', () => {
  assert.deepEqual(schemas.expenses.create.parse(input), input);
  assert.equal(schemas.expenses.create.parse({ ...input, category: 'Réparation' }).category, 'Réparation');
  assert.equal(schemas.expenses.create.parse({ ...input, name: ' Facture ' }).name, 'Facture');
  assert.deepEqual(schemas.expenses.update.parse({ notes: '' }), { notes: '' });
  for (const invalid of [
    { amount: -1 }, { amount: 0 }, { amount: 0.5 }, { amount: Infinity },
    { amount: NaN }, { amount: 1_000_000_000_001 }, { amount: '60' },
    { name: ' ' }, { category: '' }, { category: 'a'.repeat(201) },
    { expense_date: '2026-02-30' }, { expense_date: 'invalid' },
    { notes: 'a'.repeat(10001) }, { id: 'injected' },
  ]) {
    assert.throws(() => schemas.expenses.create.parse({ ...input, ...invalid }));
    assert.throws(() => schemas.expenses.update.parse(invalid));
  }
});

test('database setup creates expense validation and the list ordering index', async () => {
  const collections = new Map();
  const indexes = [];
  const db = {
    listCollections: () => ({ toArray: async () => [] }),
    createCollection: async (name, options) => collections.set(name, options),
    collection: name => ({
      createIndex: async (key, options) => indexes.push({ name, key, options }),
      updateOne: async () => {},
    }),
  };
  await initializeDatabase(db);
  const schema = collections.get('expenses').validator.$jsonSchema;
  assert.deepEqual(schema.required, ['id', 'name', 'category', 'amount', 'expense_date']);
  assert.equal(schema.properties.amount.minimum, 1);
  assert.equal(schema.properties.amount.multipleOf, 1);
  assert.ok(indexes.some(index => index.name === 'expenses' && index.key.id === 1 && index.options.unique));
  assert.ok(indexes.some(index => index.name === 'expenses' &&
    index.key.expense_date === -1 && index.key.created_at === -1));
});

test('authenticated expense API supports full CRUD, validation and demo read-only permissions', async t => {
  const rows = new Map();
  let role = 'admin';
  const sorts = [];
  const db = {
    collection: name => {
      if (name === 'auth_sessions') return {
        findOne: async () => ({ id: 'session', user_id: 'user' }),
      };
      if (name === 'users') return {
        findOne: async () => ({ id: 'user', email: 'test@example.com', role }),
      };
      assert.equal(name, 'expenses');
      return {
        find: () => ({
          sort(order) { sorts.push(order); return this; },
          toArray: async () => [...rows.values()].sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
        }),
        findOne: async ({ id }) => rows.get(id),
        insertOne: async row => { rows.set(row.id, { ...row }); },
        findOneAndUpdate: async ({ id }, { $set }) => {
          const row = { ...rows.get(id), ...$set };
          rows.set(id, row);
          return row;
        },
        deleteOne: async ({ id }) => { rows.delete(id); },
      };
    },
  };
  const client = { withSession: callback => callback({ withTransaction: callback => callback() }) };
  const app = await createApp({ db, client, serverless: true, serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/expenses`;
  const request = async (suffix = '', method = 'GET', body, expected = 200, authenticated = true) => {
    const response = await fetch(`${base}${suffix}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated ? { Cookie: `co_manager_session=${'a'.repeat(64)}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
  await request('', 'GET', undefined, 401, false);
  await request('', 'POST', input, 401, false);
  const created = await request('', 'POST', input, 201);
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.ok(created.created_at && created.updated_at);
  assert.deepEqual(await request(), [created]);
  assert.deepEqual(sorts.at(-1), { expense_date: -1, created_at: -1 });
  for (const invalid of [{ amount: -1 }, { amount: 0.1 }, { expense_date: 'bad' }, { role: 'admin' }]) {
    await request('', 'POST', { ...input, ...invalid }, 400);
    await request(`/${created.id}`, 'PATCH', invalid, 400);
  }
  await request(`/${created.id}`, 'PATCH', {}, 400);
  const updated = await request(`/${created.id}`, 'PATCH', { amount: 70001, category: 'Frais divers', notes: '' });
  assert.equal(updated.name, input.name);
  assert.equal(updated.expense_date, input.expense_date);
  assert.equal(updated.amount, 70001);
  assert.equal(updated.notes, '');
  role = 'demo';
  assert.equal((await request())[0].category, 'Frais divers');
  await request('', 'POST', input, 403);
  await request(`/${created.id}`, 'PATCH', { amount: 80000 }, 403);
  await request(`/${created.id}`, 'DELETE', undefined, 403);
  role = 'staff';
  await request(`/${created.id}`, 'PATCH', { name: 'Updated by staff' });
  await request(`/${created.id}`, 'DELETE', undefined, 204);
  assert.deepEqual(await request(), []);
  await request(`/${created.id}`, 'PATCH', { amount: 50000 }, 404);
  await request(`/${created.id}`, 'DELETE', undefined, 404);
});

function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

test('expense frontend API converts DT to integer millimes and preserves partial updates', async () => {
  const requests = [];
  const row = { ...input, id: 'expense', created_at: '', updated_at: '' };
  const api = loadModule('features/expenses/api.ts', {
    '../../lib/productMoney': loadModule('lib/productMoney.ts'),
    '../../lib/api': {
      jsonBody: JSON.stringify,
      apiRequest: async (path, options = {}) => {
        requests.push({ path, ...options });
        if (options.method === 'DELETE') return;
        return options.method ? { ...row, ...JSON.parse(options.body) } : [row];
      },
    },
  });
  assert.equal((await api.getExpenses())[0].amount, 60.5);
  assert.equal((await api.createExpense({ ...input, amount: 1.001 })).amount, 1.001);
  assert.equal(JSON.parse(requests.at(-1).body).amount, 1001);
  assert.equal((await api.updateExpense(row.id, { amount: 0.001 })).amount, 0.001);
  assert.equal(JSON.parse(requests.at(-1).body).amount, 1);
  await api.updateExpense(row.id, { notes: '' });
  assert.deepEqual(JSON.parse(requests.at(-1).body), { notes: '' });
  await api.deleteExpense(row.id);
  assert.equal(requests.at(-1).path, '/expenses/expense');
  assert.equal(requests.at(-1).method, 'DELETE');
  const { formatExpenseAmount } = loadModule('features/expenses/types.ts');
  assert.match(formatExpenseAmount(1.001), /1,001 DT/);
});

test('editing a category always offers the complete list regardless of the saved value', () => {
  const values = {};
  const form = {
    resetFields: () => {},
    setFieldsValue: fields => Object.assign(values, fields),
  };
  const element = (type, props) => ({ type, props });
  const Form = Object.assign('Form', { useForm: () => [form], Item: 'FormItem' });
  const { default: ExpenseForm } = loadModule('features/expenses/ExpenseForm.tsx', {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    react: {
      useEffect: callback => { callback(); },
    },
    antd: { AutoComplete: 'AutoComplete', Form, Input: { TextArea: 'TextArea' },
      InputNumber: 'InputNumber', DatePicker: 'DatePicker', Modal: 'Modal' },
    dayjs: { default: value => ({ format: () => value }), __esModule: true },
  });
  const findCategory = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AutoComplete') return node.props;
    for (const child of [node.props?.children].flat()) {
      const result = findCategory(child);
      if (result) return result;
    }
  };
  const render = () => findCategory(ExpenseForm({
    open: true, initialValues: input, categories: ['Internet', 'Eau', 'Électricité'],
    loading: false, onSubmit: () => {}, onCancel: () => {},
  }));
  const category = render();
  assert.equal(values.category, 'Internet');
  assert.equal(category.allowClear, true);
  assert.equal(category.filterOption, false);
  assert.deepEqual(category.options, [
    { value: 'Internet' }, { value: 'Eau' }, { value: 'Électricité' },
  ]);
});
