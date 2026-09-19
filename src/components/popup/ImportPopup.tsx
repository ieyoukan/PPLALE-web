/**
 * インポートポップアップコンポーネント
 * 
 * デッキのインポート機能を提供するポップアップ
 * 幼女デッキとお菓子デッキのカードIDを別々に入力できる
 */

'use client';

import React, { useState } from 'react';
import { CardInfo } from '@/types/card';
import { getCardCatalog } from '@/data/catalog';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

interface ImportedDeck {
  yojoDeck: CardInfo[];
  sweetDeck: CardInfo[];
  playableCard: CardInfo | null;
}

/**
 * インポートポップアップのプロパティ
 */
interface ImportPopupProps {
  /**
   * デッキをインポートする関数
   * @param deck インポートするデッキの情報
   */
  onImport: (deck: ImportedDeck) => void;
  
  /**
   * ポップアップを閉じる関数
   */
  onClose: () => void;
}

/**
 * インポートポップアップコンポーネント
 * 
 * @param props コンポーネントのプロパティ
 * @returns インポートポップアップコンポーネント
 */
const ImportPopup: React.FC<ImportPopupProps> = ({ onImport, onClose }) => {
  const { locale, t } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
  // 幼女デッキのカードID
  const [yojoCardIds, setYojoCardIds] = useState('');
  // お菓子デッキのカードID
  const [sweetCardIds, setSweetCardIds] = useState('');
  // プレイアブルカードのID
  const [playableCardId, setPlayableCardId] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * デッキをインポートする
   */
  const handleImport = () => {
    try {
      setError(null);

      // 幼女デッキのカードIDを取得
      const yojoIds = yojoCardIds
        .split(',')
        .map(id => id.trim())
        .filter(id => id !== '')
        .map(id => {
          // 数値部分を取得して先頭の0を削除
          const num = parseInt(id, 10).toString();
          return `y_${num}`;
        });

      // 幼女デッキのカードを取得
      const newYojoDeck = yojoIds
        .map(id => {
          const card = allYojoCards.find(card => card.id === id);
          if (!card) {
            console.log(`カードが見つかりません: ${id}`);
          }
          return card;
        })
        .filter((card): card is CardInfo => card !== undefined);

      // お菓子デッキのカードIDを取得
      // Note: card IDs in data are like "s_0", "s_1", ..., "s_10", so do NOT pad with leading zeros.
      const sweetIds = sweetCardIds
        .split(',')
        .map(id => id.trim())
        .filter(id => id !== '')
        .map(id => {
          // 正しく数値部分を抽出して先頭の0を除去（例: "06" -> "6"、"s_06" -> "6"）
          const digits = id.replace(/\D/g, '');
          if (digits === '') return id; // 数字が取れない場合はそのまま（後で見つからなければ除外される）
          const num = parseInt(digits, 10).toString();
          return `s_${num}`;
        });

      // お菓子デッキのカードを取得
      const newSweetDeck = sweetIds
        .map(id => allSweetCards.find(card => card.id === id))
        .filter((card): card is CardInfo => card !== undefined);

      // プレイアブルカードのIDを取得
      const playableDigits = playableCardId.trim().replace(/\D/g, '');
      const playableId = playableDigits ? `p_${parseInt(playableDigits, 10)}` : '';
      const newPlayableCard = playableId
        ? allPlayableCards.find(card => card.id === playableId) || null
        : null;

      // デッキを更新
      onImport({
        yojoDeck: newYojoDeck,
        sweetDeck: newSweetDeck,
        playableCard: newPlayableCard
      });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : locale === 'ja' ? 'デッキのインポートに失敗しました' : 'Could not import the deck');
    }
  };

  /**
   * ポップアップを閉じる
   */
  const handleClose = () => {
    setYojoCardIds('');
    setSweetCardIds('');
    setPlayableCardId('');
    setError(null);
    onClose();
  };

  return (
    <div
      className={css({
        position: 'fixed',
        inset: '0',
        bg: 'black/50',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '50',
      })}
    >
      <div
        className={css({
          w: 'full',
          maxW: 'lg',
          rounded: 'lg',
          bg: 'white',
          p: '6',
          color: 'gray.900',
          boxShadow: 'xl',
          _dark: { bg: 'gray.800', color: 'gray.100' },
        })}
      >
        <h2 className={css({ fontSize: 'xl', fontWeight: 'bold', mb: '4' })}>{t('デッキをインポート')}</h2>
        {error && (
          <div className={css({ mb: '4', p: '2', bg: 'red.100', color: 'red.700', rounded: 'sm' })}>
            {error}
          </div>
        )}
        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4' })}>
          <div>
            <h4 className={css({ fontWeight: 'bold', mb: '2' })}>{t('幼女デッキ')}</h4>
            <textarea
              className={css({
                w: 'full',
                rounded: 'md',
                borderWidth: '1px',
                borderColor: 'gray.300',
                bg: 'white',
                p: '2',
                color: 'gray.900',
                _dark: { borderColor: 'gray.600', bg: 'gray.900', color: 'gray.100' },
              })}
              rows={3}
              value={yojoCardIds}
              onChange={(e) => setYojoCardIds(e.target.value)}
              placeholder={locale === 'ja' ? '1,2,3,4,5 (任意)' : '1,2,3,4,5 (optional)'}
            />
            <p className={css({ fontSize: 'sm', color: 'gray.600', mt: '1' })}>
              {locale === 'ja'
                ? 'カンマ区切りで数字を入力してください（例：1,2,3,4,5）。先頭の0は不要です。'
                : 'Enter comma-separated numbers (for example: 1,2,3,4,5). Leading zeroes are not required.'}
            </p>
          </div>

          <div>
            <h4 className={css({ fontWeight: 'bold', mb: '2' })}>{t('お菓子デッキ')}</h4>
            <textarea
              className={css({
                w: 'full',
                rounded: 'md',
                borderWidth: '1px',
                borderColor: 'gray.300',
                bg: 'white',
                p: '2',
                color: 'gray.900',
                _dark: { borderColor: 'gray.600', bg: 'gray.900', color: 'gray.100' },
              })}
              rows={3}
              value={sweetCardIds}
              onChange={(e) => setSweetCardIds(e.target.value)}
              placeholder={locale === 'ja' ? '6,7,8,9,10 (任意)' : '6,7,8,9,10 (optional)'}
            />
          </div>

          <div>
            <h4 className={css({ fontWeight: 'bold', mb: '2' })}>{t('プレイアブルカード')}</h4>
            <input
              type="text"
              className={css({
                w: 'full',
                rounded: 'md',
                borderWidth: '1px',
                borderColor: 'gray.300',
                bg: 'white',
                p: '2',
                color: 'gray.900',
                _dark: { borderColor: 'gray.600', bg: 'gray.900', color: 'gray.100' },
              })}
              value={playableCardId}
              onChange={(e) => setPlayableCardId(e.target.value)}
              placeholder={locale === 'ja' ? '2（任意）' : '2 (optional)'}
            />
          </div>
        </div>
        <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '4', mt: '6' })}>
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
            onClick={handleClose}
          >
            {t('キャンセル')}
          </button>
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
            onClick={handleImport}
          >
            {t('インポート')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPopup;
