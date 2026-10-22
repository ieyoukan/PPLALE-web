# VRChatカードゲーム「ぷぷりえーる」のデッキ構築・ゲームプレイができるwebアプリ
https://pplale.vercel.app/
<img width="1448" height="855" alt="image" src="https://github.com/user-attachments/assets/4e7128e5-89a4-41aa-869d-c545a0651dcb" />
<img width="1548" height="932" alt="image" src="https://github.com/user-attachments/assets/5ae56c03-4e68-4af7-ba82-518b0fc9dd74" />


## ぷぷりえーるとは
VRChatのイベント「[ロリっ子喫茶ぷぷりえ](https://pple.vr2.info/)」のカードゲームで、VRChat上でプレイできます。
幼女デッキとお菓子デッキを使って相手のお貸しポイントを先に無くした方が勝ち！

推しのカードでデッキを構築しよう！


## ゲームプレイもついにwebでできるように!!
<img width="1644" height="982" alt="image" src="https://github.com/user-attachments/assets/a40d6d3d-50be-4f9d-9fa3-485078710b2d" />


# 開発について

ドキュメントの入口は [docsの目次](docs/README.md)。CPUの評価式・重み・探索・学習は [CPU仕様](docs/cpu.md) を参照。

能力説明とイチゴ・ぶどうのFAQは [ルール・裁定集](docs/game-rules.md) を参照。
カード効果の機械向け処理と、提供ルールへの対応状況は [カード効果の実装状況](docs/card-effect-rules.md) を参照。
Next.js / game-core の分離方針、Vercelへの配置、未確定ルールは [対戦ゲームの設計](docs/game-design.md) を参照。
ゲーム本体の独立パッケージは [`packages/game-core`](packages/game-core/README.md) に置く。

対戦エミュレータは `/game/`。いちご・ぶどう・オレンジのカードと通常プレイアブルで、CPU対戦・両側操作・ルーム対戦・Firebaseの保存済みデッキ読み込みができる。`/game/editor/` には新カードの効果を試す盤面も用意している。操作と対応範囲は [盤面エミュレータ](docs/board-emulator.md) を参照。

## 開発環境のセットアップ

このプロジェクトは [mise](https://mise.jdx.dev/) でNode.jsのバージョンを管理している。

```bash
mise install
pnpm install --frozen-lockfile
pnpm run dev
```

miseをシェルへ有効化し、このディレクトリで指定のNode.jsが選ばれている状態で実行する。
パッケージマネージャーは pnpm を使う（`pnpm-lock.yaml` が正）。pnpm workspaces が `packages/game-core` をリポジトリ内でリンクするため、game-core を npm に公開する必要はない。
`mise run install` と `mise run dev` も、それぞれ同じpnpmコマンドを呼び出す補助タスクとして利用できる。
型チェック・Lint・カードデータ検査をまとめて実行する場合は `mise run check` を使う。

## 開発経緯

VRChatのカードゲーム「ぷぷりえーる」は、VRChatのワールド内でデッキを構築する必要があり、保存は各自がデッキデータをメモする必要がありました。これをブラウザ上で構築してユーザーごとに保存できるようにしたいと思い開発を開始しました。

また、2Pickで構築したいという要望や、webアプリがあったらいいなという話があったため、このプロジェクトを進めることになりました。

## 技術
短期間で必要な機能を形にするため、Next.jsを使い、AIも活用しながらハッカソン並みの速度で開発した。
VRChatでユーザーと話し、要望を聞きながら実装を繰り返している。
現在のスタイリングにはPanda CSSを使用し、ユーザーごとのデッキ保存にはFirebaseを利用している。

## カードの追加・画像更新

カード画像はリポジトリのサイズを抑えるため **WebP（幅800px）で管理**している。
画像を追加・更新するときは以下の手順で行う。

1. PNG画像を `public/images/yojo|sweet|playable/` に置く
2. `src/data/*.json` にカードを追加する（`imageUrl` は **`.png` のままでOK**）
3. `pnpm run cards:optimize` を実行 → WebP変換 + JSONの `imageUrl` を `.webp` に自動更新
4. `pnpm run cards:check` で整合性チェック（CIでも自動実行される）

```bash
pnpm run cards:optimize
pnpm run cards:check
```

- `.png` の参照が残ったままだと `cards:check` がエラーになる（変換し忘れ防止）
- 元のPNGは不要になったら削除してよい（git履歴に残っている）

OGP用カードPNG（`public/og-cards/{yojo,sweet,playable}/`）と一覧用WebP（`public/deck-thumbnails/`）はGit管理しない。
`pnpm run build`・`pnpm run dev`・`pnpm run test:deck-images` の前に自動生成する。
手動では `pnpm run cards:generate` を使う。元画像または生成スクリプトの更新時だけ作り直し、OGP用PNGは可逆圧縮する。
`caption.png` と `profile-bg.jpg` は引き続き同梱する。
クリーンな環境でもテスト用ヘルパーの型を解決できるよう、本番ビルドとルームサーバーテストの前にgame-coreも自動でビルドする。

## 環境変数について 
firebaseを使うためには必要です。

`NEXT_PUBLIC_CPU_SERVER_URL`（任意）: CPU サーバーの URL。設定すると「さいきょう」がそのモデルを使い、同意したプレイヤーの対戦記録を送る（[services/cpu-server](services/cpu-server/README.md)）。
