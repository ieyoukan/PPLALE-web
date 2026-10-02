# @pplale/game-core

Next.js / React / Firebase に依存しない、ぷぷりえーるのローカル対戦エンジン。

- `model.ts`: 状態・Command・暫定ルール・キーワード・スキル定義
- `engine.ts`: デッキ検証、初期化、カード効果、戦闘、状態遷移
- `cpu.ts`: 同じ Command を使う簡易CPU
- `snapshot.ts`: 保存された状態の復元

`newGame(decks, catalog, rules, seed)` で開始し、`applyCommand(state, command, catalog)` で次の状態を得る。エラー時は元の状態と理由を返す。最後の `allowAdjust` 引数を true にすると、同一端末のテスト操作を受け付ける。

Next.js は npm workspace と `transpilePackages` で `src/index.ts` を利用する。独立した JavaScript が必要な場合はルートから `npm run build --workspace=@pplale/game-core` で `dist` に生成する。TS の相対パスはビルド時に `.js` に書き換える。

`data/cardEffects.json` / `cardEffectSchema.ts` は宣言的データ形式の初期試案であり、現在の実行処理の入力ではない。現行の効果は engine に集約している。

裁定と操作は [card-effect-rules.md](../../docs/card-effect-rules.md)、配置と境界は [game-design.md](../../docs/game-design.md)、操作説明は [board-emulator.md](../../docs/board-emulator.md) を参照。
