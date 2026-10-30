import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);

test('admin can open details of active, employee-ended and admin-closed shifts', () => {
  const source = readFileSync(new URL('../src/pages/AdminEmployees.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2023, esModuleInterop: true,
    },
  });
  for (const status of ['active', 'completed', 'admin-closed']) {
    const shift = {
      id: 'shift-1', employee_id: 'employee-1',
      employee: { full_name: 'Employee', email: 'employee@example.com' },
      start_time: '2026-10-17T08:00:00Z', created_at: '2026-10-17T08:00:00Z',
      end_time: status === 'active' ? null : '2026-10-17T09:00:00Z',
      duration_minutes: status === 'active' ? null : 60,
      status: status === 'active' ? 'active' : 'completed',
      ...(status === 'admin-closed' ? { closed_by: 'admin-1', close_reason: 'Employee left early' } : {}),
    };
    const state = [];
    let stateIndex = 0;
    const dependencies = {
      react: {
        useState: initial => {
          const index = stateIndex++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = value; }];
        },
      },
      dayjs: require('dayjs'),
      'react/jsx-runtime': require('react/jsx-runtime'),
      antd: Object.fromEntries([
        'Alert', 'Button', 'Card', 'DatePicker', 'Descriptions', 'Input', 'Modal', 'Pagination',
        'Select', 'Space', 'Table', 'Tag', 'Typography',
      ].map(name => [name, name === 'Typography' ? { Text: 'text' } : name])),
      '@tanstack/react-query': {
        useQuery: ({ queryKey }) => ({ data: { items: queryKey[0] === 'adminWorkSessions' ? [shift] : [] } }),
        useMutation: () => ({}), useQueryClient: () => ({}),
      },
      '../features/employee/adminApi': {},
      '../i18n': { getDateLocale: () => 'fr-FR' },
      'react-i18next': { useTranslation: () => ({ t: text => text, i18n: { resolvedLanguage: 'fr' } }) },
    };
    const exports = {};
    new Function('require', 'exports', outputText)(name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }, exports);
    const render = () => {
      stateIndex = 0;
      return exports.default();
    };
    let tree = render();
    const table = tree.props.children[1].props.children.find(child => child?.type === 'Table');
    const actions = table.props.columns.find(column => column.key === 'actions').render(null, shift);
    assert.equal(actions.props.children[0].props.children, 'Détails');
    actions.props.children[0].props.onClick();
    tree = render();
    const modal = tree.props.children.find(child => child?.props?.title === 'Détails du service');
    assert.equal(modal.props.open, true);
    const details = Object.fromEntries(modal.props.children.props.items.map(item => [item.key, item.children]));
    assert.equal(details.employee, 'Employee');
    assert.equal(details.email, 'employee@example.com');
    assert.equal(details.duration, status === 'active' ? 'En cours' : '60 minutes');
    assert.equal(details.closure, status === 'admin-closed' ? 'Oui' : 'Non');
    assert.equal(details.reason, shift.close_reason);
    assert.equal(details.closed_by, shift.closed_by);
    modal.props.onCancel();
    assert.equal(render().props.children.find(child => child?.props?.title === 'Détails du service').props.open, false);
  }
});
