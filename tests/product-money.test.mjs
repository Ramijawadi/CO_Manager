import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import dayjs from 'dayjs';

function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

const money = loadModule('lib/productMoney.ts');
const product = { id: 'product', name: 'Coffee', description: '', price: 1500, stock: 10 };
const item = { id: 'item', session_id: 'session', product_id: product.id,
  quantity: 2, total_price: 3000, products: product, created_at: dayjs().toISOString() };
const session = { id: 'session', customer_id: 'customer', status: 'completed',
  entry_time: dayjs().toISOString(), exit_time: dayjs().toISOString(), time_cost: 5,
  session_products: [item] };

function loadFeature(path, respond) {
  const requests = [];
  const api = loadModule(path, {
    '../../lib/productMoney': money,
    dayjs,
    '../../lib/api': {
      jsonBody: JSON.stringify,
      apiRequest: async (path, options = {}) => {
        requests.push({ path, ...options });
        return respond(path, options);
      },
    },
  });
  return { api, requests };
}

test('millime conversion and product format preserve three-digit fractions and rounding', () => {
  for (const [millimes, expected] of [[0, '0dt'], [1, '0dt.001'], [50, '0dt.050'],
    [500, '0dt.500'], [1000, '1dt'], [1500, '1dt.500'], [1500000, '1500dt']]) {
    const dinars = money.productInDinars({ ...product, price: millimes }).price;
    assert.equal(money.formatProductPrice(dinars), expected);
    assert.equal(money.toProductMillimes(dinars), millimes);
  }
  assert.equal(money.toProductMillimes(1.001 * 3), 3003);
  assert.equal(money.formatProductPrice(1.9999), '2dt');
  const converted = money.sessionInDinars(session);
  assert.equal(converted.time_cost, 5);
  assert.equal(converted.session_products[0].total_price, 3);
  assert.equal(converted.session_products[0].products.price, 1.5);
  assert.equal(converted.session_products[0].quantity, 2);
  assert.equal(item.total_price, 3000);
  assert.equal(product.price, 1500);
});

test('product forms read dinars and save integer millimes without altering stock-only updates', async () => {
  const { api, requests } = loadFeature('features/products/api.ts', (path, options) =>
    options.method ? { ...product, ...JSON.parse(options.body) } : [product]);
  assert.equal((await api.getProducts())[0].price, 1.5);
  assert.equal((await api.createProduct({ ...product, price: 1.5 })).price, 1.5);
  assert.equal(JSON.parse(requests.at(-1).body).price, 1500);
  assert.equal((await api.updateProduct(product.id, { price: 1.001 })).price, 1.001);
  assert.equal(JSON.parse(requests.at(-1).body).price, 1001);
  await api.updateProduct(product.id, { stock: 20 });
  assert.deepEqual(JSON.parse(requests.at(-1).body), { stock: 20 });
});

test('product table renders a stored 1500-millime price as 1dt.500', async () => {
  const { api } = loadFeature('features/products/api.ts', () => [product]);
  const products = await api.getProducts();
  const element = (type, props) => ({ type, props });
  const { default: ProductList } = loadModule('features/products/ProductList.tsx', {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    react: { useState: initial => [initial, () => {}] },
    antd: { Table: 'Table', Input: 'Input', Space: 'Space', Popconfirm: 'Popconfirm', message: {} },
    '@ant-design/icons': {},
    '@tanstack/react-query': {
      useQueryClient: () => ({}),
      useQuery: () => ({ data: products, isLoading: false }),
      useMutation: () => ({}),
    },
    './api': api,
    './ProductForm': { default: 'ProductForm', __esModule: true },
    '../../components/AuthButton': { AuthButton: 'AuthButton' },
    '../../hooks/usePermissions': { usePermissions: () => ({ requireAdmin: () => true, isDemo: false }) },
    '../../lib/productMoney': money,
  });
  const findTable = node => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'Table') return node;
    for (const child of [node.props?.children].flat()) {
      const table = findTable(child);
      if (table) return table;
    }
    return undefined;
  };
  const table = findTable(ProductList());
  assert.ok(table);
  const priceColumn = table.props.columns.find(column => column.key === 'price');
  assert.equal(priceColumn.render(table.props.dataSource[0].price), '1dt.500');
});

test('session product writes use millimes while checkout time charges and joined totals use dinars', async () => {
  const { api, requests } = loadFeature('features/sessions/api.ts', (_path, options) =>
    options.method ? session : [session]);
  assert.equal((await api.getActiveSessions())[0].session_products[0].total_price, 3);
  await api.addSessionProduct('session', 'product', 3, 1.001 * 3);
  assert.equal(JSON.parse(requests.at(-1).body).total_price, 3003);
  const checkout = { status: 'completed', exit_time: session.exit_time, time_cost: 5 };
  assert.equal((await api.checkoutSession('session', checkout)).session_products[0].total_price, 3);
  assert.deepEqual(JSON.parse(requests.at(-1).body), checkout);
  assert.equal((await api.createSession({ customer_id: 'customer' })).session_products[0].total_price, 3);
});

test('dashboard revenue, charts and top products combine product dinars with unchanged time charges', async () => {
  const { api } = loadFeature('features/dashboard/api.ts', path =>
    path.startsWith('/session_products') ? [item] : {
      sessions: [session], session_products: [item], activeSubscriptions: 2, activeSessions: 1,
    });
  assert.deepEqual(await api.getDashboardStats(), {
    totalVisitorsToday: 1, activeSessions: 1, revenueToday: 8,
    activeSubscriptions: 2, productSalesToday: 2,
  });
  assert.equal((await api.getChartData()).revenueData.reduce((sum, point) => sum + point.revenue, 0), 8);
  assert.deepEqual(await api.getTopProducts(), [
    { product_id: 'product', name: 'Coffee', quantity_sold: 2, revenue: 3 },
  ]);
});

test('report and export source totals use dinars and archived daily closures are not rescaled', async () => {
  const closure = { total_revenue: 8, product_sales: 2, time_revenue: 5, total_visitors: 1 };
  const { api, requests } = loadFeature('features/reports/api.ts', path =>
    path.startsWith('/sessions') ? [session] : [closure]);
  const [report] = await api.getReportData('2026-10-01', '2026-10-05');
  assert.equal(report.time_cost + report.session_products[0].total_price, 8);
  assert.deepEqual(await api.getDailyClosures(), [closure]);
  await api.closeDay('2026-10-05', closure);
  assert.deepEqual(JSON.parse(requests.at(-1).body), { closure_date: '2026-10-05', ...closure });
});
