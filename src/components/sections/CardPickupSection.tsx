import { css } from 'styled-system/css';
import CardPickupDeck from './CardPickupDeck';

export default function CardPickupSection() {
  return (
    <section
      aria-labelledby="card-pickup-heading"
      className={css({
        position: 'relative',
        minH: { base: 'screen', md: '110vh' },
        w: 'full',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-start',
        pt: { base: '10', md: '14' },
        pb: { base: '24', md: '32' },
        px: '2',
      })}
    >
      <div
        aria-hidden="true"
        className={css({ position: 'absolute', inset: '0' })}
        style={{
          backgroundColor: 'var(--brand-cream)',
          backgroundImage: 'var(--brand-gingham)',
          backgroundRepeat: 'repeat',
          backgroundSize: '100px 100px',
        }}
      >
      </div>

      <div
        className={css({ position: 'relative', zIndex: '1', w: 'full', maxW: '6xl', mx: 'auto' })}
      >
        <h2
          id="card-pickup-heading"
          className={css({
            position: 'absolute',
            w: '1px',
            h: '1px',
            p: '0',
            m: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            borderWidth: '0',
          })}
        >
          カードピックアップ
        </h2>
        <CardPickupDeck />
      </div>
    </section>
  );
}
