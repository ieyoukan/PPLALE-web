// 発言の検証と履歴への追加。盤面・ターン時計・CPUの処理は変更しない。
import { z } from 'zod';
import { ROOM_CHAT_STAMPS, MAX_ROOM_CHAT_LENGTH, MAX_ROOM_CHAT_MESSAGES } from '@pplale/game-core/room';
import { RoomError } from './rooms.ts';
import type { Plaza, PlazaMember } from './plaza.ts';

export const chatActionSchema = z.object({
    action: z.literal('chat'),
    text: z.string().max(MAX_ROOM_CHAT_LENGTH * 2).optional(),
    stamp: z.enum(ROOM_CHAT_STAMPS.map(stamp => stamp.id)).optional(),
    messageId: z.string().uuid(),
}).refine(message => (message.text === undefined) !== (message.stamp === undefined));

type ChatRequest = z.infer<typeof chatActionSchema>;
const MIN_MESSAGE_INTERVAL_MS = 1000;

/** 発言者は入室済みメンバーから決め、同じ送信IDの再試行は重複させない。 */
export function appendChatMessage(plaza: Plaza, member: PlazaMember, request: ChatRequest, now: number) {
    const stamp = ROOM_CHAT_STAMPS.find(stamp => stamp.id === request.stamp);
    const text = stamp
        ? `スタンプ：${stamp.label}`
        : (request.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

    if (!text) throw new RoomError(400, 'メッセージを入力してください');
    if (Array.from(text).length > MAX_ROOM_CHAT_LENGTH) {
        throw new RoomError(400, `メッセージは${MAX_ROOM_CHAT_LENGTH}文字までです`);
    }

    const id = `${member.id}:${request.messageId}`;
    const previous = plaza.chat?.find(message => message.id === id);
    if (previous) {
        if (previous.text !== text || previous.stamp !== request.stamp) {
            throw new RoomError(409, '送信済みのメッセージです');
        }
        return;
    }

    if (member.lastChatAt !== undefined && now - member.lastChatAt < MIN_MESSAGE_INTERVAL_MS) {
        throw new RoomError(429, '少し待ってから送信してください');
    }

    member.lastChatAt = now;
    plaza.chat = [...plaza.chat ?? [], {
        id,
        member: member.id,
        name: member.name,
        ...(member.profileId && { profileId: member.profileId }),
        text,
        ...(request.stamp && { stamp: request.stamp }),
        sentAt: now,
    }].slice(-MAX_ROOM_CHAT_MESSAGES);
}
