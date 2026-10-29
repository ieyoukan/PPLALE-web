import { Avatar } from './Avatar';
import styles from './PlayerIdentity.module.css';

/** Portrait and public name, with an optional player title. The caller owns navigation and data. */
export function PlayerIdentity({ name, card, title }: { name: string; card?: string; title?: string }) {
  return <span className={styles.identity}>
    <Avatar card={card} size={40} />
    <span className={styles.text}><b data-ui-title>{name}</b>{title && <small>{title}</small>}</span>
  </span>;
}
