ゲームのランチパッドなどに使う、提供されたグッズ用イラスト。
透過部分の余白を整えてWebPに変換しています。入口の画像は最大720px、縦長の案内役は最大720×1000pxに収め、全身を切らずに表示しています。

| 配置用ファイル | 提供された元ファイル |
| --- | --- |
| rikusu-momoka.webp（りくす・ももか） | closs_illust.png |
| buran.webp（ぶらん） | touka_buranchang.png |
| mika.webp（みか） | touka_usamimika.png |
| yomi.webp（よみ） | touka_yomi.png |

ファイル名はキャラクターの名前のローマ字だけにする（2026-11-07 ユーザー指定。以前の pink-friend / yellow-friend / green-friend、guide-01〜07、home-*、friends から改名）。同じ人の2枚目（マグカップ用のイラスト）は `-mug` を付ける。

小型ランチパッドの案内役は、以下の9人から、ランチパッドを開くたびに前回と違う1人を選びます（2026-11-07 ユーザー指定）。`src/components/game/guide/GameGuide.tsx` の `GUIDES` が名前・ひとこと・画像の正本で、メニューを開くと右の縁から大きく全身が現れ、名前とひとことの吹き出しを少し出します。押すと「ピョコ」と鳴って隠れ、吹き出しも消えて、そのランチパッドを閉じるまで出てきません。画像が読み込めてから動かし、動きを減らす設定では静止表示します。

| 配置用ファイル | キャラクター | ひとこと | 提供された元ファイル |
| --- | --- | --- | --- |
| gato.webp | がと | 何する？いっぱいあるよー！ | 5e35697cb5bd906c.png |
| chori.webp | ちょり | どこいく?どこいく〜? | 996a9da6ccdee7f9.png |
| nao.webp | なお | え..みんなどっか行っちゃった? | cedbf4ae9bf0b1f5.png |
| iriai.webp | いりあい | どこいこうかな! | Iriai.png |
| rikusu.webp | りくす（店長） | なん! | rikusu.png |
| gitty.webp | ぎってぃ | にゃるる、どんぐ...じゃなくて | mugcup_.png |
| shuo.webp | しゅお | Auf der Heide blüht ein kleines Blümelein | mugcupsyuo_.png |
| buran.webp | ぶらん | どこいこうかなーー！！ | touka_buranchang.png |
| mika.webp | みか | みかちゃんだよ！えへへ! | touka_usamimika.png |

## ホームページの入口

提供されたマグカップ用イラストを、透過を保って最大480×640pxのWebPに変換。全身を切らずに表示する。

| 配置用ファイル | 提供された元ファイル |
| --- | --- |
| gitty.webp（ぎってぃ） | mugcup_.png |
| rikusu-mug.webp（りくす） | mugcup_rikusu.png |
| gato-mug.webp（がと） | mugcupgato_.png |
| shuo.webp（しゅお） | mugcupsyuo_.png |
| chori-mug.webp（ちょり） | mugcuptyori_.png |

対戦バナーにはデッキ構築ヘッダーでも使っているローカル画像 `/images/baner.webp` を再利用する。
