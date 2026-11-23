'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import locked from '@/data/lockedPuzzles.json';
import { toLethalPuzzle } from './puzzles';
import type { LethalPuzzle, PuzzleSource } from './puzzles';

/**
 * あいことばを知っている人だけが遊べるパズル。問題は scripts/lock-puzzles.mjs で暗号化して配信し、
 * 解錠したあいことばはこの端末に保存して次回から自動で開く。
 */
interface LockedGroup { label: string; count: number; iterations: number; salt: string; iv: string; data: string }
const groups: Record<string, LockedGroup> = locked;
export const lockedPuzzleFruits = Object.entries(groups).map(([id, group]) => ({ id, label: group.label, count: group.count }));

const KEYS = 'pplale-puzzle-keys-v1';
const EVENT = 'pplale-puzzle-keys';
/** 端末に保存できない場合も、この訪問中は開いたままにする。 */
let memoryKeys: Record<string, string> = {};
const decrypted = new Map<string, Promise<LethalPuzzle[] | null>>();
/** 盤面画像も同じ鍵で暗号化してある。復号した問題ごとに鍵を覚えておく。 */
const previewKeys = new WeakMap<LethalPuzzle, CryptoKey>();
const previewUrls = new Map<string, Promise<string | null>>();

const bytes = (base64: string) => Uint8Array.from(atob(base64), character => character.charCodeAt(0));
const normalize = (password: string) => password.normalize('NFKC').trim();

function decrypt(fruit: string, password: string): Promise<LethalPuzzle[] | null> {
  const group = groups[fruit];
  if (!group || !password) return Promise.resolve(null);
  const cacheKey = `${fruit}\n${password}`;
  let result = decrypted.get(cacheKey);
  if (!result) {
    result = (async () => {
      try {
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(group.salt), iterations: group.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(group.iv) }, key, bytes(group.data));
        const sources: PuzzleSource[] = JSON.parse(new TextDecoder().decode(plain));
        return sources.map(source => {
          const puzzle = toLethalPuzzle(source);
          previewKeys.set(puzzle, key);
          return puzzle;
        });
      } catch { return null; }
    })();
    decrypted.set(cacheKey, result);
  }
  return result;
}

function savedKeys(snapshot: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(snapshot ?? '{}');
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};
  } catch { return {}; }
}
function keysSnapshot(): string {
  try { return localStorage.getItem(KEYS) ?? '{}'; }
  catch { return '{}'; }
}

/** あいことばが合っているかだけを確かめる。解錠の演出のあとで rememberPassword を呼ぶ。 */
export async function checkPassword(fruit: string, input: string): Promise<boolean> {
  return (await decrypt(fruit, normalize(input))) !== null;
}

/** 端末に保存して一覧を開く。保存できない場合もこの訪問中は開いたままにする。 */
export function rememberPassword(fruit: string, input: string) {
  const password = normalize(input);
  memoryKeys = { ...memoryKeys, [fruit]: password };
  try { localStorage.setItem(KEYS, JSON.stringify({ ...savedKeys(keysSnapshot()), [fruit]: password })); }
  catch { /* Storage may be blocked. */ }
  window.dispatchEvent(new Event(EVENT));
}

async function load(snapshot: string): Promise<LethalPuzzle[]> {
  const keys = { ...savedKeys(snapshot), ...memoryKeys };
  const lists = await Promise.all(lockedPuzzleFruits.map(({ id }) => decrypt(id, keys[id] ?? '')));
  return lists.flatMap(list => list ?? []);
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === KEYS) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
const snapshotWithMemory = () => `${keysSnapshot()}\n${JSON.stringify(memoryKeys)}`;

/** 解錠済みのパズル。ready になるまでは、見つからない問題を「存在しない」と扱わない。 */
export function useUnlockedPuzzles() {
  const snapshot = useSyncExternalStore<string | null>(subscribe, snapshotWithMemory, () => null);
  const [state, setState] = useState<{ snapshot: string | null; puzzles: LethalPuzzle[] }>({ snapshot: null, puzzles: [] });
  useEffect(() => {
    if (snapshot === null) return;
    let live = true;
    void load(snapshot.split('\n')[0]).then(puzzles => { if (live) setState({ snapshot, puzzles }); });
    return () => { live = false; };
  }, [snapshot]);
  return { puzzles: state.puzzles, ready: snapshot !== null && state.snapshot === snapshot };
}

/** 限定公開の問題の盤面画像。解錠した端末でだけ復号して表示する。 */
export function useLockedPreview(puzzle: LethalPuzzle): string | null {
  const preview = puzzle.preview;
  const [url, setUrl] = useState<{ src: string; url: string | null } | null>(null);
  useEffect(() => {
    const key = previewKeys.get(puzzle);
    if (!preview || !key) return;
    let result = previewUrls.get(preview.src);
    if (!result) {
      result = fetch(preview.src)
        .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer(); })
        .then(data => crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(preview.iv) }, key, data))
        .then(image => URL.createObjectURL(new Blob([image], { type: 'image/webp' })))
        .catch(() => null);
      previewUrls.set(preview.src, result);
    }
    let live = true;
    void result.then(value => { if (live) setUrl({ src: preview.src, url: value }); });
    return () => { live = false; };
  }, [puzzle, preview]);
  return url && url.src === preview?.src ? url.url : null;
}
