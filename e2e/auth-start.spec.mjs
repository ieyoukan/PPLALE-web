import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('auth starts with its first consumer and keeps account changes while consumers are absent', async ({ page }) => {
  const { outputFiles } = await build({
    stdin: {
      contents: `import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { AuthProvider, useAuth } from ${JSON.stringify(fileURLToPath(new URL('../src/lib/auth.tsx', import.meta.url)))};
        function Consumer() { const { user, loading } = useAuth(); return <output>{loading ? 'loading' : user?.uid ?? 'signed-out'}</output>; }
        function App() { const [shown, show] = useState(false); return <AuthProvider><button onClick={() => show(!shown)}>toggle</button>{shown && <Consumer />}</AuthProvider>; }
        window.__root = createRoot(document.getElementById('root')); window.__root.render(<App />);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'auth-observer-fixture', setup(builder) {
      builder.onResolve({ filter: /ProfileOnboarding$/ }, () => ({ path: 'onboarding', namespace: 'fixture' }));
      builder.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'sdk', namespace: 'fixture' }));
      builder.onResolve({ filter: /^\.\/firebaseApp$/ }, () => ({ path: 'app', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'onboarding'
        ? 'export default function ProfileOnboarding({ uid }) { window.__onboardingUid = uid; return null; }'
        : path === 'app'
        ? 'export const clientAuth = () => ({});'
        : `window.__sdkLoads++;
          export function onAuthStateChanged(auth, update) { window.__listeners.add(update); update(window.__user); return () => window.__listeners.delete(update); }
          export const signOut = async () => {};
          export const signInWithPopup = async () => {};
          export class GoogleAuthProvider {}
          export const browserPopupRedirectResolver = {};`, loader: 'js' }));
    } }],
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { window.__sdkLoads = 0; window.__listeners = new Set(); window.__user = null; });
  await page.addScriptTag({ content: outputFiles[0].text });
  const toggle = page.getByRole('button', { name: 'toggle', exact: true });
  await expect(toggle).toBeVisible();
  expect(await page.evaluate(() => window.__sdkLoads)).toBe(0);
  await toggle.click();
  await expect(page.locator('output')).toHaveText('signed-out');
  expect(await page.evaluate(() => window.__sdkLoads)).toBe(1);
  await toggle.click();
  await expect(page.locator('output')).toHaveCount(0);
  expect(await page.evaluate(() => window.__listeners.size)).toBe(1);
  await page.evaluate(() => {
    window.__user = { uid: 'changed-in-another-tab' };
    window.__listeners.forEach(listener => listener(window.__user));
  });
  await toggle.click();
  await expect(page.locator('output')).toHaveText('changed-in-another-tab');
  await expect.poll(() => page.evaluate(() => window.__onboardingUid)).toBe('changed-in-another-tab');
  expect(await page.evaluate(() => window.__listeners.size)).toBe(1);
  await page.evaluate(() => window.__root.unmount());
  expect(await page.evaluate(() => window.__listeners.size)).toBe(0);
});
