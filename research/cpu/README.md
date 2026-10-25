# CPU研究：データ・学習・対戦評価

ルールはgame-coreで実行し、Pythonは同じスキーマで数値化・学習・集計する。データ監査→学習→対戦で候補選択→未使用条件で評価→採用判定を分離する。通常は下表の該当箇所だけ読み、生成データや係数配列を一括で読み込まない。

## 作業ごとの参照先

| 作業 | 読む実装 |
| --- | --- |
| 手番・必要コスト・ルール定数 | [core/actions.ts](../../packages/game-core/src/core/actions.ts)、[constants.ts](../../packages/game-core/src/core/constants.ts) |
| ルール・コマンド・カードの一覧 | [gameplay/index.ts](../../packages/game-core/src/gameplay/index.ts)、[catalog.ts](../../packages/game-core/src/gameplay/catalog.ts) |
| 合法手・不可能な理由・対象選択の分岐 | [gameplay/actions.ts](../../packages/game-core/src/gameplay/actions.ts) |
| モデルの入力・選択IDの検証 | [gameplay/decision.ts](../../packages/game-core/src/gameplay/decision.ts) |
| Pythonからエンジンを操作 | [engine.py](engine.py)、[JSONLブリッジ](../../packages/game-core/scripts/gameplay.mjs) |
| 新カードの基本値・能力・効果 | [research/cards.ts](../../packages/game-core/src/research/cards.ts)、該当カードの `CardScript.research` |
| プレイヤーが知れる局面・合法手 | [gameplay/observation.ts](../../packages/game-core/src/gameplay/observation.ts) |
| 特徴量の列・順序・正規化 | [research/schema.ts](../../packages/game-core/src/research/schema.ts) |
| 数値変換 | [TS](../../packages/game-core/src/research/encode.ts)、[Python](dataset.py) |
| JSON形式・型 | [共通の観測](../../packages/game-core/src/gameplay/types.ts)、[研究データ](../../packages/game-core/src/research/types.ts) |
| 自己対戦データの出力 | [scripts/research.mjs](../../packages/game-core/scripts/research.mjs) |
| データ適格性・重複・環境分布の監査 | [audit.py](audit.py) |
| カードの集合表現・線形/ニューラル学習 | [pooling.py](pooling.py)、[learning.py](learning.py) |
| 研究の実行・比較・デッキ探索 | [実行手順](#研究を実行する)、[study.py](study.py) |
| 採用判定・グラフ・実験結果 | [evaluation.py](evaluation.py)、[report.py](report.py)、[初回の結果](#2026-10-23の研究結果) |
| scikit-learn・PyTorchでの比較、手の模倣 | [ml.py](ml.py)、[ライブラリでの比較](#ライブラリでの比較とデータ10倍2026-10-23) |
| 結果の図を並べて見る | [results/index.html](results/index.html)（[gallery.py](gallery.py)・[gallery.json](results/gallery.json)から生成） |
| 対戦記録からのフィードバック | [取り込み手順](#フィードバックから再学習する)、[feedback.mjs](../../packages/game-core/scripts/feedback.mjs) |
| 現行CPUの重み・学習 | [CPU仕様](../../docs/cpu.md) |

ファイルや係数配列を一括で読む必要はない。通常は該当する行の実装だけ参照する。

## 配置と依存関係

```text
packages/game-core/
  src/core/       基本処理とルール定数
  src/cards/      カード効果と、その効果の数値記述
  src/gameplay/   ルール・カード・合法手の列挙、観測、行動ID
  src/ai/         方策・探索・評価と、研究モデルの接続
  src/research/   特徴量スキーマ、数値変換、データセット形式
  scripts/        Nodeの実行入口（gameplay.mjs / research.mjs等）
research/cpu/     Pythonの操作・データ読み取り、生成データと実験結果
```

`gameplay/` はゲーム本体を読み取り、`research/` と `ai/` が共通APIを利用する。ゲーム本体・共通APIから研究処理へ依存しない。観測は学習以外にも使うので `gameplay/`、特徴量の列や正規化は研究の都合なので `src/research/` に置く。`research/cpu/` はPythonから実験する作業場所で、ゲームのルールは持たない。共通APIへの入口は `@pplale/game-core/gameplay`。既存利用向けに `./research` からも観測APIと型を再公開するが、実装は重複させない。

`core/actions.ts` は手番・必要コストという局面の事実を返す。`gameplay/actions.ts` はその事実と `applyCommand` を使って合法手や後続選択を列挙する。CPUの「無駄な手を省く」「どの手が強いか」「見えない手札をどう推測するか」は `ai/` に置く。合法性と強さの判断を混ぜない。

## ルール・カード・使い方を列挙する

`@pplale/game-core/gameplay` はCPUに依存しない共通API。ルールを実行するのは従来どおりgame-coreで、Python側に裁定を作り直さない。

| API | 出力 |
| --- | --- |
| `describeRules(rules?)` | 初期設定、上限、ターン、ポイント、勝敗、能力の語彙 |
| `listCommandDefinitions()` | 通常コマンドの入力形式・フェーズ・説明。sandbox操作は既定で除外 |
| `describeCard(catalog, id)` / `listCardDefinitions(catalog)` | 原文・基本値、デッキ適格性、プレイ手順、能力、スキル、実装状況 |
| `legalActions(state, side, catalog)` | 現在実行できるコマンドと実行後の内部状態 |
| `inspectActions(state, side, catalog)` | 候補と、実行できない場合のエンジンの理由 |
| `enumerateActionLines(state, side, catalog, options?)` | 1手と、それに続く同じ側の対象・追加支払い等の選択分岐 |
| `bindDecision(state, side, catalog)` | プレイヤー用JSON入力と、提示した行動IDだけを実行する束縛 |

`play` はカードを使う開始操作。対象や任意効果、追加支払いは `pending` と後続の `choose` として順番に現れる。カードごとにプレイ手順をCPUへ手書きせず、返された選択肢を使う。場の位置にルール効果はないため、配置は最初の空き枠を代表として列挙する。相手ターンの任意公開も列挙できる。`actingSides` は進行に必要な選択者で、任意公開できる全員の一覧ではない。

行動の `cost` は開始時の必要PP・MP・どんぐりと支払い時点。将来の回復を差し引いた値ではない。後続効果中の条件付き支払いまで合算しないため、`choose` の0を「この先も無料」と解釈しない。カード定義のスキルコストは基本値で、現在の補正後の値は局面の行動コストから読む。

`enumerateActionLines` は内部の調査・探索用。`source`（内部uid）や `types` で開始操作を絞れる。同じ側の選択をたどり、解決・相手の選択・勝敗・深さ/ノード上限で止まる。乱数は現在seedの1通りで、全出目を列挙しない。乱数使用や山札枚数変化は `uncertain`、打ち切りは `truncated` で示す。内部状態・未公開カードを含むので、返された `state` や生コマンドをモデル入力にしない。

Pythonでは一度ビルドしてから、次のように使える。エンジンプロセスの標準入出力はJSONLだけにし、Pythonからはビルドログの出るpnpmスクリプトを介さずNodeを直接起動する。

```sh
pnpm --filter @pplale/game-core run build
```

```python
from research.cpu.engine import Engine

with Engine() as engine:
    rules = engine.describe("rules")
    cards = engine.describe("cards")
    card = engine.describe(card_id="y_9")
    frame = engine.new(seed=42, viewer=0)
    decision = frame["decision"]
    for action in decision["observation"]["actions"]:
        print(action["id"], action["type"], action["source"], action["cost"])
    # 例では最初の合法手を選ぶ。ここを学習モデルの選択に置き換える。
    frame = engine.act(decision, decision["observation"]["actions"][0]["id"])
    diagnostics = engine.inspect(viewer=0)
```

`new` はseed・デッキ・ルールを指定可能。`observe` は現在の入力、`inspect` は入力と不可能な候補の理由、`act` は提示されたIDの実行、`cpu` は既存CPUを1判断進める。双方を動かす場合は `actors` の絶対sideから `observe(viewer=side)` を取り直す。観測内のside 0は常に閲覧側で、`decision.viewer` は絶対side。1操作で状態が変わるたびに全decisionを取り直す。古いdecisionや未提示IDは拒否する。対戦開始なしでも `describe` を呼べるので、必要なsection・cardIdだけ読むとコンテキストを節約できる。

TSの新方策は `cpuCommand(state, catalog, { side, policy })` で接続する。`policy` の入力は `DecisionInput`、出力は `{ decisionId, actionId }`。入力に相手の未公開手札・山札順・内部キュー・実行後の状態は含まない。従来のworker/server向け `cpuCommand` の戻り値は `Command | null` を維持する。既存探索の `strategy` も引き続き使え、提示済みの合法手を選んだことを入口で検証する。

## 使い方

リポジトリルートから実行する。Nodeは `mise.toml`。データ読み取り・エンジン操作はPython 3.10以上の標準ライブラリだけで使える。学習・グラフにはPython 3.13と下記の固定依存を使う。

```sh
# 全カードの特徴定義とスキーマを出力（対戦はしない）
pnpm run cpu:research catalog --out research/cpu/data/catalog.jsonl

# 全フルーツ環境を順に使い、各判断を20%の確率で保存
pnpm run cpu:research collect --out research/cpu/data/sample.jsonl --games 10 --seed 1000000 --share 0.2 --level hard

# ハッシュ・形式・分割・完了状態を検証して集計
python3 research/cpu/dataset.py research/cpu/data/sample.jsonl

# 同じスキーマで数値化したJSONLを出力
python3 research/cpu/dataset.py research/cpu/data/sample.jsonl --encode-out research/cpu/data/encoded.jsonl

pnpm run test:cpu-research
```

`--out` はカレントディレクトリによらずリポジトリルートからの相対パス、または絶対パス。既存ファイルは上書きしない。`data/` と `runs/` はGit管理しない。10試合は動作確認用で、強さを判断できる試合数ではない。

```python
from research.cpu.dataset import Dataset

dataset = Dataset("research/cpu/data/sample.jsonl")
for sample in dataset.samples("train"):
    observation = sample["observation"]  # カード別の事実・使用履歴・選択肢も保持

for sample in dataset.encoded("train"):
    x, action, y = sample["x"], sample["action"], sample["y"]
    # xはカード・効果・行動ごとの可変長データ。モデル側でpadding/pooling等を選ぶ。
```

TSでは `@pplale/game-core/research` の `observeGame / researchCatalog / encodeObservation` を使う。研究用スコア関数は `@pplale/game-core/ai` の `createResearchEvaluator(score, schema)` で `Evaluator` に変換し、`createMaster({ evaluate })` に渡せる。scoreは自分視点の評価点を返す。勝敗・引き分けの処理はアダプターが行う。カタログは作成後に変更しない。

## データと評価の分離

1. **カード定義**：基本値、キーワード、発動フック、明示的な効果記述。全カードを同じ形で扱い、カードIDのone-hot列を作らない。
2. **観測**：閲覧側を常にside 0に揃え、カード1枚ごとの現在値・状態・関係、使用済みカード、資源、未解決の選択、合法手を保持する。
3. **エンコード**：スキーマの名前・順序・除数を解釈してfloat32へ変換する。手書き評価や勝敗ラベルを入力しない。
4. **評価・学習**：上記を消費する側。既存CPUの手書き評価や学習済みモデルとは独立して変更できる。

`values` と同じ長さの `known` があり、未知・未設定を0と区別する。新しいフルーツや効果カテゴリは `unmapped` に残り、未対応の文字列を既知のゼロ値へ黙って変換しない。エンコードの既定列は初期の研究用表現であり、観測中の全情報を列へ展開しているわけではない。履歴・条件・新しい資源を使うモデルでは、元の観測・カタログから列や関係表現を追加できる。

カード数が増えても列数は変わらない。新しい特徴・能力カテゴリを追加するときはTSのスキーマを更新し、新しいハッシュでデータを作る。Pythonへ同じ列を手書きで追加する必要はない。

## 新カードと効果記述

カードのJSONと実行用スクリプトを登録すると、基本値・キーワード・フックは自動で出力される。効果の数値記述は同じ `CardScript` の `research` に置く。例は [y_9](../../packages/game-core/src/cards/strawberryYojo.ts) と [s_6](../../packages/game-core/src/cards/strawberrySweets.ts)。

```ts
research: {
    coverage: 'complete',
    effects: [
        { trigger: 'onPlay', operation: 'damage', target: 'enemy.unit', selection: 'one', amount: 2 },
    ],
},
```

- `coverage` は未記述なら `unannotated`、一部なら `partial`、記述済みなら `complete`。明示的な `complete`＋空のeffectsだけが「効果なし」の記述になる。
- 動的な効果量は `amount: null` とし、条件・依存カード・閾値などを記述する。0を代用しない。
- 記述のないカードも基本値・能力・現在状態・合法手を出力できる。現時点では代表的な9枚に効果記述を付け、その他は未記述と明示する。全カードの効果を自動解析できる状態ではない。
- 効果記述はルールの実行言語ではない。関数や原文を機械的に実行・解析して効果量を推測せず、実際の効果処理と対照するテストを追加する。
- 新しい操作・複雑な条件は文字列や構造を保持できる。既定の数値列で扱えない部分は `unmapped` や元データを確認し、専用エンコーダーを追加する。

## 視点・再現性・分割

相手の未公開手札は `cardId/current: null`。両者の山札は枚数だけで、順番・乱数・内部キューを出力しない。カード参照は `0.field.0` 等の観測内IDへ付け替え、内部uidからデッキ割当を推測できないようにする。公開された手札、プレイへの応答待ちのカード、自分の山札サーチの候補は既存の `viewFor` の公開範囲に従う。

JSONLは次の順で、最後のsummaryまで書けたものを完成とする。

| レコード | 内容 |
| --- | --- |
| manifest | 形式v1、スキーマ・カタログ・共通ルール/コマンド/Exスキルと各ハッシュ、コミット、dirty状態、実行JS・原カードデータ・出力スクリプトのハッシュ、seed・方策・採取率・ルール・実行上限 |
| match | seed、初期デッキ、絶対sideの勝者、ターン数、思考時間、採取判断数。観測入力とは別の再現・評価用情報 |
| decision | matchId、step、閲覧側、観測、選んだ合法手のindex、最後の勝敗 |
| summary | 完了試合数・判断数・未決着数 |

スキーマ・カタログのハッシュは、キー順を揃え数値をIEEE754のhexにしたJSONのSHA-256。浮動小数点の文字列表現がTSとPythonで異なる問題を避ける。

新しい自己対戦データは `floor(seed / 8) % 10` の0をtest、1をvalidation、残りをtrainとする（`environment-block-v1`）。8連続seedで4フルーツ環境×ExP有無を一周する。旧 `seed % 10` は環境の偶奇と分割が相関するため、読取互換だけを残し学習監査では拒否する。同じ試合の局面を別の集合へ分けない。フィードバックは再生内容のhashで固定分割する（後述）。

未決着は `unfinished` として保存し、既定の学習用イテレーターから除く。敗北や引き分けに置き換えない。全件を読んだ際、完了summary、試合ごとの件数、分割、結果とラベルの一致を検証する。

この分割は試合単位。未知のデッキ系統への汎化を測る場合は、別途デッキ構成で分けた評価集合も必要。最終評価用seedを繰り返し使って候補を選ばない。混合にはスキーマ・カタログ・ルール記述と実行ルールのhash一致を必要とし、試合IDとseed＋初期デッキの重複も拒否する。新形式の `rulesEngineHash` はAI・研究エンコーダー以外の実行JSを対象にし、学習実装の変更だけでデータが無効になるのを避ける。全実行JSの `engineHash` も記録する。旧データに実行ルールhashがなければ全エンジンhashで厳しく照合する。確認できない旧データへhashを後付けして混ぜない。

正式な比較はcleanなコミットから生成する。`workingTreeDirty: true` のhashだけでは内容を復元できないため、研究実行は `source.zip` も保存する。思考時間は端末・負荷に依存し、seedが同じでも一致を保証しない。

## 既存CPUとの互換性

現行75入力モデルはそのまま使う。旧特徴量の配列変換は [value-features.ts](../../packages/game-core/src/ai/value-features.ts) に分離し、[value.ts](../../packages/game-core/src/ai/value.ts) が手書き評価・概算打点を明示的に渡す互換アダプターとなる。研究データへこの評価点を混ぜない。既存のバイナリ学習スクリプトは互換経路として残す。

研究用の線形/MLPは別形式 `pplale-pooled-value-v1` とし、[pooled-value.ts](../../packages/game-core/src/ai/pooled-value.ts) で推論する。既存の `ValueModel` JSONへ入れない。実験runnerはモデルファイル・スキーマ・カタログ・ルール・pool仕様のhashを検証する。新カード追加時は基本値を自動出力できるが、既存モデルを無検証で使用せず、新しいカタログで再収集・再学習・再比較する。エンコードの意味を変えた場合は仕様versionも更新する。

## 研究を実行する

```sh
# 初回のみ。mise exec -- の中でNode/pnpmを固定する。
python3.13 -m venv research/cpu/.venv
research/cpu/.venv/bin/python -m pip install -r research/cpu/requirements.lock.txt

# データ640試合→2モデル→4候補比較→8環境のデッキ探索→グラフ
# 出力先とseedは毎回新しくする。CPU対戦は数時間かかることがある。
mise exec -- research/cpu/.venv/bin/python research/cpu/study.py run \
  --run research/cpu/runs/my-study --seed 9600000 --games 640

# 既存の結果から図だけ再生成（対戦や学習を再実行しない）
research/cpu/.venv/bin/python research/cpu/report.py research/cpu/runs/my-study

# Pythonの学習テストも省略せず実行
mise exec -- pnpm run test:cpu-research
mise exec -- research/cpu/.venv/bin/python -m unittest discover -s research/cpu -p 'test_*.py'
```

`run` は新規ディレクトリに限定する。自己対戦のseed・試合数は80の倍数。学習の調整だけなら `learning.py data-*.jsonl --out 新規ディレクトリ`、対戦のみなら `study.py compare --run 新規ディレクトリ --models 学習出力 --seed 新規の8の倍数`。デッキのみは `study.py decks --run 新規ディレクトリ --seed ...`。事前に1つへ決めた仮説だけを最終テストする場合は `study.py confirm --run 新規ディレクトリ --models 学習出力 --candidate mlp-blend25 --seed 新規の8の倍数 --hypothesis "根拠"`。`--search` の既定 `{}` は現行masterと同じ探索量（2400局面・勝ち筋4000局面）で、評価の違いだけを比べる。seedのbit 2がExP有無を選ぶので、例として8の倍数は通常、そこへ4を加えるとExPあり。

### 実装した方式と既定値

| 工程 | 方式・設定 |
| --- | --- |
| 自己対戦 | hard＋15%ランダム合法手、playingの判断を16%採取、最大600コマンド、4環境×ExP有無 |
| カード表現 | 基本値・現在値・knownマスク・効果記述＋原文の24次元signed文字n-gram hash。自他×hand/field/nap/exile/choiceごとにsum pooling、カード枚数と資源を追加。2714入力 |
| 線形モデル | 標準化した入力のロジスティック回帰 |
| ニューラルネットワーク | 2714→16(tanh)→1(logit)。共有特徴の固定poolingであり、カードID埋め込みやTransformerではない |
| 学習 | Adam、学習率0.003、L2=0.0001、batch=128、最大40epoch、validation改善なし7回で停止、最良epochを採用。標準化はtrainのみ。各試合の総重み1 |
| 教師 | 閲覧側の終局結果（win=1/loss=0/draw=0.5）。自己対戦結果による教師あり価値学習。方策勾配RLではない |
| オフライン評価 | match重み付きlog loss、Brier、決着局面のaccuracy、較正誤差と較正曲線。drawはlog loss/Brierには含め、二値accuracyから除く。validationでepoch・モデルを選び、testは最後の診断のみ |
| 実戦候補 | 旧学習評価、手書き評価、新線形25%＋旧評価75%、新MLP25%＋旧評価75%。全候補はmaxNodes=600、beam=4、worlds=2、candidates=5、lethalNodes=400。相手は既定の現行master |
| 候補選択 | screen各8ペアで上位2候補→別seedのvalidation各32ペアで1候補→さらに別seedのtest128ペア（256試合）。同点は思考時間比で選択 |
| 採用条件 | 未決着0、全体128ペア以上、各フルーツ32ペア以上。全体の片側下限>0.5、各環境の下限>0.4、試合あたり思考時間比≤1.25。Hoeffding＋全体/4環境のBonferroni補正、α=0.05 |
| デッキ探索 | 環境ごとに合法デッキを変異・比較し2世代×6候補、重複上限2枚（ルール上1枚制限は優先）、候補あたり4ペア。選択後は未使用の相手16ペア。操作CPUはhard |

テキストhashには衝突があり、効果条件やカード間の関係を完全には表さない。新カードを自動で列へ載せられることと、そのカードを強く使えることは別。カード定義の事実・観測は残るため、後から学習可能な集合表現や関係特徴を追加できる。[Deep Sets](https://arxiv.org/abs/1703.06114) は順序不変な表現の参考、最適化は [Adam](https://arxiv.org/abs/1412.6980)。実装はNumPy、図はMatplotlibを使う。

CPU比較では同じseed/2デッキで担当sideを入れ替え、2試合の平均を独立な1ペアとして集計する。デッキ比較では候補デッキも担当sideと一緒に移動する。引き分けは0.5。未決着は別集計して採用を拒否する。区間のbootstrap単位もペア。ExP有無は両方を含めるが、採用の環境別検定はフルーツ4群であり、8条件それぞれの非劣性を保証する検定ではない。保守的な下限なので、小さな改善を検出するには事前に試合数を増やす必要がある。

評価前にplanを固定し、`runs/suites.jsonl` にseedを予約する。消費済みseedは別のplanへ再利用しない。このledgerも研究記録とともに保管する。これはローカル実験間の保護で、ledgerを削除した端末や別端末の実験までは検知しない。探索用の予測精度test・実戦testを見た後に条件を変えた場合は、新しい最終評価群を用意する。

出力の入口は `report/report.html`（単独で開ける）と `report/report.md`。学習曲線、較正、候補比較、環境別スコア、時間、デッキ評価をPNG/SVG化する。raw JSONL、plan、model JSON（全重み・正規化・入力hash・学習元SHA-256）、source.zipを残す。合格時だけ `approved-candidate.json` を作るが、本番CPUを自動で置き換えない。データとモデルはGit対象外なので、長期保存にはrun一式とledgerの保管が必要。

## フィードバックから再学習する

CPUサーバーの既存の対戦記録JSONLをローカルファイルとして渡す。サーバーやストレージを自動取得・変更する処理は追加していない。

```sh
# 適合する自己対戦データに検証済み対戦記録を追加して、最初から再学習・再比較
mise exec -- research/cpu/.venv/bin/python research/cpu/study.py feedback \
  --run research/cpu/runs/feedback-next --seed 18600000 \
  --datasets research/cpu/runs/my-study/data-0.jsonl research/cpu/runs/my-study/data-1.jsonl \
             research/cpu/runs/my-study/data-2.jsonl research/cpu/runs/my-study/data-3.jsonl \
  --feedback /path/to/reports.jsonl
```

`verifyReport` でコマンドを検証して現在のエンジンで再生し、終局した試合だけ採用する。申告のwinner・コメントは教師にしない。受理/拒否理由・重複件数・入力hashを保存する。seed/デッキ/検証済みコマンドのSHA-256を試合IDにし、その先頭32bit `%10` で固定分割する。日時・モデル名の変更で別splitへ移動できない。学習にはtrainだけを用い、長い試合が支配しないよう総重みは他の試合と同じ1。複数回の循環では元の自己対戦＋既存/新規のフィードバックデータを `--datasets` に渡し、同じ試合を重ねない。実行ルールが変わって再生・互換照合できない記録は混ぜず、同じルールで再収集する。

既存記録には元のロビー環境がないため、環境は使用カードから最小の環境を推定したものと明記する。「human-report」は記録の由来の指定で、プレイヤーが人間であることを暗号的に証明するものではない。1バッチ100MiB・1000試合まで。

動作確認は `node packages/game-core/scripts/feedback.mjs demo 出力.jsonl` でnormal対hardの合成記録を作り、同じfeedbackコマンドへ `--origin synthetic-smoke --smoke` を指定する。8試合のラベルには故意に誤った申告勝者を入れ、再生側の勝者へ訂正されることも確認する。smokeは再学習と2ペアの実行だけで、不採用を固定する。合成記録を含むモデルも本採用判定では拒否する。自動的に賢くなったと仮定せず、再学習のたびに未使用条件の実戦評価を通す。

## 2026-10-23の研究結果

640試合・7801局面、train/validation/test=512/64/64試合。全4環境×ExP有無を各分割に含み、未決着0。初回試行はGit未コミットの探索的実験で、ソース控え・hashを保存した。

4候補からvalidationで選んだMLP25%混合は、現行masterとの最終128ペアで **115勝141敗、44.9%**（ペアbootstrapの記述的95%区間40.2–49.6%）。試合あたり思考時間は現行の **66.8%**。採用条件に達せず、**本番CPUは維持**した。速くなったが強くなった証拠はない。線形/MLPの局面test log lossは0.6345/0.6708で、予測指標だけでCPUを採用できないことも確認した。

全4フルーツ×ExP有無のデッキ探索も実行し、未使用相手での勝敗と構成を保存。候補数と相手分布を限った探索であり、最強デッキを証明した結果ではない。フィードバックは別の自己対戦160試合＋合成記録8試合で再学習・TS推論・実戦まで確認した。実際の人間の記録による改善は未検証。

Git保存用の集計・構成・hashは [results/2026-10-23.json](results/2026-10-23.json)。図も [学習](results/2026-10-23-learning.svg)・[候補比較](results/2026-10-23-cpu-comparison.svg)・[環境と時間](results/2026-10-23-cpu-environments.svg)・[デッキ](results/2026-10-23-decks.svg) として残す。ローカルの詳細: [研究レポート](runs/20261023-study/report/report.html)、[フィードバック動作確認](runs/20261023-feedback-smoke/report/report.html)。今回のtestを改善候補の選択へ再利用しない。

### 探索量を揃えた確認（2026-10-23）

600局面での比較は現行masterの既定（2400局面・勝ち筋4000局面）より探索が少なく、モデルと探索量の効果が混ざっていた。そこで同じMLP25%混合を事前に1仮説として固定し、`study.py confirm` で探索設定を現行masterの既定値に揃え、未使用seed 9800000〜の128ペアで評価した。

結果は **118勝138敗、46.1%**（記述的95%区間41.0–50.8%、Hoeffding下限32.7%）。フルーツ別は45.3〜46.9%で、600局面時に弱かっためろん・おれんじとの差は区間内。試合あたり思考時間は現行の **149%**。優越性・環境の非劣性・時間の3条件とも満たさず、**本番CPUは維持**。探索量を揃えても現行の組み込み学習評価（40000試合で学習）を上回る証拠はなく、ボトルネックは探索量より研究モデル側（640試合のデータ量と過学習）と判断する。次はデータ量を増やした再学習を、新しいseed群で評価する。

集計は [results/2026-10-23.json](results/2026-10-23.json) の `masterBudgetConfirmation`、図は [比較](results/2026-10-23-master-budget-cpu-comparison.svg)・[環境と時間](results/2026-10-23-master-budget-cpu-environments.svg)、ローカルの詳細は [レポート](runs/20261023-master-budget/report/report.html)。

### ライブラリでの比較とデータ10倍（2026-10-23）

`ml.py` は共通の観測・pooling・試合単位の分割を使い、追加ライブラリ（[requirements-ml.txt](requirements-ml.txt)）で学習方式を比べる。`value` はNumPyの従来2方式、scikit-learnのロジスティック回帰（Cはvalidationで選択）・HistGradientBoosting、PyTorchのtanh MLP32＋ドロップアウト・Deep Sets（カード1枚ずつの変換を学習し、自他×ゾーンごとに足し合わせる）。線形とtanh MLPは `pplale-pooled-value-v1` として書き出し、TSの推論と1e-14以下で一致することを確認した。勾配ブースティングとDeep SetsはTS推論がないため予測の比較だけ。`policy` はさいきょうCPUが選んだ手を、提示された合法手の中から当てる（ロジスティック回帰・勾配ブースティング・PyTorchの局面ごとのsoftmax）。

```sh
research/cpu/.venv/bin/python -m pip install -r research/cpu/requirements-ml.txt
mise exec -- research/cpu/.venv/bin/python research/cpu/ml.py value data-*.jsonl --out 新規ディレクトリ
mise exec -- research/cpu/.venv/bin/python research/cpu/ml.py policy masterの収集データ*.jsonl --out 新規ディレクトリ
research/cpu/.venv/bin/python research/cpu/report.py 出力ディレクトリ --ml   # 比較図
research/cpu/.venv/bin/python research/cpu/gallery.py                       # results/index.html
```

- **データ10倍**：hard自己対戦6,400試合（76,930局面、seed 20000000〜）。テストlog lossは640試合の0.63〜0.67から、全方式で0.555〜0.583へ改善。最良は勾配ブースティング0.555、Deep Sets 0.564とロジスティック回帰0.563はほぼ同等で、Deep Setsの優位は確認できなかった。
- **実戦**：TSで動く4方式からvalidationでロジスティック回帰を選び、600局面の探索で混合率25/50/100%をふるい分け（各32ペア、seed 9900000〜）。25%＝46.9%、50%＝45.3%、100%＝35.9%。25%を最終128ペア（seed 9910000〜）で評価し **112勝144敗、43.8%**（記述的95%区間39.1–48.4%）、時間は現行の66%。本番CPUは維持。予測精度の大幅な改善は実戦の強さに結びつかず、学習評価だけでは手の良し悪しを見分けられない。
- **手の模倣**：master同士80試合の全判断（seed 21000000〜、選択肢2つ以上の7,112判断、test 8試合）。PyTorchの順位づけが最良で、テストの1番目一致49%（ランダム34%、手の種類の頻度41%）。選択肢6つ以上では上位3つに67%で、候補の絞り込みに使うと3回に1回masterの手を落とす。読む順番の並べ替えなら試せるが、データが少なく実戦では未検証。

結果の一覧と図は [results/index.html](results/index.html)。数値は [results/2026-10-23.json](results/2026-10-23.json) の `data10x`。次は勝敗だけでなく探索の評価値・masterの手を教師にする（予測でなく手の比較を学ぶ）方向を、新しいseed群で評価する。
