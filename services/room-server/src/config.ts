// Settings from the environment (see the Helm chart's values.yaml for what each one means).
import { randomBytes } from 'node:crypto';

const number = (name: string, fallback: number, min = 0) => {
    const value = Number(process.env[name]);
    return process.env[name] !== undefined && Number.isFinite(value) && value >= min ? value : fallback;
};

export interface Config {
    port: number;
    /** Where the rooms are kept. Without it they live in this process (one instance, gone on restart): development only. */
    redisUrl: string | null;
    /** Names this instance among the others sharing the Redis. */
    pod: string;
    /** Web origins that may call the server from a browser; `*` allows any. */
    origins: string[];
    /** Take the client address from X-Forwarded-For (behind an ingress or a tunnel). */
    trustProxy: boolean;
    /** Rooms made, joined or looked up per client address and hour (counted by each instance). */
    requestsPerHour: number;
    /** Rooms kept at once; making another is refused beyond this. */
    maxRooms: number;
    /** A room nobody touched for this long is removed. */
    idleHours: number;
    /** How often this instance says that it and its players are still here, and looks for players who are not. */
    beatSeconds: number;
    /** The image's version, for /stats. */
    version: string;
}

export function loadConfig(): Config {
    return {
        port: number('PORT', 8080, 1),
        redisUrl: process.env.REDIS_URL || null,
        pod: `${process.env.HOSTNAME ?? 'room-server'}-${randomBytes(3).toString('hex')}`,
        origins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(origin => origin.trim()).filter(Boolean),
        trustProxy: process.env.TRUST_PROXY !== 'false',
        requestsPerHour: number('REQUESTS_PER_HOUR', 120, 1),
        maxRooms: number('MAX_ROOMS', 500, 1),
        idleHours: number('ROOM_IDLE_HOURS', 12, 0.00001),
        beatSeconds: number('BEAT_SECONDS', 15, 0.01),
        version: process.env.APP_VERSION ?? 'dev',
    };
}
