import type { ReactNode } from 'react';
import styles from './ScreenSubtitle.module.css';

/** Secondary copy below a screen title. Keep plain body text, left alignment and optional counts. */
export function ScreenSubtitle({ children, suffix }: { children: ReactNode; suffix?: ReactNode }) {
  return <p className={styles.subtitle}>{children}{suffix !== undefined && <small>{suffix}</small>}</p>;
}
