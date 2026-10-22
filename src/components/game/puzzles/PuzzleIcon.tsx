import styles from './Puzzles.module.css';

const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  undo: 'm9 5-6 6 6 6M3 11h11a6 6 0 0 1 6 6',
  reset: 'M20 4v6h-6m5-1a8 8 0 1 0 1 7',
  play: 'm8 5 11 7-11 7Z',
};

export function PuzzleIcon({ name }: { name: keyof typeof paths }) {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[name]} fill={name === 'play' ? 'currentColor' : 'none'} /></svg>;
}
