# 対戦ゲームの設計

## 今回の構成

既存の Next.js サイトに `/game/` を追加し、対戦ルールを npm workspace の `@pplale/game-core` に分離する。リポジトリ・Firebase プロジェクト・Vercel プロジェクトは共有する。

```text
src/data/*.json ── catalog.ts ──> game-core
                                   ↑ Command
GameSetup / Firebase decks ──> BoardEmulator ──> GameState を描画
                                   ↓
                           localStorage に途中保存
```

| 層 | 責務 | 場所 |
| --- | --- | --- |
| Next.js | ルート、カード画像、ログイン、Firebase の保存済みデッキ読み込み | `src/app/game`, `src/lib/game` |
| 画面 | 手札、ドラッグ、対象選択、盤面、履歴、操作モード | `src/components/game` |
| ゲーム本体 | デッキ検証、状態遷移、カード効果、戦闘、勝敗、乱数 | `packages/game-core/src/engine.ts` |
| CPU | 状態から次の Command を選ぶ | `packages/game-core/src/cpu.ts` |
| 状態復元 | 保存内容の形式とカード参照を確認 | `packages/game-core/src/snapshot.ts` |

### 分離する価値

- ゲーム本体は React / Next.js / Firebase / DOM に依存しない。UI の更新やホスティングを変えてもルールを持ち運べる。
- 人間と CPU は同じ `applyCommand` を通る。PP、不正な対象、手番などの判定を画面ごとに重複実装しない。
- ゲーム本体は元の状態を変更せず次の状態を返す。状態内の乱数 seed により、同じ入力とコマンド列で同じ結果を再現できる。
- 「効果の対象を選ぶ」途中も状態として保存できる。将来の通信層にも渡せる。

分離の単位はライブラリ。現段階で別サービス・別リポジトリにする必要はない。

## 対戦の開始とドロー

`GameState.phase` は `dice` → `initiative` → `opening` → `mulligan` → `playing`。ダイスと先攻決定は core、演出は UI が扱う。初期ドローは `openingRemaining` と `openingDraw` Command で各側を独立して管理する。双方が相手を待たずに山札を選んで引ける。通常ドロー・カード効果・10/5のドローは `pending` に保持し、山札クリックの `choose` Command ごとに1枚引く。解決待ちの間はプレイやターン終了を拒否する。先攻3枚・後攻4枚を引いた後、`mulligan` / `keep` Command で各初期カードを1回だけ交換し、双方が確認して対戦を開始する。CPU も同じ Command を使用する。

UI はドロー前後の手札と山札の差分から移動演出を描く。詳細はサイドパネル、効果の対象は場や手札、山札を直接操作する。保存キーは維持し、旧セッションは進行中の `playing` 状態として復元する。

## Vercel への配置

- Root Directory はリポジトリのルート。既存 Next.js プロジェクトのまま運用する。
- `npm ci` で root と game-core の依存関係をインストールする。root の `workspaces` と依存関係、共有 `package-lock.json` に登録済み。
- Build Command は既存の `npm run build`。`transpilePackages` により game-core の TypeScript を Next.js がコンパイルする。core の `dist` を事前生成・コミットする必要はない。
- Firebase の環境変数と AuthProvider は既存のものを使用する。同一ドメインなら同じログイン状態で保存済みデッキを選べる。
- Vercel に常駐プロセス、WebSocket サーバー、対戦用 API は追加していない。CPU / 同一端末対戦はブラウザで動く。

参考: [Vercel Monorepos](https://vercel.com/docs/monorepos)。Next.js の設定はインストール済みパッケージの `node_modules/next/dist/docs/` に合わせる。

## データとセッション

カード ID と原文は既存 JSON を使う。アダプターが画像を除いたカタログを core に渡す。Firebase の `users/{uid}/decks/{deckId}` から `yojoDeckIds` / `sweetDeckIds` / `playableCardId` を読み、対戦開始時に検証する。読み込み専用で保存デッキを書き換えない。

対戦途中は `pplale-game-session-v2` に自動保存する。同一ブラウザ・同一オリジンで再読み込み後に再開できる。進行中の対戦にはデッキの実体と選択したルールが保存される。保存形式の変更、ブラウザのデータ削除、別ドメイン・別端末への移動では再開できないことがある。ルールコード自体の版を固定した長期保存は未実装。

## オンライン対戦へ進める場合

現在の「両側を操作」は同一端末用であり、インターネット越しの対戦ではない。次の段階では以下を追加する。

1. ブラウザから完全な状態ではなく Command と期待 revision を送信する。
2. サーバーで Firebase ID token とプレイヤー権限を検証し、game-core で実行する。
3. Firestore transaction で revision と状態を更新し、二重操作を防ぐ。
4. 完全な状態はサーバーだけに置き、相手の手札・山札順を除いた各プレイヤー用 view を配信する。
5. 対戦専用の Firestore rules、切断・再接続・投了を実装する。

今のローカルセッションは両者の情報を含む。これをそのままオンライン対戦の公開ドキュメントに置かない。

参考: [Firestore queries](https://firebase.google.com/docs/firestore/query-data/queries)、[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)。

## 未確定のルール

先攻3枚・後攻4枚、初期手札の各カード1回の交換、山札の自由選択はユーザー指定を反映済み。提供された能力説明とFAQは [ルール・裁定集](game-rules.md)、現在の処理と差分は [実装状況](card-effect-rules.md) に記録する。PP上限・通常ドロー枚数・先攻初回ドロー・山札切れなど、資料でまだ指定されていない値は `sandboxRules` の暫定設定。確定した裁定は画面ではなく core に反映する。

## 今回の確認範囲

- root の TypeScript、変更箇所の ESLint、game-core 単独のコンパイルを実施。
- ローカルブラウザで開始、手札の拡大、4番目の枠へのドラッグ配置、PP調整、10ポイントでのドロー、おはじき、再読み込み後の復元、CPUのターン進行を確認。
- `next build --webpack` は `/game` を含む本番ページの生成まで成功。
- 通常の `next build` は、この実行環境でTurbopackの内部ポート利用が許可されず停止。既存 Vercel プロジェクトへの GitHub push による本番デプロイは成功している。
- Firebase実アカウントでのログイン・保存デッキの読み込み、全カード組み合わせの公式裁定との照合は未確認。

### ターン開始の演出

`playing` への移行とターン番号の変更時、中央に手書きフォントの「あなたのターン / あいてのターン」、各側のターン数と現在PPを表示する。Panda CSS の keyframes で発光ラインと文字を約600msで拡大・フェードアウトし、その間は操作とCPU進行を待つ。交換後のカード移動がある場合は、その演出を終えてから表示する。初期手札の交換中や保存した対戦の復元時には表示しない。動きを減らす設定では拡大を省略する。

### 初期手札の交換画面

下段の手札を上段へ移し、左の赤い「幼女」枠または右の青い「お菓子」枠で交換先を指定する。タップでは元の種類の枠へ移し、上段のカードを再度タップすると手札へ戻す。ドラッグでは両方の枠と手札を直接行き来できる。キーボードの左右キーで交換先を選び、下キーで手札に戻す。複数枚を並べて「決定」でまとめて交換し、双方の確定後に対戦を開始する。

### 能力名・数字の印

挑発・突撃・防衛などの有効な能力は、ハートなどの記号ではなく大きな日本語の札で表示する。攻撃力の変化は左、HPの変化は右の白い円形おはじきに分け、どちらかが変わっている場合は両方を表示する（例：左+1、右+0）。ダメージ・追加PP・デッキ枚数・スキルコストなどの丸い印は縦横を固定し、楕円への変形を防ぐ。相手側の能力名と数字もこちらから読める向きにする。

通常のカードコストは画像に任せ、現在の `costOf` が印刷されたコストと異なる場合のみ、手札・選択カード・持っているカード・拡大画面に円形の現在コストを表示する。軽減は緑の下向き矢印、増加は赤の上向き矢印で示す。永続軽減とターン限定の軽減を含め、表示値とプレイ可否は同じ計算を使う。

### PPの丸

自分のPPの丸は、その時点の最大PPと同じ個数を描画する。現在PPの分だけ明るい緑、消費済みの分だけ暗い緑にする。7/7では7個すべて明るく、3/7では明るい3個と暗い4個、0/7では7個すべて暗く、0/0では丸を表示しない。ゲーム全体のPP上限の未到達分は描画しない。各円の幅は個数に合わせて計算し、一列に収める。
