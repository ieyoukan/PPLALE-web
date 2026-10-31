// ゲームの英語（英語表示のときだけ読み込む）。画面ごとの辞書と、エンジン・ルームサーバーの文の訳し方をまとめる。
import { board } from './board';
import { menus } from './menus';
import { room } from './room';
import { social } from './social';
import { exact, patterns } from './engine';

const text: Record<string, string> = { ...room, ...board, ...menus, ...social };

/** Engine and server text: an exact match, else the first matching pattern (its captured parts translated again when known). */
function translate(value: string): string {
  if (!value) return value;
  const known = exact[value] ?? text[value];
  if (known) return known;
  for (const [pattern, english] of patterns) {
    const match = value.match(pattern);
    if (match) return english.replace(/\$(\d)/g, (_, index: string) => { const part = match[Number(index)] ?? ''; return exact[part] ?? text[part] ?? part; });
  }
  // Several sentences or lines: each on its own.
  const pieces = value.split(/(?<=[。！？\n])/);
  return pieces.length > 1 ? pieces.map(piece => translate(piece.trim()) + (piece.endsWith('\n') ? '\n' : ' ')).join('').trim() : value;
}

export const gameEnglish = { text, translate };
export type GameEnglish = typeof gameEnglish;
