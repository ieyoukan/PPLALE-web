# docs の検証記録

確認日：2026-10-16（日本時間）。対象は `caa0a2b` を基にした作業ツリーの実装・修正・追加テストと docs。実行環境は Node.js v22.23.2、インストール済み Next.js 16.3.4。

## 検証の基準

変更前の [game-rules.md](game-rules.md) をルール・裁定の基準とする。実装や既存テストは現在の動作を確認する根拠であり、裁定を書き換える根拠にはしない。今回一度行った `game-rules.md` の変更は取り消した。実装との差は [実装状況の差分表](card-effect-rules.md#提供ルールとの主な差分) に記載する。

## 確認した実装上の事実

| 項目 | 確認結果・根拠 |
| --- | --- |
| カード数 | JSONを集計し、通常の幼女151種類（いちご31・ぶどう34・メロン48・オレンジ38）、お菓子46種類（いちご28・ぶどう11・オレンジ7）、通常プレイアブル6・拡張3を確認。派生・トークンは別集計。[データ](../src/data/yojo.json)、[実行定義](../packages/game-core/src/cards/registry.ts)、[カードごとのテスト](../packages/game-core/tests/card-text.test.mjs) |
| デッキの枚数制限 | 幼女20・お菓子10。動物さんソーダに加え、チャイも各種類1枚まで。[setup.ts](../packages/game-core/src/setup.ts) |
| CPUの探索 | 「つよい」は上限20ノードの勝ち筋探索と局面評価。「さいきょう」は上限4000ノードの勝ち筋探索とターンの手順・応手の探索を実装。最適手の保証はない。[hard.ts](../packages/game-core/src/ai/levels/hard.ts)、[master.ts](../packages/game-core/src/ai/levels/master.ts)、[探索テスト](../packages/game-core/tests/turn-search.test.mjs) |
| 観戦時の並び | CPU 1はside 0、CPU 2はside 1。観戦の初期表示の手前はside 1で、CPU 1が奥・CPU 2が手前という既存の記述を確認。[sessionStore.ts](../src/lib/game/sessionStore.ts)、[useBoard.ts](../src/components/game/board/useBoard.ts) |
| PPの保持と上限 | 残りPPは相手ターン中も保持。次の自分ターン開始時に補充値へ置換。最大PPは12までだが、どんぐり等で現在PPは12を超えられる。[phases.ts](../packages/game-core/src/commands/phases.ts)、[cards.ts](../packages/game-core/src/core/cards.ts)、[回帰テスト](../packages/game-core/tests/review-fixes.test.mjs) |
| ポイントの下限 | 現行実装は0で止める。うぃまるのXは実際に失ったポイント数でなく攻撃力から計算。攻撃力9・残り2ポイントでもX=9として13枚除外することを追加テストで確認。ポイント下限の矛盾はユーザーへの確認待ち。[points.ts](../packages/game-core/src/core/points.ts)、[expandedOps.ts](../packages/game-core/src/effects/expandedOps.ts) |
| おにごっこ | 追加付与では小さいXを採用し、状態には有効なXを1つ保持。ルール6.1 の「内部的には両方を持つ」との差は残るが、有効なX・保存・共有コード・場を離れたときのリセットは追加テストで確認。[giveEvasion](../packages/game-core/src/core/cards.ts)、[回帰テスト](../packages/game-core/tests/review-fixes.test.mjs) |
| 幼女の奪取 | レンテの通常スキルに実装済み。場→場では付与された状態を引き継ぐ。ただしリマチャンの付与は相手ターン前に除外されるため、通常の進行で付与されたまま奪取することはできない。手番を直接変えた局面での挙動は別にテストした。[skills.ts](../packages/game-core/src/playables/skills.ts)、[ops.ts](../packages/game-core/src/effects/ops.ts)、[movement.ts](../packages/game-core/src/core/movement.ts) |
| 盤面コード | 手札の能力値・キーワード・スキル使用履歴も書き出す。解決待ち効果やPPの前借り残債などは書き出さず、完全な対戦セッションとは異なる。[position.ts](../packages/game-core/src/position.ts)、[edit.ts](../packages/game-core/src/edit.ts)、[保存テスト](../packages/game-core/tests/position.test.mjs) |
| 膠着 | どんぐり・奪ったスキルも行動に数える。Exスキル・回数制限のないスキルは数えない。即終了の条件は保守的な判定。[stall.ts](../packages/game-core/src/core/stall.ts)、[turn.ts](../packages/game-core/src/commands/turn.ts)、[usage.ts](../packages/game-core/src/playables/usage.ts) |
| ルームの保存先 | Redis設定時は共有保存、未設定時はプロセス内のメモリ保存。別端末へのローカル対戦の同期とは異なる。[config.ts](../services/room-server/src/config.ts)、[backend.ts](../services/room-server/src/backend.ts) |
| OGPのキャッシュ | 完成画像の32MiB上限と同時生成2件はプロセス単位。素材キャッシュは別。HTTPキャッシュ15分と署名の既定有効期間1時間を区別。[ogDeckImage.ts](../src/lib/ogDeckImage.ts)、[署名](../src/lib/ogSignature.ts)、[API](../src/app/api/og/[userId]/[deckId]/route.tsx) |
| CSSの埋め込み | `experimental.inlineCss` は有効。Next.js同梱ガイドで本番限定・全ページ共通・クライアント遷移時の例外を確認。[設定](../next.config.ts)。ガイド：`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/inlineCss.md` |

Vercelのモノレポ設定は [公式ガイド](https://vercel.com/docs/monorepos) と照合した。これはRoot Directory等の設定方法の確認であり、このリポジトリのVercelプロジェクト設定や本番デプロイの成功を確認したものではない。

## 実行したテスト（追加検証後）

| コマンド | 結果 |
| --- | --- |
| `npm run test:game` | 576件成功（追加20件）。game-coreのTypeScriptコンパイルを含む |
| `npm run test:deck-images` | 4件成功。全素材のOGP生成、同時処理の共有、キャッシュ、日英サムネイルを検証 |
| `npm run test:cpu-server` | 15件成功 |
| `REDIS_URL=redis://127.0.0.1:<port> npm run test:room-server` | Redis 7.4 Alpineの専用コンテナに接続して14件成功。OSプロセスの強制終了・置き換えによる復元テストを含む |
| `npx playwright test --workers=2 --reporter=line --output=/private/tmp/pplale-docs-e2e-results` | Chromiumで70件成功、ルーム対戦の2件は接続先未設定でスキップ |
| `PPLALE_ROOM_TEST_URL=http://localhost:3102 npx playwright test e2e/room-match.spec.mjs --workers=1 --reporter=line --output=/private/tmp/pplale-docs-room-e2e-check-results` | 専用のローカルWeb・ルームサーバーに対して2件成功。対戦開始・手札の非公開・再接続・投了・再戦・観戦を確認 |

初回の検証は639件成功。追加後の再実行は679件成功（ゲーム576・画像4・CPU15・実Redis14・画面70）、ルーム画面2件は接続先未設定でスキップ。追加の20件の画面テストは本番ビルドでも成功し、重複実行分は679件に加算していない。ルーム画面2件の単独実行は初回の結果であり、今回の実Redis検証14件とは別の検証。

## 追加した再現テストと修正

- [エンジン20件](../packages/game-core/tests/docs-verification.test.mjs)：色おにとタイプ付与・能力値の入れ替え・ぷらむの手札戻し、あみのとリンネの併用順、ぶらんちゃんの任意の支払いと途中保存、えーりんの6人から4人の除外、氷花の山札0〜2枚、よみの空き枠不足、もなかの敗北と両者0ポイント、リマチャンの終了時除外、うぃまるのX、おにごっこの保存とリセット、破壊ログの移動先を検証。
- [画面20件](../e2e/docs-verification.spec.mjs)：いのまこ・ちょりのスキルと反応、あみの・ぶらんちゃん、奪ったスキルを1280×860・844×390・375×812で操作。メロンの絞り込みと375px幅のタブも確認。本番ビルドでも実行した。
- [公開手札](../e2e/revealed-hand.spec.mjs)：375px幅を追加。[公開予定の取消](../e2e/reveal-choice.spec.mjs) と合わせて9件成功。
- [実プロセス復元](../services/room-server/tests/process-restart.test.ts)：異なる2つのNode.jsプロセスで同じRedisのルームを共有。プロセスを順にSIGKILLし、置き換えたプロセスで席のトークン・対戦状態・更新済みのダイスを復元し、操作を継続できることを確認。実際のKubernetesクラスタやRedis自体の停止・復旧は含めない。
- メロンの絞り込み選択肢を追加。375px幅で手札が重なり選べない問題は、600px以下の幅を横スクロールできる配置に変更して修正。タブのはみ出し、準備画面のコントラスト、山札に戻る幼女・除外されるもちだの移動先ログも修正した。

## ビルド・静的検査・性能

- `npm run build`：通常のTurbopack本番ビルド成功。一時コピーでの最初の試行は、外部を指すnode_modulesのシンボリックリンクをTurbopackが拒否したため、リポジトリ内で再実行した。
- `npm run typecheck`：成功。変更箇所のESLintは問題なし。`npm run lint` はエラー0件・警告11件。
- [再現用スクリプト](../scripts/check-game-performance.mjs)：`node scripts/check-game-performance.mjs http://localhost:3104 docs/performance-2026-10-16.json`。`next start -p 3104` で本番サーバーを起動してから実行する。
- [実測JSON](performance-2026-10-16.json)：1280×860・375×812、deviceScaleFactor=1、各3回、毎回新しい未ログインのブラウザコンテキスト。JS約378.6KiB・埋め込みCSS約22.8KiB（gzip換算）、外部CSSリクエスト0件、canonicalは `/game/` を参照。
- axeのWCAG 2 A/AA違反は修正後の全6回で0件。グラデーション等でコントラストを自動判定できない要素は `incomplete` に位置と理由を残した。判定保留からも補助文字とタブの表示を見直したが、完全な手動アクセシビリティ監査ではない。

保存済みデッキ一覧のE2Eは [テスト用データ](../e2e/fixtures/savedDeckHarness.mjs) を使う。Firebase実アカウント・本番データでの確認は含まない。Firebaseは従来利用できているとのユーザー確認により、今回の追加検証対象から外した。ローカル本番ビルドの性能測定は、過去の変更前や公開環境との比較ではない。

## 確認が残ること

- ポイント下限について元のルール第2節と6.1のどちらを優先するか。ユーザーへの確認待ち。ルール本文は変更していない。
- おにごっこの複数保持と単一値への集約という内部表現の差。今回の有効なX・保存・移動の検証は成功したが、個別の付与を解除する将来の効果を含めた保証はしない。
- ブラウザ版の7枠という仕様を採用する判断。満員時に出せる分だけ出す動作は確認済み。
- 本番デプロイ・実クラスタの運用、Redis自体の障害復旧、全カードの組み合わせの網羅。
- 過去の性能比較は対象コミット・HAR等がなく再現不能。現行の測定値と条件を別途保存した。
