// The English of the engine's and the room server's text (src/i18n/en/game/engine.ts), through the same translate() the screens use.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'pplale-engine-english-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = join(directory, 'game-english.mjs');
await build({ entryPoints: ['src/i18n/en/game/index.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
const { gameEnglish } = await import(pathToFileURL(output).href);
const { translate } = gameEnglish;
const japanese = /[぀-ヿ一-鿿]/;

// Text as the engine and the server build it (templates filled with sample names and numbers).
const samples = {
  'Aliceのダイス：5': "Alice's dice: 5",
  'Aliceが後攻を選びました': 'Alice chose to go second',
  'Alice：初期手札を2枚交換': 'Alice swapped 2 opening cards',
  'Aliceの3ターン目': "Alice's turn 3",
  'Alice：「うゆち」をプレイ（2PP）': 'Alice played "Uyuchi" (2 PP)',
  'Alice：お菓子ポイント 10 → 8': 'Alice: sweets points 10 → 8',
  'Alice：幼女を1枚ドロー': 'Alice drew a little girl card',
  'Alice：お菓子デッキが空です': "Alice's sweets deck is empty",
  'ストラがお昼寝場所へ': 'Sutora went to the napping place',
  'リンネがあみのを攻撃': 'Rinne attacked Amino',
  'ちょりがおにごっこで攻撃を回避': 'Tyori dodged the attack with Tag',
  '効果耐性：破壊を無効化': 'Effect immunity: destruction blocked',
  '行動のないターンが3回続いたため試合終了：お菓子ポイント 4 対 4（同数のため後攻の勝利）': 'No actions for 3 turns, so the match ends: sweets points 4 to 4 (a tie goes to the second player)',
  'Exスキルを獲得：dice': "Gained Ex Skill: Bear doesn't roll dice",
  '幼女デッキを公開：リンネ、あみの': 'Revealed the little girl deck: Rinne, Amino',
  'ぎってぃのダイス：4（2枚捨てる）': "Gitty's dice: 4 (discard 2)",
  'ゲストが投了しました': 'Guest resigned',
  'アイシクルレインを使う': 'Use Icicle Rain',
  'ルナレストア（1PP・残り2回）': 'Luna Restore (1 PP, 2 left)',
  '除外するお昼寝場所の幼女を選んでください（あと3人）': 'Choose a little girl in your napping place to remove (3 more)',
  'ターン開始：山札を押して1枚引いてください': 'Start of turn: tap a deck to draw a card',
  '幼女デッキ（12枚）': 'Little girl deck (12)',
  '出目を6にする（残り1回）': 'Make it 6 (1 left)',
  '早食いを付与する幼女が場にいません': 'No little girl on your field to give Fast eater',
  'このルームではぶどうのカードを使えません': "Grape cards can't be used in this room",
  'フルーツ：いちご・ぶどう ／ 拡張プレイアブル（ExP）：なし ／ 観戦：あり ／ 1ターン：3分': 'Fruits: Strawberry, Grape / Extended playables (ExP): Off / Watching: On / Turn: 3 min',
  '奥の手札：x_1 というカードはありません': 'Far side (Hand): there is no card "x_1"',
  '手前：ルナレストアの残り回数は2回までです': 'Near side: Luna Restore has at most 2 uses left',
  'スタンプ：たべる？': 'Stamp: Want some?',
  'CPU・つよい': 'CPU · Hard',
  'Aliceのルーム': "Alice's room",
  'メッセージは200文字までです': 'Messages can be up to 200 characters',
  '幼女デッキは20枚にしてください / 使えるプレイアブルを選んでください': 'The little girl deck needs 20 cards / Choose a usable playable character',
  '相手のターンです': "It's your opponent's turn",
  '盤面が更新されました。もう一度操作してください': 'The board changed. Please try again',
};

test('engine and server text reads in English', () => {
  for (const [text, english] of Object.entries(samples)) assert.equal(translate(text), english, text);
});

test('no Japanese is left in the samples', () => {
  for (const text of Object.keys(samples)) assert.doesNotMatch(translate(text), japanese, text);
});
