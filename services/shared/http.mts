import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/** Only enable behind a trusted Cloudflare tunnel; X-Forwarded-For contains user input. */
export function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
    const address = request.headers['cf-connecting-ip'];
    return trustProxy && typeof address === 'string' && isIP(address)
        ? address : request.socket.remoteAddress ?? 'unknown';
}

/** Fixed window, bounded memory, constant work per request. Fail closed when the table fills. */
export function limiter(limit: number, windowMs = 3_600_000, maxKeys = 20_000, now = Date.now) {
    let started = now();
    const counts = new Map<string, number>();
    return (key: string) => {
        if (now() - started >= windowMs) { started = now(); counts.clear(); }
        const count = counts.get(key) ?? 0;
        if (count >= limit || !counts.has(key) && counts.size >= maxKeys) return false;
        counts.set(key, count + 1);
        return true;
    };
}

/** Allows ordinary bursts without imposing any wait on normal actions. */
export function burstLimit(capacity: number, perSecond: number, now = performance.now.bind(performance)) {
    let tokens = capacity, last = now();
    return () => {
        const current = now();
        tokens = Math.min(capacity, tokens + Math.max(0, current - last) * perSecond / 1000);
        last = current;
        if (tokens < 1) return false;
        tokens--;
        return true;
    };
}

export class HttpError extends Error {
    status: number;
    close: boolean;
    constructor(status: number, message: string, close = false) { super(message); this.status = status; this.close = close; }
}

/** Stop accumulating immediately at the limit; the caller closes after sending the error. */
export function readJson(request: IncomingMessage, maxBytes: number, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const timer = setTimeout(() => fail(new HttpError(408, 'request timed out', true)), timeoutMs);
        timer.unref();
        const clean = () => {
            clearTimeout(timer);
            request.off('data', data);
            request.off('end', end);
            request.off('aborted', aborted);
            request.off('error', aborted);
        };
        const fail = (error: HttpError) => {
            clean();
            chunks.length = 0;
            request.pause();
            reject(error);
        };
        const data = (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) return fail(new HttpError(413, 'request too large', true));
            chunks.push(chunk);
        };
        const end = () => {
            clean();
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
            catch { reject(new HttpError(400, 'invalid JSON')); }
        };
        const aborted = () => fail(new HttpError(400, 'request aborted', true));
        request.on('data', data);
        request.on('end', end);
        request.on('aborted', aborted);
        request.on('error', aborted);
        const length = request.headers['content-length'];
        if (length && Number(length) > maxBytes) fail(new HttpError(413, 'request too large', true));
    });
}
