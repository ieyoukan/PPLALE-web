ゲームのランチパッドなどに使う、提供されたグッズ用イラスト。
透過部分の余白を整えてWebPに変換しています。入口の画像は最大720px、縦長の案内役は最大720×1000pxに収め、全身を切らずに表示しています。

| 配置用ファイル | 提供された元ファイル |
| --- | --- |
| friends.webp | closs_illust.png |
| pink-friend.webp | touka_buranchang.png |
| yellow-friend.webp | touka_usamimika.png |
| green-friend.webp | touka_yomi.png |

小型ランチパッドの案内役は、以下の5点からゲーム起動時に1人選びます。`src/components/game/guide/GameGuide.tsx` が選択と画像表示を共用し、起動中はルーム移動やメニュー開閉で選び直しません。メニューを開くと右の縁から大きく全身が現れます。画像が読み込めてから動かし、動きを減らす設定では静止表示します。ルームへの常設・拡大メニューでの表示・セリフはありません。

| 配置用ファイル | 提供された元ファイル |
| --- | --- |
| guide-01.webp | 5e35697cb5bd906c.png |
| guide-02.webp | 996a9da6ccdee7f9.png |
| guide-03.webp | cedbf4ae9bf0b1f5.png |
| guide-06.webp | Iriai.png |
| guide-07.webp | rikusu.png |

## ホームページの入口

提供されたマグカップ用イラストを、透過を保って最大480×640pxのWebPに変換。全身を切らずに表示する。

| 配置用ファイル | 提供された元ファイル |
| --- | --- |
| home-mint.webp | mugcup_.png |
| home-yellow.webp | mugcup_rikusu.png |
| home-pink.webp | mugcupgato_.png |
| home-purple.webp | mugcupsyuo_.png |
| home-rabbit.webp | mugcuptyori_.png |

対戦バナーにはデッキ構築ヘッダーでも使っているローカル画像 `/images/baner.webp` を再利用する。
