// ランチパッドの案内役：名前・ひとこと・画像。表示は GameGuide.tsx、起動時の先読みは lib/game/preloadGame.ts。
// 画像と元ファイルの対応は public/images/game/characters/README.md。
export interface Guide { id: string; name: string; line: string; image: string; width: number; height: number }

/** The guides and what each says when the launchpad opens (ユーザー指定、2026-11-07). */
export const GUIDES: Guide[] = [
  { id: 'gato', name: 'がと', line: '何する？いっぱいあるよー！', image: 'gato', width: 502, height: 1000 },
  { id: 'chori', name: 'ちょり', line: 'どこいく?どこいく〜?', image: 'chori', width: 487, height: 1000 },
  { id: 'nao', name: 'なお', line: 'え..みんなどっか行っちゃった?', image: 'nao', width: 426, height: 693 },
  { id: 'iriai', name: 'いりあい', line: 'どこいこうかな!', image: 'iriai', width: 400, height: 1000 },
  { id: 'rikusu', name: 'りくす', line: 'なん!', image: 'rikusu', width: 471, height: 1000 },
  { id: 'gitty', name: 'ぎってぃ', line: 'にゃるる、どんぐ...じゃなくて', image: 'gitty', width: 419, height: 640 },
  { id: 'shuo', name: 'しゅお', line: 'Auf der Heide blüht ein kleines Blümelein', image: 'shuo', width: 341, height: 640 },
  { id: 'buran', name: 'ぶらん', line: 'どこいこうかなーー！！', image: 'buran', width: 663, height: 720 },
  { id: 'mika', name: 'みか', line: 'みかちゃんだよ！えへへ!', image: 'mika', width: 507, height: 720 },
];
