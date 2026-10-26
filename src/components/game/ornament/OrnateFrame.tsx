// The frame of panels, dialogs and plates in the game, drawn after the frame printed on the cards:
// a thin outer rule and a stronger inner one, vines with a fan of leaves in each corner and a small
// diamond in the middle of the long edges. Corners keep their size; only the straight rules stretch.
// See docs/design-system.md「カード画像・枠・動き」.
import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';
import styles from './OrnateFrame.module.css';

/** A leaf pointing along +x from its stem at the origin. */
const LEAF = 'M0 0C3.6-3.6 9.4-3.4 14 0C9.4 3.4 3.6 3.6 0 0Z';
/** A leaf, a stem's tip pointing at `angle` degrees, `scale` of a full leaf. */
const leaf = (x: number, y: number, angle: number, scale = 1) => <path d={LEAF} transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} />;

/**
 * The top-left corner, 72 units square (the others are this one mirrored). The outer rule runs at
 * 5 units from the edge, the inner rule at 16; the vines and leaves fill the band between them.
 */
function Corner() {
  return <svg className={styles.corner} viewBox="0 0 72 72" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeLinecap="round">
      <path d="M16 72V16h56" strokeWidth="2.8" />
      <path d="M36 5h36M5 36v36" strokeWidth="1.3" />
      {/* Scrolls from the corner along both edges, curling back in on themselves. */}
      <path d="M16 16C16 8.5 23.5 3.6 31 5.2c6 1.3 5.6 8.4.6 8.2-3-.1-3.2-3.6-.8-4" strokeWidth="1.9" />
      <path d="M16 16C8.5 16 3.6 23.5 5.2 31c1.3 6 8.4 5.6 8.2.6-.1-3-3.6-3.2-4-.8" strokeWidth="1.9" />
      {/* Vines running on in the band, as on the cards' edges. */}
      <path d="M38 11c5-4.6 10.4 1.2 16-2.4 3-1.9 5.6-1.4 7.6.4" strokeWidth="1.3" />
      <path d="M11 38c-4.6 5 1.2 10.4-2.4 16-1.9 3-1.4 5.6.4 7.6" strokeWidth="1.3" />
    </g>
    <g fill="currentColor">
      {/* A fan of leaves out of the corner. */}
      {leaf(15, 15, -135)}{leaf(15, 15, -163, .72)}{leaf(15, 15, -107, .72)}
      {leaf(47, 8.6, -38, .55)}{leaf(53, 9.4, 22, .5)}
      {leaf(8.6, 47, -52, .55)}{leaf(9.4, 53, 68, .5)}
      <circle cx="16" cy="16" r="2.3" />
    </g>
  </svg>;
}

/** The middle of a long edge: a diamond on the inner rule with a scroll to each side in the band. */
function Mid() {
  return <svg className={styles.mid} viewBox="0 0 72 26" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M28 16c-5.6 0-7.4-6.4-12.6-5.4-3.8.8-3.4 6 .2 5.6 2-.2 1.8-2.8.2-3" />
      <path d="M44 16c5.6 0 7.4-6.4 12.6-5.4 3.8.8 3.4 6-.2 5.6-2-.2-1.8-2.8-.2-3" />
    </g>
    <path d="M36 8.4 43.6 16 36 23.6 28.4 16Z" fill="currentColor" />
  </svg>;
}

/**
 * The thin frame of buttons, 14 units square in the corner: one fine rule, its corner turned with a
 * little curve, and one small leaf tucked inside it. The cards' frame is too heavy on a button.
 */
function ThinCorner() {
  return <svg className={styles.corner} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3 14V7.5C3 5 5 3 7.5 3H14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d={LEAF} transform="translate(5.2 5.2) rotate(45) scale(.38)" fill="currentColor" />
  </svg>;
}
/** The thin frame's straight rule (6 units across, the rule at 3 like its corners). */
function ThinRule({ side }: { side: 'top' | 'bottom' | 'left' | 'right' }) {
  const across = side === 'top' || side === 'bottom';
  return <svg className={`${styles.rule} ${styles[side]}`} viewBox={across ? '0 0 100 6' : '0 0 6 100'} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {across ? <line x1="0" x2="100" y1="3" y2="3" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      : <line y1="0" y2="100" x1="3" x2="3" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
  </svg>;
}

/** A straight piece of the two rules, stretched along an edge (18 units across, like the corners' band). */
function Rule({ side }: { side: 'top' | 'bottom' | 'left' | 'right' }) {
  const across = side === 'top' || side === 'bottom';
  return <svg className={`${styles.rule} ${styles[side]}`} viewBox={across ? '0 0 100 18' : '0 0 18 100'} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" fill="none">
      {across
        ? <><line x1="0" x2="100" y1="5" y2="5" strokeWidth="1.3" vectorEffect="non-scaling-stroke" /><line x1="0" x2="100" y1="16" y2="16" strokeWidth="2.8" vectorEffect="non-scaling-stroke" /></>
        : <><line y1="0" y2="100" x1="5" x2="5" strokeWidth="1.3" vectorEffect="non-scaling-stroke" /><line y1="0" y2="100" x1="16" x2="16" strokeWidth="2.8" vectorEffect="non-scaling-stroke" /></>}
    </g>
  </svg>;
}

type Props<T extends ElementType> = {
  as?: T;
  /** ink: cocoa lines on a light paper face. cream: cream lines on a dark see-through face. */
  tone?: 'ink' | 'cream';
  /** sm: smaller corners and no middle ornaments, for plates and tiles. line: the thin frame of buttons. */
  size?: 'md' | 'sm' | 'line';
  /** Faint lines: a place that is still empty (a free seat). */
  faint?: boolean;
  /** No face of its own: the frame is drawn on what is already there (the table's mat). */
  bare?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<T>, 'as' | 'children'>;

export function OrnateFrame<T extends ElementType = 'div'>({ as, tone = 'ink', size = 'md', faint, bare, className, children, ...rest }: Props<T>) {
  const Tag = (as ?? 'div') as ElementType;
  return <Tag className={`${styles.frame} ${className ?? ''}`} data-tone={tone} data-size={size} data-faint={faint || undefined} data-bare={bare || undefined} {...rest}>
    <span className={styles.ornament} aria-hidden="true">
      {(['tl', 'tr', 'bl', 'br'] as const).map(at => <span key={at} className={`${styles.at} ${styles[at]}`}>{size === 'line' ? <ThinCorner /> : <Corner />}</span>)}
      {(['top', 'bottom', 'left', 'right'] as const).map(side => size === 'line' ? <ThinRule key={side} side={side} /> : <Rule key={side} side={side} />)}
      {size === 'md' && <><span className={`${styles.midAt} ${styles.midTop}`}><Mid /></span><span className={`${styles.midAt} ${styles.midBottom}`}><Mid /></span></>}
    </span>
    {children}
  </Tag>;
}
