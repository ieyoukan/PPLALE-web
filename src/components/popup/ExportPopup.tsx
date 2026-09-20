/**
 * エクスポートポップアップコンポーネント
 * 
 * デッキのエクスポート機能を提供するポップアップ
 * 幼女デッキとお菓子デッキのカードIDを別々に表示・コピーできる
 */

'use client';

import React, { useState } from 'react';
import { CardInfo } from '@/types/card';
import Card from '@/components/card/Card';
import DeckImagePreview from '@/components/deck/DeckImagePreview';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

/**
 * エクスポートポップアップのプロパティ
 */
interface ExportPopupProps {
  /**
   * 幼女デッキのカード配列
   */
  yojoDeck: CardInfo[];
  
  /**
   * お菓子デッキのカード配列
   */
  sweetDeck: CardInfo[]; 

  /**
   * プレイアブルキャラの情報
   */
  playableCard: CardInfo | null; 

  /**
   * ポップアップを閉じる関数
   */
  onClose: () => void;
}

/**
 * エクスポートポップアップコンポーネント
 * 
 * @param props コンポーネントのプロパティ
 * @returns エクスポートポップアップコンポーネント
 */
const ExportPopup: React.FC<ExportPopupProps> = ({ yojoDeck, sweetDeck, playableCard, onClose }) => {
  const { t } = useI18n();
  // 幼女デッキのコピー状態
  const [yojoCopied, setYojoCopied] = useState(false);
  // お菓子デッキのコピー状態
  const [sweetCopied, setSweetCopied] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);

  /**
   * IDから数字のみを抽出する関数
   */
  const extractNumber = (id: string) => {
    return id.replace(/\D/g, '');
  };

  /**
   * 幼女デッキをクリップボードにコピーする
   */
  const handleCopyYojoDeck = () => {
    navigator.clipboard.writeText(yojoDeck.map(card => extractNumber(card.id)).join(','));
    setYojoCopied(true);
    setTimeout(() => setYojoCopied(false), 2000);
  };

  /**
   * お菓子デッキをクリップボードにコピーする
   */
  const handleCopySweetDeck = () => {
    navigator.clipboard.writeText(sweetDeck.map(card => extractNumber(card.id)).join(','));
    setSweetCopied(true);
    setTimeout(() => setSweetCopied(false), 2000);
  };



  return (
    <div
      className={css({
        position: 'fixed',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '50',
      })}
    >
      <div
        className={css({
          w: 'full',
          maxW: 'md',
          rounded: 'lg',
          bg: 'white',
          p: '6',
          color: 'gray.900',
          boxShadow: 'lg',
          _dark: { bg: 'gray.800', color: 'gray.100' },
        })}
      >
        <h3 className={css({ fontSize: 'xl', fontWeight: 'bold', mb: '4' })}>{t('デッキをエクスポート')}</h3>
        <div className={css({ mb: '4' })}>
          <div className={css({ mb: '4' })}>
            <h4 className={css({ fontWeight: 'bold', mb: '2' })}>{t('幼女デッキ')}</h4>
            <div
              className={css({
                maxH: '40',
                overflow: 'auto',
                rounded: 'sm',
                borderWidth: '1px',
                borderColor: 'gray.300',
                bg: 'gray.50',
                p: '3',
                _dark: { borderColor: 'gray.600', bg: 'gray.900' },
              })}
            >
              <pre>{yojoDeck.map(card => extractNumber(card.id)).join(',')}</pre>
            </div>
            <button
              className={css({
                mt: '2',
                rounded: 'md',
                bg: 'blue.600',
                px: '4',
                py: '2',
                fontWeight: 'semibold',
                color: 'white',
                transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
                _hover: { bg: 'blue.700' },
              })}
              onClick={handleCopyYojoDeck}
            >
              {t(yojoCopied ? 'コピーしました！' : '幼女デッキをコピー')}
            </button>
          </div>

          <div className={css({ mb: '4' })}>
            <h4 className={css({ fontWeight: 'bold', mb: '2' })}>{t('お菓子デッキ')}</h4>
            <div
              className={css({
                maxH: '40',
                overflow: 'auto',
                rounded: 'sm',
                borderWidth: '1px',
                borderColor: 'gray.300',
                bg: 'gray.50',
                p: '3',
                _dark: { borderColor: 'gray.600', bg: 'gray.900' },
              })}
            >
              <pre>{sweetDeck.map(card => extractNumber(card.id)).join(',')}</pre>
            </div>
            <button
              className={css({
                mt: '2',
                rounded: 'md',
                bg: 'blue.600',
                px: '4',
                py: '2',
                fontWeight: 'semibold',
                color: 'white',
                transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
                _hover: { bg: 'blue.700' },
              })}
              onClick={handleCopySweetDeck}
            >
              {t(sweetCopied ? 'コピーしました！' : 'お菓子デッキをコピー')}
            </button>
          </div>

            {playableCard?.name && (
            <div className={css({ mb: '4' })}>
            <h4 className={css({ fontWeight: 'bold', mb: '2' })}>{t('プレイアブルキャラ')}</h4>
              <Card
                card={playableCard}
                isSelected={false}
                onClick={() => {}}
                draggable={false}
                showRemoveButton={false}
                />
              </div>
              )}

        </div>
        <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2' })}>
          <button
            className={css({
              rounded: 'md',
              bg: 'blue.600',
              px: '4',
              py: '2',
              fontWeight: 'semibold',
              color: 'white',
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
              _hover: { bg: 'blue.700' },
            })}
            onClick={() => setShowImagePreview(true)}
          >
            {t('デッキの画像を表示')}
          </button>
          <button
            className={css({
              rounded: 'md',
              borderWidth: '1px',
              borderColor: 'gray.300',
              px: '4',
              py: '2',
              color: 'gray.700',
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
              _hover: { bg: 'gray.100' },
              _dark: {
                borderColor: 'gray.600',
                color: 'gray.200',
                _hover: { bg: 'gray.700' },
              },
            })}
            onClick={onClose}
          >
            {t('閉じる')}
          </button>
        </div>
        {showImagePreview && (
          <DeckImagePreview
            yojoDeck={yojoDeck}
            sweetDeck={sweetDeck}
            playableCard={playableCard}
            onClose={() => setShowImagePreview(false)}
            isPopup
          />
        )}
      </div>
    </div>
  );
};

export default ExportPopup;
