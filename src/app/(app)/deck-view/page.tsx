'use client';

import React, { useState, useEffect } from 'react';
import { CardInfo } from '@/types/card';
import { getCardCatalog } from '@/data/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import { generateDeckImageDataUrl } from '@/components/deck/DeckImagePreview';
import Image from 'next/image';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';

/**
 * デッキ表示ページ
 * 幼女デッキとお菓子デッキのコードを入力すると自動で画像を生成
 */
export default function DeckViewPage() {
  const { locale, t } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
  const [yojoCardIds, setYojoCardIds] = useState('');
  const [sweetCardIds, setSweetCardIds] = useState('');
  const [playableCardId, setPlayableCardId] = useState('');
  const [deckImage, setDeckImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateImage = async () => {
      try {
        setError(null);
        setLoading(true);

        const yojoIds = yojoCardIds
          .split(',')
          .map(id => id.trim())
          .filter(id => id !== '')
          .map(id => {
            const num = parseInt(id, 10).toString();
            return `y_${num}`;
          });

        const yojoDeck = yojoIds
          .map(id => allYojoCards.find(card => card.id === id))
          .filter((card): card is CardInfo => card !== undefined);

        const sweetIds = sweetCardIds
          .split(',')
          .map(id => id.trim())
          .filter(id => id !== '')
          .map(id => `s_${parseInt(id.replace(/\D/g, ''), 10)}`);

        const sweetDeck = sweetIds
          .map(id => allSweetCards.find(card => card.id === id))
          .filter((card): card is CardInfo => card !== undefined);

        const playableDigits = playableCardId.trim().replace(/\D/g, '');
        const playableId = playableDigits ? `p_${parseInt(playableDigits, 10)}` : '';
        const playableCard = playableId
          ? allPlayableCards.find(card => card.id === playableId) || null
          : null;

        if (yojoDeck.length > 0 || sweetDeck.length > 0 || playableCard) {
          const imageUrl = await generateDeckImageDataUrl(yojoDeck, sweetDeck, playableCard);
          setDeckImage(imageUrl);
        } else {
          setDeckImage(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : locale === 'ja' ? 'デッキ画像の生成に失敗しました' : 'Could not generate the deck image');
      } finally {
        setLoading(false);
      }
    };

    if (yojoCardIds || sweetCardIds || playableCardId) {
      const timer = setTimeout(() => { generateImage(); }, 500);
      return () => clearTimeout(timer);
    } else {
      setDeckImage(null);
      setLoading(false);
    }
  }, [yojoCardIds, sweetCardIds, playableCardId, allYojoCards, allSweetCards, allPlayableCards, locale]);

  return (
    <div className={`container ${css({ px: '4', pt: '6', pb: '8' })}`}>

      <div className={css({ maxW: '4xl', mx: 'auto' })}>
        <div className={`main-background ${css({ p: '6', rounded: 'lg', mb: '8' })}`}>
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '6' })}>
            <div>
              <label className={`main-color ${css({ display: 'block', fontWeight: 'bold', mb: '2' })}`}>
                {t('幼女デッキ（カンマ区切り）')}
              </label>
              <textarea
                className={css({
                  w: 'full', p: '3', borderWidth: '1px', rounded: 'md',
                  _focus: { boxShadow: '0 0 0 2px #3b82f6', borderColor: 'transparent' },
                })}
                rows={3}
                value={yojoCardIds}
                onChange={(e) => setYojoCardIds(e.target.value)}
                placeholder={locale === 'ja' ? '例: 1,2,3,4,5,6,7,8,9,10' : 'Example: 1,2,3,4,5,6,7,8,9,10'}
              />
              <p className={css({ fontSize: 'sm', color: 'gray.600', mt: '1' })}>
                {locale === 'ja' ? 'カード番号をカンマ区切りで入力してください（最大20枚）' : 'Enter comma-separated card numbers (up to 20 cards)'}
              </p>
            </div>

            <div>
              <label className={`main-color ${css({ display: 'block', fontWeight: 'bold', mb: '2' })}`}>
                {t('お菓子デッキ（カンマ区切り）')}
              </label>
              <textarea
                className={css({
                  w: 'full', p: '3', borderWidth: '1px', rounded: 'md',
                  _focus: { boxShadow: '0 0 0 2px #3b82f6', borderColor: 'transparent' },
                })}
                rows={2}
                value={sweetCardIds}
                onChange={(e) => setSweetCardIds(e.target.value)}
                placeholder={locale === 'ja' ? '例: 1,2,3,4,5,6,7,8,9,10' : 'Example: 1,2,3,4,5,6,7,8,9,10'}
              />
              <p className={css({ fontSize: 'sm', color: 'gray.600', mt: '1' })}>
                {locale === 'ja' ? 'お菓子カードの番号をカンマ区切りで入力してください（最大10枚）' : 'Enter comma-separated sweets card numbers (up to 10 cards)'}
              </p>
            </div>

            <div>
              <label className={`main-color ${css({ display: 'block', fontWeight: 'bold', mb: '2' })}`}>
                {t('プレイアブルカード（任意）')}
              </label>
              <div className={css({
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                sm: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
                md: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
                lg: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' },
                gap: '3',
              })}>
                {allPlayableCards.map((card) => (
                  <div
                    key={card.id}
                    onClick={() => setPlayableCardId(playableCardId === card.id ? '' : card.id)}
                    className={`${css({
                      cursor: 'pointer', rounded: 'lg',
                      transitionProperty: 'border-color', transitionDuration: '300ms',
                      borderWidth: '2px',
                      borderColor: playableCardId === card.id ? '#3b82f6' : '#d1d5db',
                      _hover: { borderColor: playableCardId === card.id ? '#3b82f6' : '#9ca3af' },
                    })}`}
                  >
                    <div className={css({ position: 'relative', aspectRatio: '220/320' })}>
                      <Image
                        src={card.imageUrl} alt={card.name} fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                        className={css({ objectFit: 'cover' })} unoptimized
                      />
                    </div>
                    <div className={css({ p: '2', bg: 'white', textAlign: 'center' })}>
                      <p className={css({ fontSize: 'xs', fontWeight: 'medium', truncate: true })}>{card.name}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className={css({ fontSize: 'sm', color: 'gray.600', mt: '2' })}>
                {locale === 'ja' ? 'カードをクリックして選択してください。もう一度クリックすると選択解除されます。' : 'Select a card by clicking it. Click it again to clear the selection.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className={css({ bg: 'red.100', borderWidth: '1px', borderColor: 'red.400', color: 'red.700', px: '4', py: '3', rounded: 'sm', mb: '4' })}>
            {error}
          </div>
        )}

        {loading && (
          <div className={css({ textAlign: 'center', py: '12' })}>
            <div className={css({ display: 'inline-block', animation: 'spin', rounded: 'full', h: '12', w: '12', borderBottomWidth: '2px', borderColor: 'blue.500' })}></div>
            <p className={css({ mt: '4', color: 'gray.600' })}>{t('デッキ画像を生成中...')}</p>
          </div>
        )}

        {!loading && deckImage && (
          <div className={`main-background ${css({ p: '6', rounded: 'lg' })}`}>
            <h2 className={`main-color ${css({ fontSize: 'xl', fontWeight: 'bold', mb: '4' })}`}>{locale === 'ja' ? '生成されたデッキ画像' : 'Generated deck image'}</h2>
            <div className={css({ mb: '4' })}>
              <Image src={deckImage} alt={t('デッキ画像')} width={1920} height={1080}
                className={css({ w: 'full', h: 'auto', rounded: 'lg', boxShadow: 'lg' })} unoptimized />
            </div>
            <div className={css({ display: 'flex', justifyContent: 'center' })}>
              <a href={deckImage} download="deck.png" className={`${button({ variant: 'primary', size: 'lg' })} ${css({ display: 'inline-block' })}`}>
                {t('画像をダウンロード')}
              </a>
            </div>
          </div>
        )}

        {!loading && !deckImage && !yojoCardIds && !sweetCardIds && !playableCardId && (
          <div className={css({ textAlign: 'center', py: '12', color: 'gray.500' })}>
            <p className={css({ fontSize: 'lg' })}>{t('カードコードを入力すると自動で画像が生成されます')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
