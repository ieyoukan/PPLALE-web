// Hash executable rules/observations separately from replaceable AI and research encoders.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fingerprintData } from '../dist/research/index.js';

export const digest = value => createHash('sha256').update(fingerprintData(value)).digest('hex');
export const fileHash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export function engineHashes() {
  const dist = new URL('../dist/', import.meta.url);
  const files = readdirSync(dist, { recursive: true }).filter(name => name.endsWith('.js')).sort();
  const entries = files.map(name => [name, fileHash(new URL(name, dist))]);
  return { engineHash: digest(entries), rulesEngineHash: digest(entries.filter(([name]) =>
    name !== 'index.js' && !name.startsWith('ai/') && !name.startsWith('research/'))) };
}
