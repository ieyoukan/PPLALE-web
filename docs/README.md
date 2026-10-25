# ドキュメントの目次

現行の仕様・操作と、性能改善の設計・過去の計測記録を分けて探すための入口。

必要な文書の見出しを先に検索し、該当する節と根拠の実装を読む。性能の計測JSONや過去の検証記録は、調査に必要な場合だけ参照する。

## ルール・ゲームエンジン

| 文書 | 読むとき |
| --- | --- |
| [ルール・裁定集](game-rules.md) | カードや対戦ルールを判断する。ユーザー裁定の参照先 |
| [カード効果の実装状況](card-effect-rules.md) | ルールと現行実装の対応・差分を調べる |
| [未確定の裁定・気になる点](open-questions.md) | 未確定事項と、その後に確認できた事項を調べる |
| [CPUの判断・評価式・学習](cpu.md) | 重み・探索設定・学習入力を調べ、CPUを改善する |
| [CPU研究](../research/cpu/README.md) | 共通データ・合法手、TS/Python、学習、比較・デッキ探索、グラフ、フィードバック |
| [game-core README](../packages/game-core/README.md) | エンジンの構成・API・カード実装方法を調べる |

## 画面・機能・構成

| 文書 | 内容 |
| --- | --- |
| [デザイン基準](design-system.md) | 配色・フォント・コントラスト |
| [対戦ゲームの設計](game-design.md) | アプリとエンジンの境界、配置、ルーム対戦 |
| [盤面エミュレータ](board-emulator.md) | 対戦・盤面エディタの操作と表示 |
| [対戦履歴・リプレイ](match-history.md) | 保存・認証・DB・バックアップ |
| [プロフィールとフレンド](social.md) | 現行のソーシャル機能 |
| [集まって遊べるルームの設計](social-rooms-design.md) | 未実装の起動時のルーム・公開範囲・席交代・CPU呼び出し・入室ロード・共有URL・共通メニューの計画 |
| [検索表示](seo.md) | メタデータ・検索導線 |
| [検証記録](verification.md) | 2026-10-16の実装照合・テストと未確認事項。最新の実行結果ではない |

サーバーの設定・起動・運用は [room-server](../services/room-server/README.md)、[cpu-server](../services/cpu-server/README.md) のREADMEを参照。

## 性能・計測

性能関係の文書と生の計測JSONは [performance/](performance/) にまとめる。数値は各文書に記載した日付・環境の結果であり、現行本番の値とは限らない。

| 文書 | 対象 |
| --- | --- |
| [ゲーム画面の読み込み](performance/game-performance.md) | 準備画面・初期読み込みの変更と過去の測定 |
| [操作の応答速度改善設計](performance/game-interaction-performance-design.md) | 対戦操作の設計・実装方針 |
| [応答改善の計測記録](performance/game-interaction-performance-results.md) | 実装した変更・比較条件・再計測手順 |
| [ルーム操作速度の自動計測](performance/play-performance.md) | 稼働中の計測区間・集計・保存の仕様 |
| [トップページの初期処理](performance/home-performance.md) | ホームの読み込み改善と計測 |
| [デッキ一覧とOGP画像](performance/deck-list-performance.md) | 一覧・画像生成の処理と性能上の制約 |

## 更新の置き場所

- 現行仕様の変更は対応する文書へ追記・修正する。機能ごとに同じ説明を別ファイルへ複製しない。
- 性能の追加計測は対応する `performance/` の文書へ日付・条件を記載し、JSONも同じ場所に置く。
- 設計案には未実装であることを明記する。計測・検証の過去の成功を、最新状態の確認として扱わない。
- 新しい文書が必要な場合は、この目次に役割を追加する。
