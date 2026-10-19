const apiKey = 'AIzaSyBTXnTZ7ZG5oYi2dE69Dls8bM6CVOlJAyA';
export async function emulatorIdentity() {
  const response = await fetch(`http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  if (!response.ok) throw new Error('The isolated Auth emulator must be running');
  return response.json();
}
export async function signInFixture(page, base, identity) {
  await page.route('**/auth-storage-test.html', route => route.fulfill({ contentType: 'text/html', body: '<html><body>test identity</body></html>' }));
  await page.goto(`${base}/auth-storage-test.html`);
  await page.evaluate(async ({ identity, apiKey }) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('firebaseLocalStorageDb', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: { uid: identity.localId, displayName: identity.displayName ?? null, email: identity.email ?? null, photoURL: identity.photoURL ?? null, emailVerified: false, isAnonymous: true, providerData: [], apiKey, appName: '[DEFAULT]', stsTokenManager: { accessToken: identity.idToken, refreshToken: identity.refreshToken, expirationTime: Date.now() + 3_600_000 } } });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
  }, { identity, apiKey });
}
