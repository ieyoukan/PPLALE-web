import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditUiStructure } from '../scripts/check-ui-structure.mjs';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'pplale-ui-structure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, 'src', name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return auditUiStructure(root);
}

test('accepts shared imports and literal CSS bindings', async t => {
  assert.deepEqual(await fixture(t, {
    'components/shared/A.tsx': "import styles from './A.module.css'; import './B'; export const A = styles['ready'];",
    'components/shared/B.tsx': 'export const B = true;',
    'components/shared/A.module.css': '.ready:hover { color: red; }',
  }), []);
});

test('finds unknown and unused CSS classes', async t => {
  const issues = await fixture(t, {
    'A.tsx': "import styles from './A.module.css'; export const A = styles.typo;",
    'A.module.css': '.ready { color: red; }',
  });
  assert.equal(issues.length, 2);
  assert.ok(issues.some(issue => issue.includes('unknown CSS class typo')));
  assert.ok(issues.some(issue => issue.includes('unused CSS class ready')));
});

test('preserves dynamic classes while checking static references', async t => {
  const issues = await fixture(t, {
    'A.tsx': "import styles from './A.module.css'; const key = 'ready'; export const A = [styles[key], styles.typo];",
    'A.module.css': '.ready { color: red; }',
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /unknown CSS class typo/);
});

test('rejects shared components depending on feature components', async t => {
  const issues = await fixture(t, {
    'components/shared/A.tsx': "import '@/components/game/B'; import '../game/B';",
    'components/game/B.tsx': 'export const B = true;',
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /shared UI imports feature UI/);
});

test('finds missing and orphan CSS modules', async t => {
  const issues = await fixture(t, {
    'A.tsx': "import styles from './missing.module.css';",
    'orphan.module.css': '.ready { color: red; }',
  });
  assert.equal(issues.length, 2);
  assert.ok(issues.some(issue => issue.includes('missing CSS module')));
  assert.ok(issues.some(issue => issue.includes('CSS module is not imported')));
});
