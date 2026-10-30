import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(relativePath, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2023, esModuleInterop: true,
    },
  });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

for (const role of ['admin', 'employee', 'staff', 'demo', null]) {
  test(`client permissions and buttons enforce employee-only operations for ${role}`, () => {
    const errors = [];
    const { usePermissions } = load('../src/hooks/usePermissions.ts', {
      '../store/authStore': { useAuthStore: () => ({ role }) },
      antd: { message: { error: text => errors.push(text) } },
      react: { useCallback: callback => callback },
      'react-i18next': { useTranslation: () => ({ t: text => text }) },
    });
    const permitted = role === 'employee' || role === 'staff';
    const permissions = usePermissions(true);
    assert.equal(permissions.canWrite, permitted);
    assert.equal(permissions.isReadOnly, !permitted);
    assert.equal(permissions.requireWrite(), permitted);
    assert.deepEqual(errors, permitted ? [] : ['Opération réservée aux employés.']);
    assert.equal(usePermissions().canWrite, !!role && role !== 'demo');

    const { AuthButton } = load('../src/components/AuthButton.tsx', {
      react: {},
      'react/jsx-runtime': require('react/jsx-runtime'),
      antd: { Button: 'button', Tooltip: 'tooltip' },
      '../hooks/usePermissions': { usePermissions },
    });
    const element = AuthButton({ employeeOnly: true, children: 'Clôturer' });
    if (permitted) {
      assert.equal(element.type, 'button');
      assert.notEqual(element.props.disabled, true);
      assert.equal(element.props.employeeOnly, undefined);
    } else {
      assert.equal(element.type, 'tooltip');
      assert.equal(element.props.title, 'Opération réservée aux employés.');
      assert.equal(element.props.children.props.children.props.disabled, true);
    }
    if (role === 'admin') {
      assert.equal(AuthButton({ children: 'Produit' }).type, 'button');
    }
  });
}
