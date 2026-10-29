// ルームAPI共通の接続先・認証ヘッダー・タイムアウト・エラー変換。
import { historyHeaders } from './historyIdentity';

export const roomServerUrl = (process.env.NEXT_PUBLIC_ROOM_SERVER_URL ?? '').replace(/\/+$/, '') || null;

/** サーバーによる拒否、または通信失敗。到達できなかった場合はstatusが0。 */
export class RoomRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const UNREACHABLE = 'ルームサーバーにつながりません。少し待ってからお試しください';

/** signedを指定すると、GETにも本人確認のヘッダーを付ける。 */
export async function requestRoom<T>(path: string, body?: unknown, signed = false): Promise<T> {
  if (!roomServerUrl) throw new RoomRequestError(0, 'ルームサーバーが設定されていません');
  let headers: Record<string, string> | undefined;
  if (body !== undefined) {
    headers = { 'content-type': 'application/json', ...await historyHeaders() };
  } else if (signed) {
    headers = await historyHeaders();
  }
  let response: Response;
  try {
    response = await fetch(roomServerUrl + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: AbortSignal.timeout(path.startsWith('/history/') ? 60_000 : 8000),
      ...(headers && { headers }), ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch { throw new RoomRequestError(0, UNREACHABLE); }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new RoomRequestError(response.status, data?.error ?? 'サーバーで問題が起きました');
  return data;
}

