/**
 * プレイアブルカード最終選択コンポーネント
 * 
 * 2pickの最後にプレイアブルカードを選択する画面を提供します。
 * カードを選ぶと詳細表示され、確定することができます。
 * 
 * @packageDocumentation
 */

'use client';

import React, { useState, useEffect } from 'react';
import { CardInfo } from '@/types/card';
import Card from '@/components/card/Card';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';

/**
 * プレイアブルカード最終選択コンポーネントのProps
 * 
 * @interface
 * @property {CardInfo[]} playableChoices - 表示するプレイアブルカードの選択肢
 * @property {CardInfo | null} selectedPlayableCard - 選択されたプレイアブルカード
 * @property {(card: CardInfo) => void} onCardClick - カードがクリックされたときのコールバック関数
 * @property {boolean} isCardDisappearing - カードが消えるアニメーション中かどうか
 * @property {() => void} onConfirm - 選択確定ボタンがクリックされたときのコールバック関数
 * @property {() => void} onBack - 戻るボタンがクリックされたときのコールバック関数
 */
interface PlayableCardFinalSelectionProps {
  /** 表示するプレイアブルカードの選択肢 */
  playableChoices: CardInfo[];
  /** 選択されたプレイアブルカード */
  selectedPlayableCard: CardInfo | null;
  /** カードがクリックされたときのコールバック関数 */
  onCardClick: (card: CardInfo) => void;
  /** カードが消えるアニメーション中かどうか */
  isCardDisappearing: boolean;
  /** 選択確定ボタンがクリックされたときのコールバック関数 */
  onConfirm: () => void;
  /** 戻るボタンがクリックされたときのコールバック関数 */
  onBack: () => void;
  /** デッキ確認ボタンがクリックされたときのコールバック関数 */
  onCheckDeck: () => void;
}

/**
 * プレイアブルカード最終選択コンポーネント
 * 
 * @param {PlayableCardFinalSelectionProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} プレイアブルカード最終選択画面
 */
const PlayableCardFinalSelection: React.FC<PlayableCardFinalSelectionProps> = ({
  playableChoices,
  selectedPlayableCard,
  onCardClick,
  isCardDisappearing,
  onConfirm,
  onBack,
  onCheckDeck,
}) => {
  const { t } = useI18n();
  // カードの表示状態管理
  const [cardsFaceUp, setCardsFaceUp] = useState<boolean[]>([]);

  // 読み込んだ時にカードを表向きにする(0.5秒後に表向きにする)
  useEffect(() => {
      // 初期表示時はすべて裏向き
      setCardsFaceUp(new Array(playableChoices.length).fill(false));

      // 少し遅れてすべて表向きにする
      const timer = setTimeout(() => {
        setCardsFaceUp(new Array(playableChoices.length).fill(true));
      }, 500); // 0.5秒後に表向きにする

      return () => clearTimeout(timer);
  }, [playableChoices]);

  return (
    <div className={css({ mt: '4', display: 'flex', flexDirection: 'column', alignItems: 'center' })}>
      <h2 className={css({ fontSize: 'xl', fontWeight: 'bold', mb: '4', textAlign: 'center' })}>{t('プレイアブルカードを選択してください')}</h2>
      {!selectedPlayableCard && (
        <div>
          <div className={css({ display: 'flex', gap: '4' })}>
            {playableChoices.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => onCardClick(card)}
                isFaceUp={cardsFaceUp[index] ?? false}
                sizes={{
                  base: { width: 140, height: 210 },
                  sm: { width: 200, height: 300 },
                  md: { width: 280, height: 420 },
                  lg: { width: 300, height: 450 }
                }}
                canShowDetail={false}
              />
            ))}
          </div>
          {/* デッキ確認ボタン */}
          <div className={css({ display: 'flex', alignItems: 'center', gap: '4', mt: '4', justifyContent: 'center' })}>
          <button
            className={button({ variant: 'secondary', size: 'md' })}
            onClick={onCheckDeck}
          >
            {t('デッキを確認')}
          </button>
          </div>
        </div>
      )}

      {/* スライド表示されたカード */}
      {selectedPlayableCard && (
        <div className={css({ position: 'relative', w: 'full', maxW: '4xl', mx: 'auto', p: '4' })}>
          <div className={`transform-slide ${isCardDisappearing ? 'animate-disappear' : ''} ${css({
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6', w: 'full',
          })}`}>
            <div className={css({ w: 'full', lg: { w: '1/2' }, display: 'flex', justifyContent: 'center' })}>
              <Card
                card={selectedPlayableCard}
                sizes={{
                  base: { width: 200, height: 300 },
                  sm: { width: 250, height: 375 },
                  md: { width: 300, height: 450 },
                  lg: { width: 500, height: 750 }
                }}
                canShowDetail={false}
                isFaceUp={true}
              />
            </div>
          </div>
          <button
            className={`${button({ variant: 'special', size: 'lg' })} ${css({ position: 'absolute', bottom: '40', right: '0' })}`}
            onClick={onConfirm}
          >
            {t('選択する')}
          </button>
          <button
            className={`${button({ variant: 'secondary', size: 'md' })} ${css({ position: 'absolute', top: '0', left: '0' })}`}
            onClick={onBack}
          >
            ◀︎{t('戻る')}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayableCardFinalSelection;
