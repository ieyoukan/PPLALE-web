import { clientStages, duration, isPlayKind, parseServerTiming } from '@pplale/game-core/performance';
import type { PlaySample } from '@pplale/game-core/performance';

const KEY = 'pplale-room-performance-v1';
const EMPTY: PlaySample[] = [];
const listeners = new Set<() => void>();
let samples: PlaySample[] = EMPTY, loaded = false, bound = false;
let saving: ReturnType<typeof setTimeout> | undefined;
const outcomes = ['ok', 'rejected', 'timeout', 'disconnected', 'unpresented'];
function clean(value: unknown): PlaySample | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as PlaySample;
  if (!isPlayKind(item.kind) || !outcomes.includes(item.outcome) || !Number.isFinite(item.at) || typeof item.background !== 'boolean') return null;
  return { kind:item.kind, outcome:item.outcome, at:Math.floor(item.at / 60000) * 60000, background:item.background,
    ...Object.fromEntries(clientStages.filter(stage => duration(item[stage])).map(stage => [stage,item[stage]])),
    ...(parseServerTiming(item.server) && {server:parseServerTiming(item.server)}) };
}
function load() {
  loaded = true;
  try { const raw = localStorage.getItem(KEY); const parsed = raw && raw.length < 150_000 ? JSON.parse(raw) : []; samples = Array.isArray(parsed) ? parsed.slice(-200).flatMap(value => clean(value) ?? []) : EMPTY; } catch { samples = EMPTY; }
}
function save() {
  clearTimeout(saving); saving = undefined;
  try { localStorage.setItem(KEY, JSON.stringify(samples)); } catch { /* Private/full storage does not affect a move. */ }
}
function bind() {
  if (typeof window === 'undefined') return;
  if (!loaded) load();
  if (bound) return;
  bound = true;
  window.addEventListener('pagehide', save);
  window.addEventListener('storage', event => { if (event.key === KEY) { load(); listeners.forEach(listener => listener()); } });
}
export function recordPlaySample(value: PlaySample) {
  bind(); const sample = clean(value); if (!sample) return;
  samples = [...samples.slice(-199), sample];
  listeners.forEach(listener => listener());
  // Persist outside the move's render/transport callbacks, at most once per burst.
  if (!saving) saving = setTimeout(save, 1000);
}
export function clearPlaySamples() { bind(); samples = []; save(); listeners.forEach(listener => listener()); }
export const performanceLog = {
  subscribe(listener: () => void) { bind(); listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot() { bind(); return samples; },
  serverSnapshot: () => EMPTY,
};
