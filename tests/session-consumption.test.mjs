import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function renderComponent(file, sessions = [], isReadOnly = false, products = [], selectedProductIds = []) {
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
        useWatch: field => field === 'product_ids' ? selectedProductIds : undefined,
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
      useQuery: ({ queryKey }) => ({
        data: queryKey[0] === 'activeSessions' ? sessions : queryKey[0] === 'products' ? products : [],
      }),
      useMutation: () => ({}),
      useQueryClient: () => ({}),
    },
    '../../components/AuthButton': { AuthButton: 'auth-button' },
    '../../hooks/usePermissions': { usePermissions: employeeOnly => {
      assert.equal(employeeOnly, true);
      return { requireWrite: () => !isReadOnly, isReadOnly };
    } },
    '../../lib/productMoney': { formatProductPrice: value => `${value.toFixed(3)}dt` },
    '../../utils/time': {},
    '../../i18n': { getDateLocale: () => 'fr-FR' },
    'react-i18next': {
      useTranslation: () => ({
        t: (key, values) => key.replace('{{count}}', String(values?.count ?? '{{count}}')),
        i18n: { resolvedLanguage: 'fr' },
      }),
    },
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
    assert.equal(table.props.pagination.showTotal(count),
      count === 1 ? 'Total : 1 produit' : `Total : ${count} produits`);
  }
});

test('the add-product form allows selecting multiple products with individual quantities', () => {
  const products = [
    { id: 'coffee', name: 'Coffee', price: 1, stock: 10 },
    { id: 'tea', name: 'Tea', price: 2, stock: 10 },
  ];
  const Panel = renderComponent('SessionConsumptionPanel', [], false, products, ['coffee', 'tea']);
  const panel = Panel({ session: { id: 'session-1', session_products: [] } });
  const modal = panel.props.children[2];
  const form = modal.props.children;
  const [selector] = form.props.children;
  const quantityRows = form.props.children[1];

  assert.equal(selector.props.children.props.mode, 'multiple');
  assert.deepEqual(selector.props.children.props.options.map(option => option.value), ['coffee', 'tea']);
  assert.equal(form.props.children.length, 4);
  assert.deepEqual(quantityRows.map(row => row.props.children[1].props.name[1]), ['coffee', 'tea']);
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

test('session and consumption controls use employee-only buttons and read-only modal guards', () => {
  for (const isReadOnly of [true, false]) {
    const SessionList = renderComponent('SessionList', [], isReadOnly);
    const page = SessionList();
    assert.equal(page.props.children[0].props.children[1].props.employeeOnly, true);
    const table = page.props.children[1].props.children;
    const checkout = table.props.columns.find(column => column.key === 'action').render(null, { id: 'session-1' });
    assert.equal(checkout.props.employeeOnly, true);
    for (const modal of page.props.children.slice(2)) {
      assert.equal(modal.props.okButtonProps.disabled, isReadOnly);
    }
    const Panel = renderComponent('SessionConsumptionPanel', [], isReadOnly);
    const panel = Panel({ session: { id: 'session-1', session_products: [] } });
    assert.equal(panel.props.children[0].props.children[1].props.employeeOnly, true);
    const action = panel.props.children[1].props.columns.find(column => column.key === 'action')
      .render(null, { id: 'item-1' });
    const remove = isReadOnly ? action : action.props.children;
    assert.equal(remove.props.employeeOnly, true);
    assert.equal(panel.props.children[2].props.okButtonProps.disabled, isReadOnly);
  }
});
