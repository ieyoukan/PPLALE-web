import type { Command, Phase } from '../model.ts';

export interface CommandField { kind: string; optional?: boolean; values?: readonly (number | string)[] }
export interface CommandDefinition<T extends Command['type'] = Command['type']> {
    type: T;
    description: string;
    phases: readonly Phase[];
    fields: Record<string, CommandField>;
    sandbox: boolean;
}
type Fields<T extends Command['type']> = Record<Exclude<keyof Extract<Command, { type: T }>, 'type' | 'actor'>, CommandField>;
const define = <T extends Command['type']>(type: T, phases: readonly Phase[], fields: Fields<T>, description: string, sandbox = false): CommandDefinition<T> =>
    ({ type, phases, fields: { actor: { kind: 'side', values: [0, 1] }, ...fields }, description, sandbox });
const card = { kind: 'card-reference' };
const deck = { kind: 'enum', values: ['yojo', 'sweet'] };

/** Exhaustive: a new engine Command must also declare its enumerable input contract. */
export const commandDefinitions = {
    roll: define('roll', ['dice'], {}, '順番にダイスを振る。同じ目なら振り直す。'),
    initiative: define('initiative', ['initiative'], { order: { kind: 'enum', values: ['first', 'second'] } }, 'ダイスで勝った側が先攻・後攻を選ぶ。'),
    openingDraw: define('openingDraw', ['opening', 'mulligan'], { deck }, '初期手札・交換分を引く山札を選ぶ。'),
    mulligan: define('mulligan', ['mulligan'], { uids: { kind: 'card-reference-list' } }, '交換可能な初期手札の部分集合をまとめて交換する。'),
    keep: define('keep', ['mulligan'], {}, '初期手札を確定する。'),
    play: define('play', ['playing'], { uid: card, slot: { kind: 'integer', optional: true } }, '手札から使う。対象や追加の支払いは後続のchooseで決める。'),
    attack: define('attack', ['playing'], { uid: card, target: { kind: 'enemy-card-or-leader' } }, '場の幼女で攻撃する。leaderは相手のお菓子。'),
    skill: define('skill', ['playing'], { index: { kind: 'integer' } }, '共通・固有・取得済みスキルをindexで使う。反応スキルはエンジンが選択を提示する。'),
    exSkill: define('exSkill', ['playing'], { skill: { kind: 'ex-skill-id' } }, '取得済みの手動Exスキルを使う。'),
    acorn: define('acorn', ['playing'], { mode: { kind: 'enum', values: ['draw', 'pp'] } }, 'どんぐり1個で1枚引くか現在PPを1増やす。'),
    reveal: define('reveal', ['playing'], { uid: card }, '公開可能な手札を公開する。相手ターンでも可能。'),
    choose: define('choose', ['dice', 'initiative', 'opening', 'mulligan', 'playing'], { option: { kind: 'offered-option-id' } }, 'pendingの選択者が提示された候補から1つ選ぶ。'),
    end: define('end', ['playing'], {}, '手札上限・終了時効果を解決してターンを終える。'),
    adjust: define('adjust', ['playing'], { resource: { kind: 'enum', values: ['points', 'pp', 'ppBonus', 'damage'] }, delta: { kind: 'number' }, uid: { ...card, optional: true } }, '盤面テスト用の値変更。通常の合法手には含めない。', true),
    draw: define('draw', ['playing'], { deck }, '盤面テスト用のドロー。通常の合法手には含めない。', true),
} satisfies { [T in Command['type']]: CommandDefinition<T> };

export const listCommandDefinitions = (includeSandbox = false): CommandDefinition[] =>
    JSON.parse(JSON.stringify(Object.values(commandDefinitions).filter(definition => includeSandbox || !definition.sandbox)));
