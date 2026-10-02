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

初期手札・通常ドロー・先攻補正・PP上限・山札切れは `sandboxRules` の暫定値。開始画面から変更できる。攻撃キーワードの細部、効果の同時解決、条件を満たせない場合の扱いは `card-effect-rules.md` に記録する。公式裁定が確定したら、画面ではなく core のルールを変更する。

## 今回の確認範囲

- root の TypeScript、変更箇所の ESLint、game-core 単独のコンパイルを実施。
- ローカルブラウザで開始、手札の拡大、4番目の枠へのドラッグ配置、PP調整、10ポイントでのドロー、おはじき、再読み込み後の復元、CPUのターン進行を確認。
- `next build --webpack` は `/game` を含む本番ページの生成まで成功。
- 通常の `next build` は、この実行環境でTurbopackの内部ポート利用が許可されず停止。Vercelへの実デプロイは未実施。
- Firebase実アカウントでのログイン・保存デッキの読み込み、全カード組み合わせの公式裁定との照合は未確認。
