/**
 * デッキ確認ポップアップコンポーネント
 * 
 * 2Pick中に現在のデッキ構成を確認するためのポップアップを提供します。
 * 幼女デッキ、お菓子デッキ、プレイアブルカードを一覧表示します。
 * 
 * @packageDocumentation
 */

'use client';

import React from 'react';
import { CardInfo } from '@/types/card';
import Deck from '@/components/deck/Deck';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';

/**
 * デッキ確認ポップアップコンポーネントのProps
 * 
 * @interface
 * @property {CardInfo[]} yojoDeck - 表示する幼女デッキ
 * @property {CardInfo[]} sweetDeck - 表示するお菓子デッキ
 * @property {CardInfo | null} selectedPlayableCard - 表示するプレイアブルカード
 * @property {() => void} onClose - ポップアップを閉じるときのコールバック関数
 */
interface DeckViewPopupProps {
  /** 表示する幼女デッキ */
  yojoDeck: CardInfo[];
  /** 表示するお菓子デッキ */
  sweetDeck: CardInfo[];
  /** 表示するプレイアブルカード */
  selectedPlayableCard: CardInfo | null;
  /** ポップアップを閉じるときのコールバック関数 */
  onClose: () => void;
}

/**
 * デッキ確認ポップアップコンポーネント
 * 
 * @param {DeckViewPopupProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} デッキ確認ポップアップ
 */
const DeckViewPopup: React.FC<DeckViewPopupProps> = ({
  yojoDeck,
  sweetDeck,
  selectedPlayableCard,
  onClose,
}) => {
  const { t } = useI18n();
  return (
    <div className={css({ position: 'fixed', inset: '0', bg: 'black/50', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '50' })}>
      <div className={css({ bg: 'white', p: '4', rounded: 'lg', w: 'full', maxH: '100vh', overflow: 'auto' })}>
        {/* 3つのデッキを同時に表示 */}
        <div className={css({ display: 'flex', flexDirection: 'column', lg: { flexDirection: 'row' }, gap: '4' })}>
          {/* 左側:幼女デッキ */}
          <div className={css({ w: 'full', lg: { w: '1/2' } })}>
            <Deck
              cards={yojoDeck}
              type="yojo"
              readOnly={true}
              showDuplicates={false}
            />
          </div>

          {/* 右側:お菓子デッキとプレイアブルカード */}
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '4', w: 'full', lg: { w: '1/2' } })}>
            <Deck
              cards={sweetDeck}
              type="sweet"
              readOnly={true}
              showDuplicates={false}
            />

            <Deck
              cards={[selectedPlayableCard || null].filter(Boolean) as CardInfo[]}
              type="playable"
              readOnly={true}
              showDuplicates={false}
            />
          </div>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'flex-end' })}>
          <button
            className={button({ variant: 'primary', size: 'md' })}
            onClick={onClose}
          >
            {t('閉じる')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeckViewPopup;
