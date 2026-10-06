import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function renderComponent(file, sessions = []) {
  const source = readFileSync(new URL(`../src/features/sessions/${file}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2023,
      esModuleInterop: true,
    },
  });
  const dependencies = {
    react: { useState: initial => [initial, () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    antd: {
      Table: 'table',
      Modal: 'modal',
      Form: Object.assign('form', {
        useForm: () => [{}],
        useWatch: () => undefined,
        Item: 'form-item',
      }),
      Select: 'select',
      InputNumber: 'input-number',
      Input: 'input',
      Button: 'button',
      Popconfirm: 'popconfirm',
      Typography: { Text: 'text' },
    },
    '@ant-design/icons': {},
    '@tanstack/react-query': {
      useQuery: ({ queryKey }) => ({ data: queryKey[0] === 'activeSessions' ? sessions : [] }),
      useMutation: () => ({}),
      useQueryClient: () => ({}),
    },
    '../../components/AuthButton': { AuthButton: 'auth-button' },
    '../../hooks/usePermissions': { usePermissions: () => ({ requireAdmin: () => true, isDemo: false }) },
    '../../lib/productMoney': { formatProductPrice: value => `${value.toFixed(3)}dt` },
    '../../utils/time': {},
    '../products/api': {},
    '../customers/api': {},
    './api': {},
    './SessionConsumptionPanel': { default: 'consumption-panel' },
  };
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports.default;
}

test('consumed products retain every row with fixed-header scrolling and five-row pagination', () => {
  const Panel = renderComponent('SessionConsumptionPanel');
  for (const count of [0, 4, 12]) {
    const products = Array.from({ length: count }, (_, index) => ({
      id: `product-${index}`, quantity: 1, total_price: 0.8,
    }));
    const panel = Panel({ session: { id: 'session-1', session_products: products } });
    const table = panel.props.children.find(child => child.type === 'table');
    assert.equal(table.props.dataSource, products);
    assert.deepEqual(table.props.scroll, { x: 520, y: 240 });
    assert.equal(table.props.pagination.defaultPageSize, 5);
    assert.equal(table.props.pagination.showSizeChanger, false);
    assert.equal(table.props.pagination.showTotal(count), `Total: ${count} produit${count > 1 ? 's' : ''}`);
  }
});

test('the sessions viewport scrolls so expanded products and page controls are not clipped', () => {
  const SessionList = renderComponent('SessionList');
  const page = SessionList();
  const viewport = page.props.children[1];
  assert.equal(viewport.props.style.overflow, 'auto');
  assert.equal(viewport.props.style.minHeight, 0);
  assert.equal(viewport.props.style.flex, 1);
  assert.equal(viewport.props.children.type, 'table');
});
