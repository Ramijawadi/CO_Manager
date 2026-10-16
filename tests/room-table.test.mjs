import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { schemas } from '../server/validation.mjs';

const require = createRequire(import.meta.url);
const room = { id: 'room-1', room_number: 'Chambre 01', name: 'Chambre 01' };
const rental = {
  id: 'rental-1', room_id: room.id, tenant_name: 'Nadia', phone: '+216 20 000 000',
  entry_date: '2020-01-01', expected_departure_date: '2099-01-01', actual_departure_date: null,
};

function renderRooms({ desktop = true, details = false, editingPayment, mutations = [] } = {}) {
  const source = readFileSync(new URL('../src/features/rooms/RoomManagement.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2023, esModuleInterop: true,
    },
  });
  let stateIndex = 0;
  const dependencies = {
    react: {
      useMemo: callback => callback(),
      useState: initial => {
        const index = stateIndex++;
        return [
          index === 6 && details ? room
            : index === 7 ? rental : index === 9 ? editingPayment : initial,
          () => {},
        ];
      },
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    antd: {
      ...Object.fromEntries([
        'Alert', 'Button', 'Card', 'Col', 'Drawer', 'Empty', 'Input', 'Popconfirm',
        'Row', 'Select', 'Space', 'Statistic', 'Table', 'Tag', 'Tooltip',
      ].map(name => [name, name])),
      Grid: { useBreakpoint: () => ({ md: desktop }) },
      Typography: { Text: 'Text', Title: 'Title' },
      message: { useMessage: () => [{}, null] },
    },
    '@ant-design/icons': {},
    '@tanstack/react-query': {
      useQuery: ({ queryKey }) => ({
        data: { rooms: [room], roomRentals: [rental], utilityPayments: [] }[queryKey[0]],
      }),
      useMutation: () => {
        const calls = [];
        mutations.push(calls);
        return { mutate: values => calls.push(values) };
      },
      useQueryClient: () => ({}),
    },
    dayjs: require('dayjs'),
    '../../components/AuthButton': { AuthButton: 'AuthButton' },
    '../../hooks/usePermissions': { usePermissions: () => ({ isDemo: false }) },
    './api': {},
    './RoomManagementForms': {
      RoomForm: 'RoomForm', RentalForm: 'RentalForm', UtilityPaymentForm: 'UtilityPaymentForm',
    },
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { resolvedLanguage: 'ar' } }) },
    '../../i18n': { getNumberLocale: () => 'ar-TN' },
    '../expenses/types': {
      formatExpenseAmount: value => {
        assert.equal(typeof value, 'number');
        return value.toFixed(3);
      },
    },
  };
  const exports = {};
  new Function('require', 'exports', 'window', outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports, { innerWidth: desktop ? 1440 : 390 });
  return exports.default();
}

function findElements(node, type) {
  if (Array.isArray(node)) return node.flatMap(child => findElements(child, type));
  if (!node || typeof node !== 'object') return [];
  return [
    ...(node.type === type ? [node] : []),
    ...findElements(node.props?.children, type),
  ];
}

test('rooms table reserves column widths and only pins actions on larger screens', () => {
  for (const desktop of [true, false]) {
    const table = findElements(renderRooms({ desktop }), 'Table')[0];
    assert.equal(table.props.tableLayout, 'fixed');
    assert.equal(table.props.columns.reduce((total, column) => total + column.width, 0), table.props.scroll.x);
    assert.equal(table.props.columns.at(-1).fixed, desktop ? 'right' : undefined);
    const row = table.props.dataSource[0];
    const roomCell = table.props.columns[0].render(room.room_number, row);
    assert.equal(findElements(roomCell, 'Text').length, 1);
    const tenantCell = table.props.columns[2].render(undefined, row);
    assert.equal(findElements(tenantCell, 'bdi').find(element => element.props.dir === 'ltr').props.children, rental.phone);
    assert.equal(table.props.columns.at(-1).render(undefined, row).props.wrap, undefined);
  }
});

test('room bill history distinguishes unspecified amounts from zero without crashing', () => {
  const table = findElements(renderRooms({ details: true }), 'Table').at(-1);
  const amount = table.props.columns.find(column => column.dataIndex === 'amount');
  assert.equal(amount.render(null), '—');
  assert.equal(amount.render(0), '0.000');
  assert.equal(amount.render(12.5), '12.500');
});

test('editing a bill omits its immutable rental ID and preserves all editable fields', () => {
  const mutations = [];
  const page = renderRooms({ editingPayment: { id: 'bill-1' }, mutations });
  const data = {
    type: 'water', billing_period: '2026-10', status: 'paid',
    payment_date: '2026-10-16', amount: 12, invoice_reference: 'W-10', notes: 'Paid',
  };
  findElements(page, 'UtilityPaymentForm')[0].props.onSubmit({ rental_id: rental.id, ...data });
  assert.deepEqual(mutations[5], [{ id: 'bill-1', data }]);
  assert.deepEqual(schemas.utility_payments.update.parse(mutations[5][0].data), data);
  assert.equal(Object.hasOwn(mutations[5][0].data, 'rental_id'), false);
});

test('creating a bill still includes its rental ID', () => {
  const mutations = [];
  const page = renderRooms({ mutations });
  const values = {
    rental_id: '123e4567-e89b-12d3-a456-426614174000',
    type: 'electricity', billing_period: '2026-10', status: 'unpaid', amount: null,
  };
  findElements(page, 'UtilityPaymentForm')[0].props.onSubmit(values);
  assert.deepEqual(mutations[4], [values]);
  assert.deepEqual(schemas.utility_payments.create.parse(mutations[4][0]), values);
});
