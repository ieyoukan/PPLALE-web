'use client';

// 画面座標とゲーム内のステージ座標を変換する。縦向きの端末ではステージが90度回るため、ポインターや配置の座標をそのまま流用しない。

/** Height of the stage in CSS pixels. The width follows the screen within MIN/MAX_ASPECT. */
export const STAGE_HEIGHT = 720;
export const MIN_ASPECT = 16 / 10;
export const MAX_ASPECT = 21 / 9;

/** Where the stage's top-left corner is on screen, its scale and whether it is turned. */
export type StageTransform = { x: number; y: number; scale: number; rotated: boolean };
type StageRect = { x: number; y: number; width: number; height: number };

const IDENTITY: StageTransform = { x: 0, y: 0, scale: 1, rotated: false };
let current = IDENTITY;

/** Set by the mounted GameStage (only one is shown at a time); cleared when it unmounts. */
export function setStageTransform(transform: StageTransform | null) { current = transform ?? IDENTITY; }

/** The stage turns -90deg when rotated: stage x runs up the screen, stage y runs right. */
export function toStage(clientX: number, clientY: number) {
  const { x, y, scale, rotated } = current;
  return rotated ? { x: (y - clientY) / scale, y: (clientX - x) / scale } : { x: (clientX - x) / scale, y: (clientY - y) / scale };
}

/** An element's box in stage pixels. */
export function stageRect(element: Element): StageRect {
  const box = element.getBoundingClientRect();
  const a = toStage(box.left, box.top), b = toStage(box.right, box.bottom);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** The stage's own size and placement for a box of the screen (the area outside the notch etc.). */
export function fitStage(box: { left: number; top: number; width: number; height: number }) {
  const rotated = box.height > box.width;
  const across = rotated ? box.height : box.width, down = rotated ? box.width : box.height;
  const width = Math.round(STAGE_HEIGHT * Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, across / Math.max(1, down))));
  const scale = Math.min(across / width, down / STAGE_HEIGHT);
  const screenWidth = (rotated ? STAGE_HEIGHT : width) * scale, screenHeight = (rotated ? width : STAGE_HEIGHT) * scale;
  const left = box.left + (box.width - screenWidth) / 2, top = box.top + (box.height - screenHeight) / 2;
  // Turned, the stage's top-left corner is the bottom-left corner of its box on screen.
  const transform: StageTransform = { x: left, y: rotated ? top + screenHeight : top, scale, rotated };
  return { width, transform };
}

type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
let enteringLandscape = false;

/**
 * Full screen and, where the browser allows it (Android), the screen held in landscape. Needs a user
 * gesture. Browsers without it (iPhone) keep the turned stage instead.
 */
export async function enterLandscape() {
  if (enteringLandscape || document.fullscreenElement && screen.orientation?.type.startsWith('landscape')) return;
  enteringLandscape = true;
  try {
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement)
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* A standalone app may allow orientation lock without browser fullscreen. */ }
    try {
      await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
    } catch { /* Refused or unsupported: the turned stage still works. */ }
  } finally { enteringLandscape = false; }
}
