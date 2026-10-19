import type { RoomCommand } from '@pplale/game-core/room';
import type { Room } from './rooms.ts';

/** Called only after a successful game change. No ticking writes or extra game commands. */
export function syncTurnClock(room: Room, now: number) {
    const state = room.state, seconds = room.rules.turnSeconds;
    if (!seconds || room.status !== 'playing' || !state || state.phase !== 'playing' || state.winner !== null) {
        delete room.turnClock;
        return;
    }
    let clock = room.turnClock;
    if (!clock || clock.turn !== state.turn || clock.side !== state.active)
        clock = { turn: state.turn, side: state.active, remainingMs: seconds * 1000, deadline: now + seconds * 1000 };
    const remainingMs = clock.deadline === null ? clock.remainingMs : Math.max(0, clock.deadline - now);
    const paused = state.pending !== null && state.pending.task.actor !== state.active;
    room.turnClock = { ...clock, remainingMs, deadline: paused ? null : clock.deadline ?? now + remainingMs };
}

/** One ordinary command at a time: each automatic choice is archived and presented normally. */
export function turnTimeoutCommand(room: Room, now: number): RoomCommand | null {
    const state = room.state, clock = room.turnClock;
    if (!room.rules.turnSeconds || room.status !== 'playing' || !state || state.phase !== 'playing' || state.winner !== null || !clock
        || clock.turn !== state.turn || clock.side !== state.active || clock.deadline === null || clock.deadline > now) return null;
    if (state.pending) {
        // The opponent always answers their own reactions, even after this turn's time was used up.
        if (state.pending.task.actor !== state.active) return null;
        const options = state.pending.options;
        // Decline optional effects and finish optional reveals rather than spend extra resources.
        const option = options.find(o => ['skip', 'no', 'done'].includes(o.id)) ?? options[0];
        return option ? { type: 'choose', actor: state.active, option: option.id } : null;
    }
    return { type: 'end', actor: state.active };
}
