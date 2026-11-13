// 英語で表示するときだけ見せるルールの要約（docs/game-rules.md の1〜2章）。裁定・FAQの本文は日本語のまま下に続く。
// ルールを変えたときは docs/game-rules.md と合わせて直す。
import type { ReactNode } from 'react';
import styles from './RulesDoc.module.css';

export const RULES_ENGLISH_ID = 'rules-en';

/** Japanese section titles of docs/game-rules.md (without the number) and their English names for the chips. */
export const rulesHeadingEnglish: Record<string, string> = {
  '対戦開始と初期手札': 'Starting a match',
  '自分のターンとその他のルール（説明④・⑤）': 'Your turn',
  '用語と能力': 'Terms and abilities',
  '対象選択のルール': 'Choosing targets',
  '処理順・履歴・能力の保持': 'Order of effects',
  'ぶどうタイプのFAQ': 'Grape FAQ',
  'イチゴタイプのFAQ': 'Strawberry FAQ',
  'ユーザー裁定（FAQにないもの）': 'Other rulings',
};

function Table({ head, rows }: { head: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>{head[0]}</th><th>{head[1]}</th></tr></thead>
        <tbody>{rows.map(([name, rule], index) => <tr key={index}><td>{name}</td><td>{rule}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function RulesEnglish() {
  return (
    <div data-lang="en" lang="en" className={styles.doc} style={{ marginBottom: 40 }}>
      <h3 id={RULES_ENGLISH_ID}>Rules overview</h3>
      <p>
        An English summary of the core rules. Reduce your opponent&apos;s <strong>sweets points</strong> to 0 to win.
        The detailed rules, rulings and FAQ further down this page are in Japanese.
      </p>

      <h4>Starting a match</h4>
      <ol>
        <li>Each player rolls a die. The higher roll chooses whether to go first or second (the starting rolls never tie).</li>
        <li>The first player draws 3 cards and the second player draws 4. Both players draw their opening hands at the same time.</li>
        <li>For every draw, you choose whether to draw from your little girl deck or your sweets deck. This also applies to the draw each turn.</li>
        <li>Check your opening hand and swap the cards you want to change, once for each card you first drew. Cards drawn as replacements cannot be swapped again. In this game you choose all the cards to swap at once.</li>
        <li>The match begins when both players have confirmed their hands.</li>
      </ol>

      <h4>Your turn and other rules</h4>
      <Table head={['Item', 'Rule']} rows={[
        ['Draw', 'At the start of your turn, draw 1 card from either deck. This includes the first player\'s first turn.'],
        ['Actions', 'Play little girls and sweets, use your playable character\'s skills and act with the little girls on your field, in any order, as long as you can pay the cost.'],
        ['PP', '1 PP on your 1st turn, 2 PP on your 2nd: normally the same as your turn number, up to 12. Unused PP stays during your opponent\'s turn and is replaced by the refill at the start of your next turn.'],
        ['Second player\'s 5th turn', 'At the start of this turn, your current PP increases by 2 more. This does not count toward your max PP (without permanent increases, max PP stays 5 and current PP becomes 7). Recovery only goes up to max PP and does not restore this +2.'],
        ['Sweets points 10 and 5', 'The first time your sweets points drop to 10 or less, and the first time they drop to 5 or less, draw 1 card from your sweets deck (mandatory). This does not happen again if they recover and drop again.'],
        ['Hand limit', 'If you have 10 or more cards at the end of your turn, choose cards to remove from the game until you have 9 or fewer. They do not go to the napping place.'],
        ['Empty decks', 'Running out of cards does not make you lose. You cannot draw from an empty deck; if both decks are empty, you skip the draw at the start of your turn.'],
        ['Stalemate', 'If for 3 turns neither player draws a card from a deck, plays a card, acts with a little girl on the field or uses a playable skill (or this becomes certain), the match ends. The player with more sweets points wins; on a tie, the second player wins.'],
        ['Little girls on the field', 'Normally they cannot act on the turn they come into play. From your next turn they can attack and eat sweets. Fast eater and Charge are exceptions.'],
        ['Card changes', 'Card effects may be changed without notice for game balance.'],
      ]} />

      <h4>Sweets points and Hunger State</h4>
      <p>You are in <strong>Hunger State</strong> while your sweets points are <strong>5 or less</strong>. A player whose sweets points reach 0 loses.</p>
      <Table head={['Wording', 'Meaning']} rows={[
        ['Eat', 'A little girl attacking the sweets and card effects that "eat" are resolved separately.'],
        ['Steal X', 'Reduce your opponent\'s sweets points by X and increase yours by X. If your opponent has a little girl with Provocation, the whole effect is cancelled and neither player\'s points change.'],
        ['Reduce', 'Resolved exactly as the card says, not as "eat" or "steal". Provocation does not block it.'],
        ['Recover / change a value', 'Your sweets points cannot go above your maximum.'],
      ]} />

      <h4>Abilities</h4>
      <Table head={['Ability', 'Rule']} rows={[
        ['Defense', 'While your opponent has a little girl with Defense, your little girls without Penetration cannot attack the sweets or little girls without Defense: they must choose a little girl with Defense.'],
        ['Provocation', 'For card effects and skills that choose targets, if the possible targets include an opponent\'s little girl with Provocation, only she can be chosen. It also cancels effects that steal sweets. It does not redirect normal attacks.'],
        ['Fast eater', 'Can eat sweets or attack little girls right after coming into play. It does not ignore Defense.'],
        ['Charge', 'Can attack the opponent\'s little girls right after coming into play, but cannot attack the sweets on that turn.'],
        ['Penetration', 'Ignores Defense: can attack the sweets and little girls without Defense. Whether she can act right after coming into play depends on Fast eater or Charge.'],
        ['1d6', 'Roll one six-sided die (1 to 6).'],
      ]} />
      <p>Defense limits what little girls can attack. Provocation limits effects that choose targets. Effects on all targets or random targets are not redirected by Provocation.</p>

      <h4>Tag (1d6 ≥ X)</h4>
      <p>Roll 1d6 for a little girl with Tag when she is attacked by an opponent&apos;s little girl, or chosen as the target of an opponent&apos;s card effect or playable character skill. <strong>On X or more, she dodges.</strong></p>
      <Table head={['Source', 'When she dodges']} rows={[
        ['Attack by a little girl', 'The whole attack is cancelled. No damage is dealt either way, the attacker counts as having acted, and on-attack effects do not trigger.'],
        ['Card effect or skill', 'Only the part aimed at her is cancelled. Other targets and follow-up effects (such as an extra draw) still happen.'],
        ['Effect choosing several little girls', 'Roll separately for each target with Tag.'],
      ]} />
      <p>A little girl cannot have Tag twice: if she gains it again, she rolls once using the smaller X. Tag does not apply to effects on all targets or random targets.</p>

      <h4>Hide-and-Seek</h4>
      <p>From the turn she comes into play <strong>until the start of your next turn</strong>, she cannot be chosen as the target of attacks by the opponent&apos;s little girls, the opponent&apos;s card effects or the opponent&apos;s playable skills.</p>
      <ul>
        <li>If she attacks, the effect ends.</li>
        <li>It does not protect her from effects on all targets or random targets.</li>
        <li>She keeps the ability after the effect ends. If she comes into play again with it, it works again. It can also be granted again after it ends.</li>
        <li>With Defense: Hide-and-Seek comes first, and Defense takes effect once Hide-and-Seek ends.</li>
        <li>With Provocation: while hiding, targets are not redirected to her, but she still cancels effects that steal sweets.</li>
      </ul>

      <h4>Color Tag (fruit type)</h4>
      <p>A little girl with Color Tag <strong>takes no damage and no effects from the opponent&apos;s little girls</strong> of the fruit type in brackets. It does not cover sweets or playable characters of that type.</p>
    </div>
  );
}
