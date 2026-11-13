// ブラウザ（OS）の通知を出す。許可済みのときだけ、Service Workerから表示する（押すと sw.js がURLを開く）。
export interface Notice {
  title: string;
  body?: string;
  /** Opened when the notice is pressed. */
  url?: string;
  /** One notice per tag: a newer one replaces it (the room server's push uses the same tags, e.g. `invite-123456`). */
  tag: string;
}

export const systemNoticesAllowed = () => typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator;

export async function showSystemNotice({ title, body, url, tag }: Notice) {
  if (!systemNoticesAllowed()) return;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  await registration?.showNotification(title, { body: body ?? '', tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: url ?? '/game/' } }).catch(() => {});
}
