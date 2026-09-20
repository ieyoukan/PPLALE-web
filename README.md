# VRChatにあるカードゲーム「ぷぷりえーる」のデッキ構築などができるwebアプリ
https://pplale.vercel.app/
![image](https://github.com/user-attachments/assets/f30d43ca-e1b6-463f-ac5a-f3d9b23f0922)

![image](https://github.com/user-attachments/assets/51f9bd05-2cd3-4e7f-9c74-3763ed0fa326)

## ぷぷりえーるとは
VRChatのイベント「ロリっ子喫茶ぷぷりえ」のカードゲーム！幼女カードとお菓子カードがある。推しのカードでデッキを構築しよう！

## 通常構築
カードをドラッグ＆ドロップして構築する
![image](https://github.com/user-attachments/assets/1af293a3-7bbc-4b70-b80d-4d6e29962c78)



## 2pick構築について
シャドウバースの2pickのようにある程度ランダムにデッキを構築する。
```
フルーツ、プレイアブルカードのバージョン選択
↓
最後に選択するプレイアブルカード3枚の確認
↓
二枚ずつ選んデッキ構築
↓
プレイアブルカード選択
```


# 開発について

## 開発環境のセットアップ

このプロジェクトは [mise](https://mise.jdx.dev/) でNode.jsのバージョンを管理している。

```bash
mise install
mise run install
mise run dev
```

miseをシェルへ有効化していれば、従来どおり `npm run dev` も利用できる。
型チェック・Lint・カードデータ検査をまとめて実行する場合は `mise run check` を使う。

## 開発経緯

VRChatのカードゲーム「ぷぷりえーる」は、VRChatのワールド内でデッキを構築する必要があり、保存は各自がデッキデータをメモする必要がありました。これをブラウザ上で構築してユーザーごとに保存できるようにしたいと思い開発を開始しました。

また、2Pickで構築したいという要望や、webアプリがあったらいいなという話があったため、このプロジェクトを進めることになりました。

## 技術
なるべく高速に開発（開発->実装まで数週間）するためNext.js+Tailwwind+firebaseの構成。
ハッカソン並みの速度で開発した。
VRをプレイしながら話を聞きながら実装する超高速アジャイル開発を繰り返して作るため、AIが書きやすいNext.js+Tailwwindを選んだ。

## カードの追加・画像更新

カード画像はリポジトリのサイズを抑えるため **WebP（幅800px）で管理**している。
画像を追加・更新するときは以下の手順で行う。

1. PNG画像を `public/images/yojo|sweet|playable/` に置く
2. `src/data/*.json` にカードを追加する（`imageUrl` は **`.png` のままでOK**）
3. `npm run cards:optimize` を実行 → WebP変換 + JSONの `imageUrl` を `.webp` に自動更新
4. `npm run cards:check` で整合性チェック（CIでも自動実行される）

```bash
npm run cards:optimize
npm run cards:check
```

- `.png` の参照が残ったままだと `cards:check` がエラーになる（変換し忘れ防止）
- 元のPNGは不要になったら削除してよい（git履歴に残っている）

## 環境変数について 
firebaseを使うためには必要です。
