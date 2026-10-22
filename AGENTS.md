テストは複雑なロジック、大幅なUI変更などでは行うべきだが毎回例えば画像変えただけなどではやらなくていい。
- カードのルールは正確さを重視したい。docs/game-rules.mdを参考にして
- 可愛さとソシャゲのようなUIの綺麗さを意識したい。文字はなるべく使わずに、アニメーションやUIなどでユーザーに理解させることを意識

## 資料の読み方

- 資料の場所が不明なときは `docs/README.md` を入口にし、作業に関係する文書・見出しだけ読む。docs全体を一括で読み込まない。
- CPUの判断・重み・探索・学習は `docs/cpu.md`。まず見出しを検索し、該当する節とリンク先の実装だけ確認する。学習済みの係数配列は、数値の検証・変更が必要なときだけ読む。
- `docs/performance/` の計測記録・JSONと、各文書の過去の実験・検証記録は、性能調査や再計測に関係するときだけ読む。過去の成功を現行の検証結果として扱わない。
- 仕様の説明は既存の該当文書へ集約し、別のREADMEやAGENTS.mdへ重複させない。数値・実装を変更した場合は対応する資料も更新する。

## 配色・デザインのルール

- サイトの配色は、ユーザー指定のロゴ `public/pupu_game.webp` に揃える。桜色・クリーム・ココアブラウンを基本に、ロゴの葉っぱの緑・星の黄色・ピーチを差し色にする。
- 黄色・オレンジの暖かい背景もユーザー指定の配色として使う。トップページの紹介・カードピックアップは既存の黄色・オレンジのチェック柄、機能への入口は淡い黄色を基調にする。
- 新規UI・既存UIの改修前に `docs/design-system.md` を読み、色は `src/app/brand.css` の `--brand-*` 変数を使う。紫・青・鮮やかな赤紫などの独自テーマを装飾のために追加しない。
- 見出し・本文は淡色の背景に濃いココア色を使い、文字と背景のコントラスト比4.5:1以上を確保する。漢字を含む日本語で読みやすさを確認する。
- 配色・フォント・コントラストの調整では、配置や大きさまで一緒に変えない。見出しの台紙・バッジ・帯など、依頼されていない装飾を追加しない。
- 見出し・メニュー名はモッチーポップ、本文・入力欄はZen丸ゴシックに統一する。定義は `src/app/fonts.ts` を共有し、カード効果や対戦中の数値は読みやすさを優先する。
- カードのフルーツやPP、勝敗・警告などの意味を持つ色は、ゲームルールと識別性を優先する。イラスト自体の色は原画を尊重する。

## デプロイ・ストレージ・バックアップ

- インフラを変更する前に、ユーザーが挙げた既存アプリ（例: Misskey）の実際の構成と運用を確認する。アプリ側の文書やHelmの初期値だけで設備・保存先を決めない。
- インフラの管理元は隣接リポジトリ `../home-manifests`。該当するArgo CD Application、StorageClass/PVC、Secretの参照、バックアップ設定と、クラスタ上の稼働状態を照合する。認証情報の値は表示しない。
- この環境の既存バックアップ運用は **VolSync＋rcloneによるS3互換サービスへの転送**。NASは使用していない。PPLALEの転送設定は `../home-manifests/apps/volsync-backup/pplale-room-history.yaml` で管理する。実行時には最新の設定も確認する。
- 古い `nfs-client` StorageClassや停止したNFS Podの存在を、NASが存在する・復旧すべきという根拠にしない。同じIPでもNFSとS3は別サービスとして確認する。
- 永続ディスク、DBの同期複製、バックアップ先への転送はそれぞれ確認する。バックアップ転送が未確認のまま、ローカルへの保存成功だけでバックアップ完了と報告しない。
- 設定と実環境が食い違う場合は、既存運用の管理元と成功実績を調べて原因を特定してから修正する。既存運用を未確認のまま、代替構成を新設しない。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
