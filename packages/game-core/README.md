# @pplale/game-core

Next.js / React / Firebase に依存しない、ぷぷりえーるのローカル対戦エンジン。

## 構成

| 場所 | 責務 |
| --- | --- |
| `model.ts` | 型（GameState・Command・Task など）と暫定ルール `sandboxRules` |
| `cards/strawberryYojo.ts`, `cards/grapeYojo.ts`, `cards/melonYojo.ts`, `cards/orangeYojo.ts`, `cards/strawberrySweets.ts`, `cards/fruitSweets.ts`, `cards/tokens.ts` | **カードごとの効果**。カード ID → `CardScript`（いつ・何をするか） |
| `cards/registry.ts` | カード ID から効果を引く。カードセットを追加したらここに登録 |
| `playables/skills.ts`, `playables/usage.ts`, `playables/exSkills.ts` | プレイアブルのスキル（共通スキル＋固有スキル、拡張プレイアブルのMP・パッシブ・反応スキル）、スキルを使う処理、カードが与えるExスキル |
| `playables/exSkills.ts` | 取得済みExスキルの説明・手動発動。自動発動は回復・破壊・ドロー等の処理側 |
| `effects/context.ts` | カード・スキルが使える操作の一覧（`ctx.buff` / `ctx.queue` など） |
| `effects/ops.ts` | 複数のカードで共有する効果の手順（ダメージ・ドロー・捨てる…） |
| `effects/expandedOps.ts` | 回避、ダイス、手札誘発、攻撃とターンの段階処理、カード固有の継続手順 |
| `effects/resolve.ts` | 効果キューの解決。対象選択が必要なら `pending` で待つ |
| `core/` | カード・ポイント・領域移動・戦闘の基本処理。`actions.ts` は手番と必要コスト、`constants.ts` は共有するルール定数 |
| `commands/` | Command ごとの処理（`opening.ts` 開始前 / `turn.ts` ターン中 / `sandbox.ts` テスト操作）と `applyCommand` |
| `setup.ts` | デッキ検証と `newGame` |
| `view.ts` | UI 向けの読み取り専用ヘルパー（`pendingView` で選択肢の表示場所、`attackTargets`） |
| `gameplay/` | ルール・カード・コマンド定義、合法手・選択分岐、観測と行動IDの境界。`./gameplay` で公開 |
| `research/` | 研究用の特徴量スキーマ・数値変換・データセット形式。共通APIを利用し、ゲーム本体からは依存しない |
| `ai/` | CPU。`moves.ts` 共通合法手の再公開と枝刈り、`hidden.ts` 見えない情報の推測、`evaluate.ts` 盤面評価、`lethal.ts` 予算付きの勝ち筋探索、`turn-search.ts` 自分のターンと相手の返しの探索、`value.ts` 学習した局面の価値、`selfplay.ts` CPU同士の対戦、`levels/` 強さごとの戦略 |
| `core/state.ts` | `cloneState`。探索で大量に呼ぶ状態コピー（structuredClone の約10倍速い） |
| `snapshot.ts` | 保存された状態の検証・復元と旧形式の移行 |
| `position.ts` | 盤面エディタの盤面（`Position`）。`buildPosition` で対戦中の状態にし、`positionOf` で対戦中の盤面を書き出す。`encodePosition` / `decodePosition` は共有コード（`PPL1.…`） |
| `edit.ts` | 盤面エディタの編集モードでの変更（`editGame`）。カードを置く・外す・動かす、幼女やプレイヤーの数値、手番。uid は変えない |
| `rules.ts` | 対戦のルール（`MatchRules`：使えるフルーツ・拡張プレイアブルの可否）。`playableNow` が今選べる範囲、`deckRuleErrors` がデッキの検証、`randomDeck` がルールに合うおまかせデッキ。ルーム（`room.ts`）はこれに観戦の可否を足す |

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

- **いつ**: `onPlay`（手札から出す／使う）、`onEnter`、`onAllyEnter`、`onDestroyed`、`onDiscarded`、`onExiled`、`onAttack`、`onDefend`、`onEvade`、`onReveal`、`onTurnStart`、`onTurnEnd`、`onSkill`、`onOwnerPlayed`、`onDrawn`。一覧と意味は `cards/types.ts`。
- **何を**: すぐ反映する処理は `ctx.buff` / `ctx.heal` など、順番に解決する・選択が必要な処理は `ctx.queue(op, …)`。使える操作は `effects/context.ts` の `Effects` がすべて。
- **どう選ぶか（UI）**: `ops.ts` の `target: 'unit'` は場の幼女から、`ctx.pick` に手札の uid を渡せば手札から、`ctx.ask` はボタンで選ぶ。UI は `pendingView` を通して、選択肢を場・手札・山札・ボタンのどこに出すか自動で決める。カードを追加しても UI の変更は不要。
- そのカードだけの手順は、カードの `ops` に書く（例：しゅれいの `shurei`、ポッキーの `pocky`）。`model.ts` の `TaskOp` に名前を追加する。
- ぶどう・オレンジのカード固有の手順は `effect(ctx, task)` にまとめ、`cardEffect` の `step` で分岐する。`cards/helpers.ts` の `step` / `revealStep` / `take` / `revive` 等で共通処理を使える。
- CPU 向けの判断（対象がいないなら使わない等）は `cpu.worthPlaying`、選択の好みは op の `cpu`。
- **使える条件**: 対象を選ぶ効果で対象がいないときなど、使えない条件は `canPlay`（スキルは `blocked`）に書く。エンジンが拒否し、UI も手札を光らせず「使う」を押せなくする。
- テストは `tests/cards.*.test.mjs` / `tests/skills.test.mjs` に、`arena()` で盤面を作って1カード1テストで書く。盤面エディタの共有コードをもらったときは `fromCode('PPL1.…')` でその盤面から始められる。

### 演出（何もしなくても付く）

演出はカードごとに書かない。`changes.ts` の `changesBetween(before, after)` が、1回のコマンドで変わったことを一覧にし（カードの移動、ダメージ、能力値・キーワード、お菓子ポイント、PP、ダイスなど）、UI はその種類ごとに決まった見せ方をする（`src/components/game/board/presenters.ts`）。だから **`ctx.buff` / `ctx.discard` / `ctx.summon` などで状態を変えれば、新しいカードでも自動で演出が付く**。たとえば手札を捨てればカードがお昼寝場所へ飛び、+1/+1 すればその幼女の上に「+1/+1」が出る。

抜けを防ぐ仕組み：

- `Instance` / `Player` / `GameState` の各フィールドは `changes.ts` で「どの変化として見せるか／見せない理由」に分類してある。フィールドを足して分類しないと `tests/changes.test.mjs` が落ちる。
- 変化の種類（`ChangeKind`）を足すと、`presenters.ts` に見せ方を書くまで型エラーになる。
- `tests/changes.test.mjs` は、`onPlay` を持つすべてのいちごカードを実際にプレイし、何の変化も出ないカードがあれば落ちる。
- 状態に残らない出来事（ダイスの出目、効果耐性で止まったこと）は `effects` の操作が記録する。カードテキストの1d6は `ctx.die(resumeTask)` を使い、レンテの出目指定を待ってから `task.value` で再開する。ランダムな対象の選択には `ctx.random` を使う。

相手が盤面のカード以外を選んだとき（「1PP追加」など）は、選んだ内容が自動で表示される。カードの説明画面やカード専用の大きな演出が欲しい場合だけ、UI 側に追加する。

## CPU

判断の流れ、難易度ごとの評価式と正確な重み、探索予算、学習モデルの全入力、学習・比較コマンド、過去の実験記録は [CPUの判断・評価式・学習](../../docs/cpu.md) に集約する。

TS/Python共通のカード・局面データ、特徴量、学習・比較・デッキ探索とグラフ、フィードバック再学習は [CPU研究](../../research/cpu/README.md) を参照。現行CPUの入力とは分けて拡張する。

新しい戦略は `ai/levels/*.ts` に「合法手から1つ選ぶ」`CpuStrategy` を実装し、`ai/index.ts` の `cpuStrategies` に登録する。`cpuCommand` が手番判定・非公開情報の置き換え・実状態での合法性の再確認を担当する。

## API

`newGame(decks, catalog, rules, seed)` で開始し、`applyCommand(state, command, catalog)` で次の状態を得る。エラー時は元の状態と理由を返す。最後の `allowAdjust` 引数を true にすると、同一端末のテスト操作を受け付ける。

`newGame` は手札を配らず `dice` 状態を作る。`roll` の大きい目の側が `initiative` で先攻・後攻を選ぶ。`openingRemaining` で各側の残り枚数を管理し、`openingDraw` で好きな山札から1枚引く。双方は相手のドローを待たずに並行して引ける。先攻3枚・後攻4枚の初期ドロー完了で `mulligan` に移る。元の初期カードごとに1回の交換を `mulligan` Command、手札確定を `keep` Command で行い、双方の確定後に `playing` に移る。その後、ターンや効果のドローも `pending` と `choose` で1枚ずつ実行する。

Next.js は npm workspace と `transpilePackages` で `src/index.ts` を利用する。独立した JavaScript が必要な場合はルートから `pnpm run build --workspace=@pplale/game-core` で `dist` に生成する。TS の相対パスはビルド時に `.js` に書き換える。テストは `pnpm run test:game`。

ルールとFAQは [game-rules.md](../../docs/game-rules.md)、実装状況は [card-effect-rules.md](../../docs/card-effect-rules.md)、配置と境界は [game-design.md](../../docs/game-design.md)、操作説明は [board-emulator.md](../../docs/board-emulator.md) を参照。
