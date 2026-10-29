// 処理時間だけを記録する。ルーム・人物・カード・操作引数・端末の識別情報は含めない。
export const playKinds = ['roll', 'initiative', 'openingDraw', 'mulligan', 'keep', 'draw', 'play', 'attack', 'choose', 'skill', 'exSkill', 'acorn', 'reveal', 'end'] as const;
export type PlayKind = typeof playKinds[number];
export const serverStages = ['queue', 'read', 'apply', 'store', 'presence', 'deliver', 'publish', 'total'] as const;
export type ServerTiming = Record<typeof serverStages[number], number>;
export const clientStages = ['inputToSend', 'roundTrip', 'sendToView', 'viewToPaint', 'inputToPaint'] as const;
export type ClientTiming = Partial<Record<typeof clientStages[number], number>>;
export type PlayOutcome = 'ok' | 'rejected' | 'timeout' | 'disconnected' | 'unpresented';
export interface PlaySample extends ClientTiming {
    kind: PlayKind;
    /** 分単位に丸めた時刻。対戦や操作の履歴として使わない。 */
    at: number;
    outcome: PlayOutcome;
    background: boolean;
    server?: ServerTiming;
}
export interface PlayReport extends Required<ClientTiming> { n: number; background: boolean }
export interface Percentiles { count: number; p50: number; p95: number; max: number }
export interface PlaySummary {
    samples: number;
    measured: number;
    background: number;
    outcomes: Record<PlayOutcome, number>;
    milliseconds: Partial<Record<typeof clientStages[number], Percentiles>>;
    server: Partial<Record<typeof serverStages[number], Percentiles>>;
}
export interface PlayPerformance {
    capacity: number;
    retentionHours: number;
    /** Redis使用時はPod間で共有する。診断用の参考値で、操作履歴の正本ではない。 */
    scope: 'shared' | 'process';
    summary: PlaySummary;
    byKind: Partial<Record<PlayKind, PlaySummary>>;
}
export const isPlayKind = (value: unknown): value is PlayKind => typeof value === 'string' && (playKinds as readonly string[]).includes(value);
export const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 120_000;
export const roundedMs = (value: number) => Math.round(value * 10) / 10;
export function parseServerTiming(value: unknown): ServerTiming | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const item = value as Record<string, unknown>;
    if (!serverStages.every(stage => duration(item[stage]))) return undefined;
    return Object.fromEntries(serverStages.map(stage => [stage, roundedMs(item[stage] as number)])) as ServerTiming;
}

/** 許可した項目だけを保存し、クライアントが追加した情報を混ぜない。 */
export function parsePlayReport(value: unknown): PlayReport | null {
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (!Number.isSafeInteger(item.n) || (item.n as number) < 0 || typeof item.background !== 'boolean') return null;
    if (!clientStages.every(stage => duration(item[stage]))) return null;
    const report = Object.fromEntries(clientStages.map(stage => [stage, roundedMs(item[stage] as number)])) as Required<ClientTiming>;
    // 所要時間はブラウザの単調増加時計で測る。丸め誤差だけを許容する。
    if (Math.abs(report.inputToPaint - report.inputToSend - report.sendToView - report.viewToPaint) > 2 || report.sendToView > report.roundTrip + 2) return null;
    return { n: item.n as number, background: item.background, ...report };
}
export function percentiles(values: number[]): Percentiles | undefined {
    if (!values.length) return undefined;
    values.sort((a, b) => a - b);
    const at = (q: number) => roundedMs(values[Math.max(0, Math.ceil(values.length * q) - 1)]);
    return { count: values.length, p50: at(.5), p95: at(.95), max: at(1) };
}
export function summarizePlays(samples: PlaySample[]): PlaySummary {
    const measured = samples.filter(sample => sample.outcome === 'ok' && !sample.background);
    const outcomes = { ok: 0, rejected: 0, timeout: 0, disconnected: 0, unpresented: 0 };
    samples.forEach(sample => outcomes[sample.outcome]++);
    return {
        samples: samples.length, measured: measured.length, background: samples.filter(sample => sample.background).length, outcomes,
        milliseconds: Object.fromEntries(clientStages.flatMap(stage => {
            const value = percentiles(measured.flatMap(sample => duration(sample[stage]) ? [sample[stage]!] : []));
            return value ? [[stage, value]] : [];
        })),
        server: Object.fromEntries(serverStages.flatMap(stage => {
            const value = percentiles(measured.flatMap(sample => duration(sample.server?.[stage]) ? [sample.server![stage]] : []));
            return value ? [[stage, value]] : [];
        })),
    };
}
export function summarizeByKind(samples: PlaySample[]) {
    return Object.fromEntries(playKinds.flatMap(kind => {
        const group = samples.filter(sample => sample.kind === kind);
        return group.length ? [[kind, summarizePlays(group)]] : [];
    })) as PlayPerformance['byKind'];
}
