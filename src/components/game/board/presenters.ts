// How each kind of change is shown on the board (演出). The engine lists what a command changed
// (`changesBetween` in @pplale/game-core); every kind must have an entry here, which TypeScript
// enforces, so a new kind of change cannot go unpresented. An entry that shows nothing says which
// part of the board already shows it.
import type { Change, ChangeKind, GameState, Side, Zone } from '@pplale/game-core';
import type { DrawFlight } from '../BoardPieces';
import { keywordNames } from '../labels';
import type { Mode } from './useGameSession';

export type Rect = { x: number; y: number; width: number; height: number };
/** Elements a presenter can point at. */
export type Spot = { unit: string } | { hand: string } | { pile: [Side, Zone] } | { leader: Side } | { pp: Side };
/** A short label over a card or counter (+1/+1, 突撃, +3 …). */
export type Pop = { id: number; text: string; tone: 'buff' | 'debuff' | 'heal' | 'info'; x: number; y: number };
/** Damage just taken, shown large over the unit or the sweet points. */
export type Hit = { id: number; amount: number; x: number; y: number; /** A unit's attack (a scuffle cloud) or an effect (a flash). */ kind: 'attack' | 'effect' };

export interface Scene {
  before: GameState;
  after: GameState;
  view: Side;
  mode: Mode;
  /** The command was an attack (its damage is shown as a scuffle). */
  byAttack: boolean;
  /** Where a spot was just before the command, or where it is now. */
  rect(spot: Spot, when: 'before' | 'after'): Rect | undefined;
}
export interface Presentation {
  flights: DrawFlight[];
  hits: Hit[];
  pops: Pop[];
  blocks: { uid: string; what: 'damage' | 'destroy'; rect: Rect }[];
  roll: Extract<Change, { kind: 'roll' }> | null;
}

/** A destroyed (or moved) unit stays put while its damage shows, then travels. */
export const LEAVE_FIELD_DELAY = 450;

type Presenter<K extends ChangeKind> = (change: Extract<Change, { kind: K }>, scene: Scene, out: Output) => void;
interface Output extends Presentation {
  pop(spot: Spot, text: string, tone: Pop['tone']): void;
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
const isVisible = (place: { side: Side; zone: Zone } | null, state: GameState, uid: string, scene: Scene) => {
  if (!place) return false;
  if (place.zone === 'yojo' || place.zone === 'sweet') return false;
  if (place.zone === 'hand') return place.side === scene.view || scene.mode === 'watch' || !!state.cards[uid]?.revealed;
  return true;
};
/** The far side's field and piles are drawn upside down; hands are upright. */
const spinOf = (place: { side: Side; zone: Zone } | null, scene: Scene) => place && place.side !== scene.view && place.zone !== 'hand' ? 180 : 0;
const spotOf = (place: { side: Side; zone: Zone }, uid: string): Spot =>
  place.zone === 'field' ? { unit: uid } : place.zone === 'hand' ? { hand: uid } : { pile: [place.side, place.zone] };
const onField = (state: GameState, uid: string) => state.players.some(p => p.field.includes(uid));
const inHand = (state: GameState, uid: string) => state.players.some(p => p.hand.includes(uid));

export const presenters: { [K in ChangeKind]: Presenter<K> } = {
  move(change, scene, out) {
    const { uid, cardId, from, to } = change;
    // Played from hand onto the field: the board places it (and announces the opponent's card).
    if (from?.zone === 'hand' && to?.zone === 'field') return;
    // Created by an effect: a token appears on the field by itself; one added to a hand is labelled.
    if (!from) {
      if (to?.zone === 'hand') out.pop({ hand: uid }, '手札に追加', 'info');
      return;
    }
    const start = scene.rect(spotOf(from, uid), 'before');
    if (!to) {
      if (start) out.pop(from.zone === 'field' ? { unit: uid } : spotOf(from, uid), 'ゲームから除外', 'info');
      return;
    }
    const end = scene.rect(spotOf(to, uid), 'after');
    if (!start || !end) return;
    const shownBefore = isVisible(from, scene.before, uid, scene), shownAfter = isVisible(to, scene.after, uid, scene);
    out.flights.push({
      uid, cardId, from: start, to: end, toZone: to.zone,
      look: shownBefore && shownAfter ? 'up' : shownAfter ? 'reveal' : shownBefore ? 'hide' : 'down',
      spin: [spinOf(from, scene), spinOf(to, scene)],
      delay: from.zone === 'field' ? LEAVE_FIELD_DELAY : 0,
    });
  },
  damage(change, scene, out) {
    const rect = scene.rect({ unit: change.uid }, 'after') ?? scene.rect({ unit: change.uid }, 'before');
    if (rect) out.hits.push({ id: ++ids, amount: change.amount, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, kind: scene.byAttack ? 'attack' : 'effect' });
  },
  stats(change, scene, out) {
    if (!onField(scene.after, change.uid)) return;
    out.pop({ unit: change.uid }, `${signed(change.attack)}/${signed(change.hp)}`, change.attack < 0 || change.hp < 0 ? 'debuff' : 'buff');
  },
  keywords(change, scene, out) {
    if (onField(scene.after, change.uid) && change.added.length) out.pop({ unit: change.uid }, change.added.map(k => keywordNames[k]).join('・'), 'info');
  },
  // The hand card's cost marble animates by itself (GameCard).
  cost: () => {},
  reveal(change, scene, out) {
    if (change.revealed && inHand(scene.after, change.uid)) out.pop({ hand: change.uid }, '公開', 'info');
  },
  unitShield(change, scene, out) {
    if (change.on && onField(scene.after, change.uid)) out.pop({ unit: change.uid }, 'バリア', 'info');
  },
  link(change, scene, out) {
    if (onField(scene.after, change.uid)) out.pop({ unit: change.uid }, 'くっつき', 'info');
  },
  points(change, scene, out) {
    const rect = scene.rect({ leader: change.side }, 'after');
    if (!rect) return;
    if (change.amount < 0) out.hits.push({ id: ++ids, amount: -change.amount, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, kind: scene.byAttack ? 'attack' : 'effect' });
    else out.pop({ leader: change.side }, `+${change.amount}`, 'heal');
  },
  maxPoints(change, _scene, out) {
    out.pop({ leader: change.side }, `最大${signed(change.amount)}`, 'heal');
  },
  pp(change, _scene, out) {
    // Spending is the player's own action, and the refill is shown by the turn announcement.
    if (change.amount > 0 && !change.turnStart) out.pop({ pp: change.side }, `+${change.amount} PP`, 'heal');
  },
  maxPp(change, _scene, out) {
    out.pop({ pp: change.side }, `最大PP${signed(change.amount)}`, 'heal');
  },
  ppDebt(change, _scene, out) {
    if (change.amount > 0) out.pop({ pp: change.side }, `次のターン PP−${change.amount}`, 'debuff');
  },
  sweetShield(change, _scene, out) {
    if (change.on) out.pop({ leader: change.side }, 'パンケーキ保護', 'info');
  },
  sweetBoost(change, scene, out) {
    if (change.amount > 0) out.pop({ leader: change.side }, `次のお菓子 ×${scene.after.players[change.side].sweetBoost + 1}`, 'buff');
  },
  skillUses(change, _scene, out) {
    // Using a skill is announced (and counted in the skill panel); only a restored use is labelled.
    if (change.amount > 0) out.pop({ leader: change.side }, `スキル回数${signed(change.amount)}`, 'heal');
  },
  roll(change, _scene, out) {
    out.roll = change;
  },
  blocked(change, scene, out) {
    const rect = scene.rect({ unit: change.uid }, 'after') ?? scene.rect({ unit: change.uid }, 'before');
    if (rect && !out.blocks.some(b => b.uid === change.uid)) out.blocks.push({ uid: change.uid, what: change.what, rect });
  },
};

let ids = 0;
/** Turns one command's changes into what the board shows. */
export function present(changes: Change[], scene: Scene): Presentation {
  const stacked = new Map<string, number>();
  const out: Output = {
    flights: [], hits: [], pops: [], blocks: [], roll: null,
    pop(spot, text, tone) {
      const rect = scene.rect(spot, 'after') ?? scene.rect(spot, 'before');
      if (!rect) return;
      // Several labels on one spot stack upwards instead of covering each other.
      const key = JSON.stringify(spot), index = stacked.get(key) ?? 0;
      stacked.set(key, index + 1);
      out.pops.push({ id: ++ids, text, tone, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 - index * 36 });
    },
  };
  for (const change of changes) (presenters[change.kind] as Presenter<typeof change.kind>)(change as never, scene, out);
  return out;
}
