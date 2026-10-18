// A guest's secret stays on this device. The server stores only its hash, never this key.
export async function historyHeaders(): Promise<Record<string, string>> {
  const keyName = 'pplale-history-key-v1';
  let key: string;
  try {
    const saved = localStorage.getItem(keyName);
    key = saved && /^[\da-f]{64}$/.test(saved) ? saved
      : Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(keyName, key);
  } catch { throw new Error('この端末に履歴の認証情報を保存できません。ブラウザの保存設定を確認してください'); }
  const headers: Record<string, string> = { 'x-history-key': key };
  const auth = (await import('@/lib/firebaseApp')).clientAuth();
  await auth.authStateReady();
  if (auth.currentUser) headers.authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  return headers;
}
