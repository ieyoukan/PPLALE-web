import styles from './Puzzles.module.css';

const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  undo: 'm9 5-6 6 6 6M3 11h11a6 6 0 0 1 6 6',
  reset: 'M20 4v6h-6m5-1a8 8 0 1 0 1 7',
  play: 'm8 5 11 7-11 7Z',
  fruit: 'M12 7a7 7 0 1 0 0 14 7 7 0 1 0 0-14m0 0c0-2 1-3.5 3-4m-3 4c-1.5-2-4-2.5-5.5-1.5 1.5 1.5 3.5 2 5.5 1.5',
  lock: 'M6 11h12v9H6ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  key: 'M3 15a4 4 0 1 0 8 0 4 4 0 1 0-8 0m7-3 9-9m-3 3 2 2m-5 1 2 2',
};

export function PuzzleIcon({ name }: { name: keyof typeof paths }) {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[name]} fill={name === 'play' ? 'currentColor' : 'none'} /></svg>;
}
