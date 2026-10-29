import { Avatar } from './Avatar';
import styles from './PlayerIdentity.module.css';

/** アイコン・公開名・任意の称号の共通表示。データ取得と画面遷移は呼び出し側で管理する。 */
export function PlayerIdentity({ name, card, title }: { name: string; card?: string; title?: string }) {
  return <span className={styles.identity}>
    <Avatar card={card} size={40} />
    <span className={styles.text}><b data-ui-title>{name}</b>{title && <small>{title}</small>}</span>
  </span>;
}
