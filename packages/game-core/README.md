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
| `ai/` | CPU。`moves.ts` 合法手、`hidden.ts` 見えない情報の推測、`evaluate.ts` 盤面評価、`lethal.ts` このターンの勝ち筋の完全探索、`turn-search.ts` 自分のターンと相手の返しの探索、`value.ts` 学習した局面の価値、`selfplay.ts` CPU同士の対戦、`levels/` 強さごとの戦略 |
| `core/state.ts` | `cloneState`。探索で大量に呼ぶ状態コピー（structuredClone の約10倍速い） |
| `snapshot.ts` | 保存された状態の検証・復元と旧形式の移行 |
| `position.ts` | 盤面エディタの盤面（`Position`）。`buildPosition` で対戦中の状態にし、`positionOf` で対戦中の盤面を書き出す。`encodePosition` / `decodePosition` は共有コード（`PPL1.…`） |
| `edit.ts` | 盤面エディタの編集モードでの変更（`editGame`）。カードを置く・外す・動かす、幼女やプレイヤーの数値、手番。uid は変えない |

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
- **使える条件**: 対象を選ぶ効果で対象がいないときなど、使えない条件は `canPlay`（スキルは `blocked`）に書く。エンジンが拒否し、UI も手札を光らせず「使う」を押せなくする。
- テストは `tests/cards.*.test.mjs` / `tests/skills.test.mjs` に、`arena()` で盤面を作って1カード1テストで書く。盤面エディタの共有コードをもらったときは `fromCode('PPL1.…')` でその盤面から始められる。

### 演出（何もしなくても付く）

演出はカードごとに書かない。`changes.ts` の `changesBetween(before, after)` が、1回のコマンドで変わったことを一覧にし（カードの移動、ダメージ、能力値・キーワード、お菓子ポイント、PP、ダイスなど）、UI はその種類ごとに決まった見せ方をする（`src/components/game/board/presenters.ts`）。だから **`ctx.buff` / `ctx.discard` / `ctx.summon` などで状態を変えれば、新しいカードでも自動で演出が付く**。たとえば手札を捨てればカードがお昼寝場所へ飛び、+1/+1 すればその幼女の上に「+1/+1」が出る。

抜けを防ぐ仕組み：

- `Instance` / `Player` / `GameState` の各フィールドは `changes.ts` で「どの変化として見せるか／見せない理由」に分類してある。フィールドを足して分類しないと `tests/changes.test.mjs` が落ちる。
- 変化の種類（`ChangeKind`）を足すと、`presenters.ts` に見せ方を書くまで型エラーになる。
- `tests/changes.test.mjs` は、`onPlay` を持つすべてのいちごカードを実際にプレイし、何の変化も出ないカードがあれば落ちる。
- 状態に残らない出来事（ダイスの出目、効果耐性で止まったこと）は、`ctx.rollDie()` のように `effects` の操作が記録する。乱数でダイスを振るときは `ctx.random` ではなく `ctx.rollDie` を使う。

相手が盤面のカード以外を選んだとき（「1PP追加」など）は、選んだ内容が自動で表示される。カードの説明画面やカード専用の大きな演出が欲しい場合だけ、UI 側に追加する。

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
- 強さの順序は `tests/cpu.test.mjs` と `npm run cpu:arena -- [試合数] [レベル…]` で確かめる。席は1試合ごとに入れ替える。

| 対戦（席を入れ替えた組） | 試合数 | 勝率（95%区間） | 1手の平均思考時間 |
| --- | --- | --- | --- |
| ふつう vs よわい | 2000 | 90.5%（89.2–91.7） | 0.1ms |
| つよい vs ふつう | 1000 | 81.8%（79.5–84.1） | 2ms |
| つよい vs 勝ち筋の探索なしのつよい | 1000 | 57.9%（56.3–59.5） | |
| さいきょう vs つよい | 120 | 83.3%（76.9–89.8） | 109ms |

20試合では勝率が±20%ぶれる。レベルを比べるときは数百試合を使う。つよい同士では先攻の勝率が約65%あり、同格に近い相手への勝率には運による上限がある。

### このターンの勝ち筋の完全探索（`findLethal`）

`findLethal(state, side, catalog, { maxNodes })` は、自分のターン内の手順をすべて試し、このターンで勝てる手順を返す。

- `win`: 返した手順は、見えないカードやダイスがどうであっても勝つ。ドローやランダム効果を通る手順は、乱数と山札順を変えた複数の世界すべてで勝つ場合だけ採用する。
- `none`: すべての手順を調べ、確実に勝てる手順はない。
- `unknown`: 局面数の上限（`maxNodes`）に達した。
- 手順の順番だけが違う同じ局面は1回しか調べない。相手の選択が途中で必要になる手順は、その先を計画できないので打ち切る。
- 「つよい」は局面数20で実行し、見つかればその手順を打つ（`maxNodes` を400にしても勝率は変わらない）。「さいきょう」は毎回4000で実行し、勝ち筋がなければ自分のターンと相手の返しを探索する（`searchTurn`）。画面では Web Worker 上で動くので、探索中も操作は止まらない。

### CPUの育成（自己対戦）

ブラウザを使わず Node だけで動く。1試合は約15ms、8コアで並列に回す。

```
npm run cpu:train -- [世代数=30] [候補数=8] [1候補あたりの組数=100]
npm run cpu:arena -- [試合数] [レベル…]
```

- 育てる対象は `evaluate` の重み（`Weights`）。「つよい」「さいきょう」が共通で使う。
- 1世代ごとに、現在の最良の重みを少し変えた候補を作り、最良と対戦させる。同じデッキ・乱数で席を入れ替えて2戦するので運の差は打ち消される。勝ち越した候補は未使用の試合（1000試合以上）で再確認し、はっきり勝ち越した場合だけ採用する。
- 結果は `scripts/weights.json` に出る（コミットしない）。最終検証（開始時の重みと2000試合）の勝率が運のぶれ（約±1.1%）を明確に超えたときだけ、`ai/evaluate.ts` の `defaultWeights` に写す。
- 現在の `defaultWeights` は1回目の育成結果（手で決めた初期値に対して 53.4%）。評価項目を増やした2回目は 51.6% でぶれの範囲だったため採用していない。この評価の形では頭打ちに近い。
- さらに伸ばすには、評価項目の追加か、1手先より深い探索が必要。`createHard(weights)` で重み違いのCPUを作れ、`playMatch` の `levels` には登録済みレベル名のほか任意の戦略を渡せる。`onStep(state, command, side)` で各手の局面と選んだ手を記録できる。

### 学習した局面の価値（`ai/value.ts`）

「さいきょう」は、ターンが終わった局面を小さなネットワーク（入力75・中間32）の勝率予測で比べる。ターン内の手順の並べ替えは手書きの `evaluatePlan` のまま。

```
npm run cpu:value -- collect [試合数=40000] [残すターンの割合=0.5]
npm run cpu:value -- train [中間の数=32] [周回=4]
npm run cpu:value -- adopt
```

- `collect`: 「つよい」同士の対戦（4手に1回はランダムな手）から、ターン開始時の局面と勝敗を集める。`train`: 学習して `scripts/value-model.json` に出す。`adopt`: それを `src/ai/value-model.ts` に写す（これが「さいきょう」に使われる）。
- 採用の基準: `createMaster({ evaluate: createValueEvaluator(model) })` が、選ぶのに使っていない数百試合で今の「さいきょう」にはっきり勝ち越すこと。現在のモデルは手書きの評価だけの「さいきょう」に 63.0%（400試合、59.1–66.9）。思考時間は変わらない。
- 勝敗の予測精度は強さの目安にならない。カード名を入力に入れると予測は当たるようになる（どのデッキが強いかを覚える）が、対戦では弱くなった。ターン内の局面にも使うと「つよい」に20%しか勝てなかった。
- ランダムな手を増やすと強くなった（悪い手のあとの結果が、どの手が大事かを教える）。入力や集め方を変えたら必ず対戦で確かめる。
- 試して効かなかったもの（すべて今のさいきょうとの200試合で誤差の範囲）: 正解を勝敗ではなく「さいきょうの探索の判断」にする（`label` と `train … search|oracle|mix-*`。相手の手札が見える判断でも同じ）、人との対戦記録を混ぜる（`label-records` と `train …+records`。33試合ぶん）、相手の返しを広く読む・相手の確実な勝ち筋を正確に調べる（思考時間が1.3〜3倍になるだけ）。探索を4倍にしても強くならない。いまの壁は評価や読みの深さより、探索が読む候補を4本に絞るときに、すぐには得に見えない手（次のターンの準備、温存）を落とすことにあると見ている。
- 集める・学習する計算は `ai/value-train.ts` にあり、このスクリプトと CPU サーバー（[services/cpu-server](../../services/cpu-server/README.md)）が共有する。サーバーは人との対戦記録を混ぜて学習し続け、モデルをゲームに配る。

## API

`newGame(decks, catalog, rules, seed)` で開始し、`applyCommand(state, command, catalog)` で次の状態を得る。エラー時は元の状態と理由を返す。最後の `allowAdjust` 引数を true にすると、同一端末のテスト操作を受け付ける。

`newGame` は手札を配らず `dice` 状態を作る。`roll` の大きい目の側が `initiative` で先攻・後攻を選ぶ。`openingRemaining` で各側の残り枚数を管理し、`openingDraw` で好きな山札から1枚引く。双方は相手のドローを待たずに並行して引ける。先攻3枚・後攻4枚の初期ドロー完了で `mulligan` に移る。元の初期カードごとに1回の交換を `mulligan` Command、手札確定を `keep` Command で行い、双方の確定後に `playing` に移る。その後、ターンや効果のドローも `pending` と `choose` で1枚ずつ実行する。

Next.js は npm workspace と `transpilePackages` で `src/index.ts` を利用する。独立した JavaScript が必要な場合はルートから `npm run build --workspace=@pplale/game-core` で `dist` に生成する。TS の相対パスはビルド時に `.js` に書き換える。テストは `npm run test:game`。

ルールとFAQは [game-rules.md](../../docs/game-rules.md)、実装状況は [card-effect-rules.md](../../docs/card-effect-rules.md)、配置と境界は [game-design.md](../../docs/game-design.md)、操作説明は [board-emulator.md](../../docs/board-emulator.md) を参照。
