/**
 * デッキカード選択コンポーネント
 * 
 * 2pick中のメインのカード選択画面を提供します。
 * 左右に2つのカード選択グループを表示し、どちらかを選ぶ形式です。
 * 
 * @packageDocumentation
 */

'use client';

import React from 'react';
import { CardInfo, CardType } from '@/types/card';
import CardSelection from './CardSelection';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';

/**
 * デッキカード選択コンポーネントのProps
 * 
 * @interface
 * @property {CardInfo[]} currentChoices - 現在表示する選択肢のカード配列 (4枚)
 * @property {(card1: CardInfo, card2: CardInfo) => void} onSelect - カードが選択されたときのコールバック関数
 * @property {number} round - 現在のラウンド番号
 * @property {CardType} currentPhase - 現在の選択フェーズ ('yojo' または 'sweet')
 * @property {() => void} onShowDeckClick - デッキ確認ボタンがクリックされたときのコールバック関数
 */
interface DeckCardSelectionProps {
  /** 現在表示する選択肢のカード配列 (4枚) */
  currentChoices: CardInfo[];
  /** カードが選択されたときのコールバック関数 */
  onSelect: (card1: CardInfo, card2: CardInfo) => void;
  /** 現在のラウンド番号 */
  round: number;
  /** 現在の選択フェーズ ('yojo' または 'sweet') */
  currentPhase: CardType;
  /** デッキ確認ボタンがクリックされたときのコールバック関数 */
  onShowDeckClick: () => void;
  /** 幼女カードのラウンド総数 */
  maxYojoRound?: number;
  /** お菓子カードのラウンド総数 */
  maxSweetRound?: number;
}

/**
 * デッキカード選択コンポーネント
 * 
 * @param {CardInfo[]} currentChoices - 現在表示する選択肢のカード配列 (4枚)
 * @param {(card1: CardInfo, card2: CardInfo) => void} onSelect - カードが選択されたときのコールバック関数
 * @param {number} round - 現在のラウンド番号
 * @param {CardType} currentPhase - 現在の選択フェーズ ('yojo' または 'sweet')
 * @param {() => void} onShowDeckClick - デッキ確認ボタンがクリックされたときのコールバック関数
 * @param {number} maxYojoRound - 幼女カードのラウンド総数
 * @param {number} maxSweetRound - お菓子カードのラウンド総数
 * @returns {JSX.Element} カード選択画面
 */
const DeckCardSelection: React.FC<DeckCardSelectionProps> = ({
  currentChoices,
  onSelect,
  round,
  currentPhase,
  onShowDeckClick,
  maxYojoRound = 10,
  maxSweetRound = 5,
}) => {
  const { locale, t, cardTypeLabel } = useI18n();

  if (currentChoices.length < 4) {
    return <div className={css({ textAlign: 'center', py: '8' })}>{locale === 'ja' ? 'カードを読み込み中...' : 'Loading cards...'}</div>;
  }

  const maxRound = currentPhase === 'yojo' ? maxYojoRound : maxSweetRound;

  return (
    <div className={css({ mt: '4', display: 'flex', flexDirection: 'column', alignItems: 'center' })}>
      <h2 className={css({ fontSize: 'xl', fontWeight: 'bold', mb: '4', textAlign: 'center' })}>
        {round} / {maxRound}: {locale === 'ja' ? `${cardTypeLabel(currentPhase)}カードを選択してください` : `Choose ${cardTypeLabel(currentPhase).toLowerCase()} cards`}
      </h2>
      <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
        {/* 左側のカード選択 */}
        <CardSelection
          cards={[
            { ...currentChoices[0], isFaceUp: true },
            { ...currentChoices[1], isFaceUp: true }
          ]}
          onSelect={() => onSelect(currentChoices[0], currentChoices[1])}
        />

        {/* デッキ確認ボタン */}
        <div className={css({ display: 'flex', justifyContent: 'center' })}>
          <button className={button({ variant: 'secondary', size: 'lg' })} onClick={onShowDeckClick}>
            {t('デッキを確認')}
          </button>
        </div>

        {/* 右側のカード選択 */}
        <CardSelection
          cards={[
            { ...currentChoices[2], isFaceUp: true },
            { ...currentChoices[3], isFaceUp: true }
          ]}
          onSelect={() => onSelect(currentChoices[2], currentChoices[3])}
        />
      </div>
    </div>
  );
};

export default DeckCardSelection;
