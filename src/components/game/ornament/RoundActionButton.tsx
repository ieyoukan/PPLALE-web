import type { ComponentProps } from 'react';
import styles from './RoundActionButton.module.css';

/** A circular card-style frame with a hard enamel face, for primary match actions. */
export function RoundActionButton({ tone = 'pink', children, className, ...props }: ComponentProps<'button'> & { tone?: 'pink' | 'sage' | 'muted' }) {
  return <button type="button" {...props} className={`${styles.button} ${className ?? ''}`} data-tone={tone}>
    <svg className={styles.rim} viewBox="0 0 180 180" aria-hidden="true" focusable="false">
      <circle cx="90" cy="90" r="86" /><circle cx="90" cy="90" r="76" />
      {[0, 90, 180, 270].map(angle => <g key={angle} transform={`rotate(${angle} 90 90)`}>
        <path d="M72 11Q80 17 90 11Q100 17 108 11M90 5L95 11 90 17 85 11Z" />
        <path d="M72 11Q64 4 59 11Q64 17 72 11M108 11Q116 4 121 11Q116 17 108 11" />
      </g>)}
    </svg>
    <span className={styles.label}>{children}</span>
  </button>;
}
