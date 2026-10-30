import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);

test('employee shift panel omits recent history and preserves start/end controls', () => {
  const source = readFileSync(new URL('../src/features/employee/WorkSessionPanel.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2023, esModuleInterop: true,
    },
  });
  for (const active of [null, { id: 'active-shift', start_time: '2026-10-17T08:00:00Z' }]) {
    for (const history of [[], [{ id: 'completed-shift', status: 'completed', start_time: '2026-10-16T08:00:00Z' }]]) {
      const actions = [];
      const mutations = [];
      const dependencies = {
        react: { useState: () => [0, () => {}], useEffect() {} },
        'react/jsx-runtime': require('react/jsx-runtime'),
        antd: {
          Alert: 'alert', Button: 'button', Card: 'card', Popconfirm: 'popconfirm',
          Tag: 'tag', Typography: { Text: 'text', Title: 'title' },
        },
        '@ant-design/icons': {},
        '@tanstack/react-query': {
          useQuery: () => ({ data: { active, history } }),
          useMutation: () => {
            const action = mutations.length === 0 ? 'start' : 'end';
            const mutation = { mutate: value => actions.push([action, value]) };
            mutations.push(mutation);
            return mutation;
          },
          useQueryClient: () => ({ invalidateQueries() {} }),
        },
        './api': {},
        '../../i18n': { getDateLocale: () => 'fr-FR' },
        'react-i18next': { useTranslation: () => ({ t: text => text, i18n: { resolvedLanguage: 'fr' } }) },
        './WorkSessionPanel.css': {},
      };
      const exports = {};
      new Function('require', 'exports', outputText)(name => {
        assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
        return dependencies[name];
      }, exports);
      const tree = exports.default();
      const nodes = [];
      const visit = node => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        nodes.push(node);
        visit(node.props?.children);
      };
      visit(tree);
      assert.equal(nodes.some(node => node.type === 'aside'), false);
      assert.doesNotMatch(JSON.stringify(tree), /Derniers services|Historique récent|Vos services terminés/);
      assert.ok(nodes.some(node => node.props?.children === 'Mon service'));
      if (active) {
        assert.ok(nodes.some(node => node.props?.children === 'Terminer mon service'));
        nodes.find(node => node.type === 'popconfirm').props.onConfirm();
        assert.deepEqual(actions, [['end', active.id]]);
      } else {
        const start = nodes.find(node => node.props?.children === 'Commencer mon service');
        start.props.onClick();
        assert.equal(actions[0][0], 'start');
        assert.match(actions[0][1], /^[0-9a-f-]{36}$/);
      }
    }
  }
});
