// The notifications of the game, by what happened. Short, like the game's own messages.
import type { Side } from '@pplale/game-core';
import type { Notice } from './push.ts';
import type { Room } from './rooms.ts';

// Waiting, watching and playing are one page of the room.
const lobby = (id: string) => `/game/room/${id}/`;
const board = lobby;

/** Who has to do something now in a room's match (the turn's player, or whoever must answer a choice), or null. */
export function decider(room: Room): Side | null {
    const state = room.status === 'playing' ? room.state : null;
    if (!state || state.phase !== 'playing' || state.winner !== null) return null;
    return state.pending?.task.actor ?? state.active;
}

export const notices = {
    /** `seat` has to act now: their turn began, or a choice of the opponent's card waits for them. */
    turn(room: Room, seat: Side): Notice {
        const opponent = room.seats[seat === 0 ? 1 : 0]?.name ?? '相手';
        return room.state?.active === seat
            ? { title: 'あなたの番だよ', body: `${opponent}のターンが終わったよ`, url: board(room.id), tag: `turn-${room.id}` }
            : { title: 'あなたが選ぶ番だよ', body: `${opponent}が待ってるよ`, url: board(room.id), tag: `turn-${room.id}` };
    },
    joined(room: Room): Notice {
        return { title: 'ルームに相手が来たよ', body: `${room.seats[1]?.name ?? '相手'}が入ったよ。デッキを選んで始めよう`, url: lobby(room.id), tag: `room-${room.id}` };
    },
    freeMatched(opponent: string): Notice {
        return { title: '対戦相手が見つかったよ', body: `${opponent}と対戦しよう`, url: '/game/battle/free/', tag: 'free-match' };
    },
    friendRequest(name: string): Notice {
        return { title: 'フレンド申請が届いたよ', body: `${name}から`, url: '/game/notifications/', tag: 'friend-request' };
    },
    friendAccepted(name: string): Notice {
        return { title: 'フレンドになったよ', body: `${name}が申請を承認したよ`, url: '/game/social/', tag: 'friend-accepted' };
    },
    /** Someone let the player into their room by name (an invitation, or the answer to asking). */
    invited(name: string, roomId: string): Notice {
        return { title: `${name}が招待してくれたよ`, body: 'タップしてルームへ行こう', url: lobby(roomId), tag: `invite-${roomId}` };
    },
    /** A friend of someone in the room asks to be let in. */
    asked(name: string, roomId: string): Notice {
        return { title: `${name}が入りたいって`, body: '盤面で招待するか選んでね', url: lobby(roomId), tag: `ask-${roomId}` };
    },
    /** Someone came to a room where the player was waiting alone. */
    arrived(name: string, roomId: string): Notice {
        return { title: `${name}が来たよ`, body: 'ルームで遊ぼう', url: lobby(roomId), tag: `room-${roomId}` };
    },
    recruit(name: string, roomId: string): Notice {
        return { title: `${name}がルームで待ってるよ`, body: 'タップして参加しよう', url: lobby(roomId), tag: `recruit-${roomId}` };
    },
};
