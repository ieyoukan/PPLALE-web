// Settings from the environment (see the Helm chart's values.yaml for what each one means).
import os from 'node:os';
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
    /** Match records accepted per client address and hour. */
    reportsPerHour: number;
    training: {
        enabled: boolean;
        /** How often to look for enough new records. */
        intervalMinutes: number;
        /** New records needed to train again. */
        minNewReports: number;
        threads: number;
        selfPlayGames: number;
        /** A recorded position counts as this many self-play positions. */
        humanWeight: number;
        /** The candidate plays the built-in model this many seeds, both seats each. */
        gatePairs: number;
        /** Win rate against the built-in model a candidate needs to be published. */
        gateMinRate: number;
        /**
         * The comparison stops as soon as the candidate is this many wins ahead of (or behind) that
         * rate: clear results need far fewer matches. 0 always plays every match.
         */
        gateEarlyLead: number;
    };
    /** The image's version: self-play data is collected again when it changes. */
    version: string;
}

export function loadConfig(): Config {
    return {
        port: number('PORT', 8080, 1),
        dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
        origins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(origin => origin.trim()).filter(Boolean),
        trustProxy: process.env.TRUST_PROXY !== 'false',
        reportsPerHour: number('REPORTS_PER_HOUR', 30, 1),
        training: {
            enabled: process.env.TRAINING !== 'off',
            intervalMinutes: number('TRAIN_INTERVAL_MINUTES', 60, 1),
            minNewReports: number('TRAIN_MIN_NEW_REPORTS', 20, 1),
            threads: number('TRAIN_THREADS', Math.max(1, os.availableParallelism() - 1), 1),
            selfPlayGames: number('SELFPLAY_GAMES', 40000, 10),
            humanWeight: number('HUMAN_WEIGHT', 3),
            gatePairs: number('GATE_PAIRS', 150, 1),
            gateMinRate: number('GATE_MIN_RATE', 0.5),
            gateEarlyLead: number('GATE_EARLY_LEAD', 6),
        },
        version: process.env.APP_VERSION ?? 'dev',
    };
}
