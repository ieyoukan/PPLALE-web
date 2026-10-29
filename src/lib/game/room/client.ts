// ブラウザから使うルームAPIの入口。通信・端末への保存・WebSocketの実装は別ファイルで管理する。
import { requestRoom } from './request';
import { knownPlazas } from './roomSession';
import type { HistoryPage, MatchDetails, MatchRecording } from '@pplale/game-core/history';
import type { Entered, PlazaRequest, RoomInfo, ProfileLocation, RoomRules, RoomServerStats, Seated } from '@pplale/game-core/room';

// 呼び出し元のimportを変えずに、実装だけを役割ごとに分ける。
export { RoomRequestError, roomServerUrl } from './request';
export { seatFor, keepSeat, dropSeat, plazaKey, currentPlaza, keepPlaza, keepInvite, leavePlaza } from './roomSession';
export { connectRoom } from './connection';
export type { RoomConnection } from './connection';

export const readMatchHistory = (cursor?: string, favorites = false) => requestRoom<HistoryPage>('/history/list', { cursor, favorites });
export const readMatchDetail = (id: string) => requestRoom<MatchDetails>(`/history/${id}/detail`, {});
export const readRecording = (id: string) => requestRoom<MatchRecording>(`/history/${id}`, {});
export const favoriteMatch = (id: string, value: boolean) => requestRoom<{ ok: true }>(`/history/${id}/favorite`, { value });

export const joinRoom = (id: string, name: string) => requestRoom<Seated>(`/rooms/${id}/join`, { name });
export const readRoomInfo = (id: string, invite?: string | null) => requestRoom<RoomInfo>(`/rooms/${id}${invite ? `?${new URLSearchParams({ invite })}` : ''}`, undefined, true);

// 集まって遊ぶルームのAPI。サーバーの実装はservices/room-server/src/plaza.ts。
export const createPlaza = (rules: RoomRules, name: string, plaza: PlazaRequest) => requestRoom<Entered>('/rooms', { rules, name, plaza });
/** inviteは招待リンクの秘密、rejoinは再入室を証明するメンバートークン。 */
export const enterPlaza = (id: string, name: string, { invite, rejoin }: { invite?: string | null; rejoin?: string | null } = {}) =>
  requestRoom<Entered>(`/rooms/${id}/join`, { name, plaza: true, ...(invite && { invite }), ...(rejoin && { rejoin }) });
/** この本人に入室権限があるルームの情報だけを問い合わせる。 */
export const lookupRooms = (ids: string[]) => requestRoom<{ rooms: RoomInfo[] }>('/rooms/lookup', { ids });
/** 入れる空きルームを探す。最終的な入室可否はサーバーが判定する。 */
export const browseRooms = () => requestRoom<{ rooms: RoomInfo[] }>('/rooms/browse', {
  known: knownPlazas(),
});
/** ログイン済みのフレンドを名前で招待する。memberには本人の在室トークンを使う。 */
export const inviteFriend = (id: string, member: string, to: string) => requestRoom<{ ok: true }>(`/rooms/${id}/invite`, { member, to });
/** 名前で招待されたルームを取得する。 */
export const readInvitations = () => requestRoom<{ rooms: RoomInfo[] }>('/rooms/invited', {});
/** 接続中のフレンドの現在地。非公開ルームは公開範囲だけを返す。 */
export const readProfileLocation = (to: string) => requestRoom<ProfileLocation>('/rooms/location', { to });
/** フレンドに入室を依頼する。非公開ルームの存在はこのAPIで明かさない。 */
export const askToEnter = (to: string) => requestRoom<{ ok: true }>('/rooms/ask', { to });
/** サーバーの稼働状況。到達できるかの確認にも使う。 */
export const readServerStats = () => requestRoom<RoomServerStats>('/stats');
// ログイン済みユーザー向けのPush通知。ブラウザ側の管理はsrc/lib/game/push.ts。
export const readPushKey = () => requestRoom<{ publicKey: string | null }>('/push/key');
export const registerPush = (subscription: PushSubscriptionJSON) => requestRoom<{ ok: true; enabled: boolean }>('/push/subscribe', { subscription });
export const unregisterPush = (endpoint: string) => requestRoom<{ ok: true }>('/push/unsubscribe', { endpoint });
export const pushFriend = (to: string, kind: 'request' | 'accepted') => requestRoom<{ ok: true }>('/push/friend', { to, kind });
export const pushRecruit = (roomId: string) => requestRoom<{ ok: true }>('/push/recruit', { roomId });
