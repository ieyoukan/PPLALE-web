# @pplale/game-core

Next.js / React / Firebase に依存しない、ぷぷりえーるのローカル対戦エンジン。

## 構成

| 場所 | 責務 |
| --- | --- |
| `model.ts` | 型（GameState・Command・Task など）と暫定ルール `sandboxRules` |
| `cards/strawberryYojo.ts`, `cards/strawberrySweets.ts`, `cards/tokens.ts` | **カードごとの効果**。カード ID → `CardScript`（いつ・何をするか） |
| `cards/registry.ts` | カード ID から効果を引く。カードセットを追加したらここに登録 |
| `playables/skills.ts` | 通常プレイアブルのスキル（共通スキル＋固有スキル） |
| `effects/context.ts` | カード・スキルが使える操作の一覧（`ctx.buff` / `ctx.queue` など） |
| `effects/ops.ts` | 複数のカードで共有する効果の手順（ダメージ・ドロー・捨てる…） |
| `effects/resolve.ts` | 効果キューの解決。対象選択が必要なら `pending` で待つ |
| `core/` | カード・ポイント・領域移動・戦闘の基本処理 |
| `commands/` | Command ごとの処理（`opening.ts` 開始前 / `turn.ts` ターン中 / `sandbox.ts` テスト操作）と `applyCommand` |
| `setup.ts` | デッキ検証と `newGame` |
| `view.ts` | UI 向けの読み取り専用ヘルパー（`pendingView` で選択肢の表示場所、`attackTargets`） |
| `ai/` | CPU。`moves.ts` 合法手、`hidden.ts` 見えない情報の推測、`evaluate.ts` 盤面評価、`levels/` 強さごとの戦略 |
| `snapshot.ts` | 保存された状態の検証・復元と旧形式の移行 |

## カード効果の読み方・追加方法

カード1枚の処理は1か所にまとまっている。例：

```ts
// y_8 ちょり: 防衛。1枚引く。お菓子デッキから引いたなら 0/+2。
y_8: {
    keywords: ['guard'],
    onPlay: ctx => ctx.queue('draw'),
    onDrawn(ctx, { kind, uid }) {
        if (uid && kind === 'sweet') ctx.buff(ctx.uid, 0, 2);
    },
},
```

- **いつ**: `onPlay`（手札から出す／使う）、`onEnter`、`onAllyEnter`、`onDestroyed`、`onDiscarded`、`onAttack`、`onOwnerPlayed`、`onDrawn`。一覧と意味は `cards/types.ts`。
- **何を**: すぐ反映する処理は `ctx.buff` / `ctx.heal` など、順番に解決する・選択が必要な処理は `ctx.queue(op, …)`。使える操作は `effects/context.ts` の `Effects` がすべて。
- **どう選ぶか（UI）**: `ops.ts` の `target: 'unit'` は場の幼女から、`ctx.pick` に手札の uid を渡せば手札から、`ctx.ask` はボタンで選ぶ。UI は `pendingView` を通して、選択肢を場・手札・山札・ボタンのどこに出すか自動で決める。カードを追加しても UI の変更は不要。
- そのカードだけの手順は、カードの `ops` に書く（例：しゅれいの `shurei`、ポッキーの `pocky`）。`model.ts` の `TaskOp` に名前を追加する。
- CPU 向けの判断（対象がいないなら使わない等）は `cpu.worthPlaying`、選択の好みは op の `cpu`。
- テストは `tests/cards.*.test.mjs` / `tests/skills.test.mjs` に、`arena()` で盤面を作って1カード1テストで書く。

## CPU の書き方

CPU の強さ（`ai/levels/*.ts`）は「合法手の一覧から1つ選ぶ」ことだけを書く。

```ts
export const easy: CpuStrategy = {
    level: 'easy', name: 'よわい', description: '…',
    choose: ({ moves, random }) => moves[random(moves.length)],
};
```

- `moves` は `legalMoves` の結果。各 `Move` は `command` と、それを実行した後の状態 `next` を持つ。合法かどうかはエンジン自身に適用して判定するので、ルールとずれない。
- `state` は `determinize` 済み。相手の非公開の手札・山札の順番・乱数の種は推測で置き換えてあり、CPU は不正に情報を読めない。`next` もその推測した世界での結果。
- 盤面の良し悪しは `evaluate(state, side, catalog, weights)`。重みを変えれば打ち方の個性を作れる。
- `cpuCommand(state, catalog, { level, side })` が手番の判定、推測、実際の状態での再確認をまとめて行う。新しい強さは `ai/index.ts` の `cpuStrategies` に登録すると、対戦準備画面に自動で並ぶ。
- 強さの順序は `tests/cpu.test.mjs` の対戦で確かめる（例：ふつう対よわい 20/20、つよい対ふつう 12/20）。

## API

`newGame(decks, catalog, rules, seed)` で開始し、`applyCommand(state, command, catalog)` で次の状態を得る。エラー時は元の状態と理由を返す。最後の `allowAdjust` 引数を true にすると、同一端末のテスト操作を受け付ける。

`newGame` は手札を配らず `dice` 状態を作る。`roll` の大きい目の側が `initiative` で先攻・後攻を選ぶ。`openingRemaining` で各側の残り枚数を管理し、`openingDraw` で好きな山札から1枚引く。双方は相手のドローを待たずに並行して引ける。先攻3枚・後攻4枚の初期ドロー完了で `mulligan` に移る。元の初期カードごとに1回の交換を `mulligan` Command、手札確定を `keep` Command で行い、双方の確定後に `playing` に移る。その後、ターンや効果のドローも `pending` と `choose` で1枚ずつ実行する。

Next.js は npm workspace と `transpilePackages` で `src/index.ts` を利用する。独立した JavaScript が必要な場合はルートから `npm run build --workspace=@pplale/game-core` で `dist` に生成する。TS の相対パスはビルド時に `.js` に書き換える。テストは `npm run test:game`。

ルールとFAQは [game-rules.md](../../docs/game-rules.md)、実装状況は [card-effect-rules.md](../../docs/card-effect-rules.md)、配置と境界は [game-design.md](../../docs/game-design.md)、操作説明は [board-emulator.md](../../docs/board-emulator.md) を参照。
