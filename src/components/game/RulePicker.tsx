'use client';

// The rules of a match (which cards its decks may use) chosen on tiles, as on the start screen of
// the 2pick deck builder: one tile per fruit and per playable version, a mark on those allowed.
// Used where a match is prepared: against the CPU and when making a room.
import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { fruitNames, fruits, playableNow } from '@pplale/game-core';
import type { Fruit, MatchRules } from '@pplale/game-core';
import styles from './RulePicker.module.css';

/** The fruit's colour and picture, as on the 2pick tiles. */
const fruitArt: Record<Fruit, { tone: string; image: string }> = {
  strawberry: { tone: '#9B4341', image: '/images/fruits/いちご.webp' },
  grape: { tone: '#6E25AB', image: '/images/fruits/ぶどう.webp' },
  melon: { tone: '#40923D', image: '/images/fruits/めろん.webp' },
  orange: { tone: '#E5872C', image: '/images/fruits/おれんじ.webp' },
};

/**
 * One tile. With `onChange` it is a checkbox that covers the whole tile; without, it only shows a
 * state that cannot be changed. `soon`: the game cannot play it yet (準備中).
 */
function Tile({ name, note, image, tone, on, soon, onChange }: {
  name: string; note?: ReactNode; image: string; tone: string; on: boolean; soon?: boolean; onChange?: (on: boolean) => void;
}) {
  const body = <>
    <span className={styles.art} style={{ '--tone': tone } as CSSProperties}>
      <Image src={image} alt="" width={320} height={180} sizes="(max-width: 720px) 46vw, 240px" />
      {on && <span className={styles.mark}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg></span>}
      {soon && <span className={styles.soon}>準備中</span>}
    </span>
    <span className={styles.name}>{name}{note && <small>{note}</small>}</span>
  </>;
  if (!onChange) return <div className={styles.tile} data-on={on || undefined} data-fixed="">{body}</div>;
  return <label className={styles.tile} data-on={on || undefined} data-soon={soon || undefined}>
    <input type="checkbox" className={styles.box} checked={on} disabled={soon} onChange={event => onChange(event.target.checked)} />
    {body}
  </label>;
}

/**
 * `onChange` gets the two fields of `MatchRules`; rules with more (a room's) keep the rest.
 * What `playableNow` does not allow is shown but cannot be chosen.
 */
export function RulePicker({ rules, onChange }: { rules: MatchRules; onChange: (rules: MatchRules) => void }) {
  const { extendedPlayable } = rules;
  // At least one fruit stays chosen: taking the last one away does nothing.
  const toggleFruit = (fruit: Fruit, on: boolean) => {
    const next = fruits.filter(other => other === fruit ? on : rules.fruits.includes(other));
    if (next.length) onChange({ fruits: next, extendedPlayable });
  };
  const waiting = fruits.some(fruit => !playableNow.fruits.includes(fruit)) || !playableNow.extendedPlayable;
  return <div className={styles.picker}>
    <div className={styles.groups}>
      <fieldset className={styles.group}>
        <legend>使えるフルーツ<small>1つ以上</small></legend>
        <div className={`${styles.tiles} ${styles.fruits}`}>{fruits.map(fruit => {
          const playable = playableNow.fruits.includes(fruit);
          return <Tile key={fruit} name={fruitNames[fruit]} {...fruitArt[fruit]} on={playable && rules.fruits.includes(fruit)} soon={!playable} onChange={on => toggleFruit(fruit, on)} />;
        })}</div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend>プレイアブル</legend>
        <div className={`${styles.tiles} ${styles.versions}`}>
          {/* The rules only decide β: a 通常 playable may always lead a deck. */}
          <Tile name="通常" note="いつも使える" image="/images/versions/通常.webp" tone="#a88667" on />
          <Tile name="β" note="拡張プレイアブル" image="/images/versions/β.webp" tone="#9B4341" on={playableNow.extendedPlayable && extendedPlayable} soon={!playableNow.extendedPlayable}
            onChange={on => onChange({ fruits: rules.fruits, extendedPlayable: on })} />
        </div>
      </fieldset>
    </div>
    {waiting && <p className={styles.note}>「準備中」のカードは、まだ対戦で動かせないため選べません。対応したものから選べるようになります。</p>}
  </div>;
}
