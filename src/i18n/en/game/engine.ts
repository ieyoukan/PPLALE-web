// ゲームエンジン（packages/game-core）とルームサーバー（services/room-server）が作る文（ログ・選択の案内・
// エラー）の英語。そのまま一致する文は `exact`、名前や数字が入る文は `patterns`（上から順に最初に一致したもの）。
// 画面では useI18n().gameText(text) を通して表示する。

export const exact: Record<string, string> = {
};

/** `[japanese pattern, english]`: `$1`… are the captured parts (names and numbers are kept; known Japanese words inside are translated again). */
export const patterns: [RegExp, string][] = [
];
