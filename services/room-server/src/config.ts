// Settings from the environment (see the Helm chart's values.yaml for what each one means).
import path from 'node:path';

const number = (name: string, fallback: number, min = 0) => {
    const value = Number(process.env[name]);
    return process.env[name] !== undefined && Number.isFinite(value) && value >= min ? value : fallback;
};

export interface Config {
    port: number;
    dataDir: string;
    /** Web origins that may call the server from a browser; `*` allows any. */
    origins: string[];
    /** Take the client address from X-Forwarded-For (behind an ingress or a tunnel). */
    trustProxy: boolean;
    /** Rooms made, joined or looked up per client address and hour. */
    requestsPerHour: number;
    /** Rooms kept at once; making another is refused beyond this. */
    maxRooms: number;
    /** A room nobody touched for this long is removed. */
    idleHours: number;
    /** The image's version, for /stats. */
    version: string;
}

export function loadConfig(): Config {
    return {
        port: number('PORT', 8080, 1),
        dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
        origins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(origin => origin.trim()).filter(Boolean),
        trustProxy: process.env.TRUST_PROXY !== 'false',
        requestsPerHour: number('REQUESTS_PER_HOUR', 120, 1),
        maxRooms: number('MAX_ROOMS', 500, 1),
        idleHours: number('ROOM_IDLE_HOURS', 12, 0.001),
        version: process.env.APP_VERSION ?? 'dev',
    };
}
