// 環境変数から設定を読む。各項目の意味はHelmチャートのvalues.yamlを参照。
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
    /** Trust CF-Connecting-IP from Cloudflare. Only enable behind the trusted tunnel. */
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
        /**
         * Win rate against the model handed out now that counts as stronger: a new model is handed
         * out only when the matches show it (sequential test, see compareVerdict in game-core).
         */
        gateBetter: number;
        /** Matches after which an undecided comparison counts as not stronger. */
        gateMaxMatches: number;
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
            gateBetter: Math.min(0.9, Math.max(0.51, number('GATE_BETTER', 0.55))),
            gateMaxMatches: number('GATE_MAX_MATCHES', 600, 2),
        },
        version: process.env.APP_VERSION ?? 'dev',
    };
}
