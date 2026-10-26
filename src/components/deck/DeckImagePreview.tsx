import React, { useEffect, useState } from 'react';
import { DECK_IMAGE_WIDTH, DECK_IMAGE_HEIGHT, deckImageLayout } from '@/lib/deckImageLayout';
import { CardInfo } from '@/types/card';
import Image from 'next/image';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const deckImageCache = new Map<string, Promise<string>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src);
  if (cached) return cached;

  const request = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // リスナーを先に設定する。メモリ/HTTPキャッシュから即座に返る画像でも取りこぼさない。
    img.src = src;
  });
  imageCache.set(src, request);
  return request;
}

/**
 * 幼女・お菓子・プレイアブルカードからデッキ画像（dataURL）を生成するユーティリティ関数
 * @param yojoDeck 幼女デッキ配列
 * @param sweetDeck お菓子デッキ配列
 * @param playableCard プレイアブルカード
 * @returns 画像のdataURL（PNG）
 */
export async function generateDeckImageDataUrl(
  yojoDeck: CardInfo[],
  sweetDeck: CardInfo[],
  playableCard: CardInfo | null
): Promise<string> {
  const cacheKey = [...yojoDeck.slice(0, 20), ...sweetDeck.slice(0, 10), playableCard]
    .map(card => card?.imageUrl || '')
    .join('|');
  const cached = deckImageCache.get(cacheKey);
  if (cached) return cached;

  const generation = generateDeckImageDataUrlUncached(yojoDeck, sweetDeck, playableCard);
  deckImageCache.set(cacheKey, generation);
  generation.catch(() => deckImageCache.delete(cacheKey));
  return generation;
}

async function generateDeckImageDataUrlUncached(
  yojoDeck: CardInfo[],
  sweetDeck: CardInfo[],
  playableCard: CardInfo | null
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = DECK_IMAGE_WIDTH;
  canvas.height = DECK_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context取得失敗');
  const cards = new Map([...yojoDeck, ...sweetDeck, ...(playableCard ? [playableCard] : [])].map(card => [card.id, card]));
  const allImages = deckImageLayout({ yojoDeckIds: yojoDeck.map(card => card.id), sweetDeckIds: sweetDeck.map(card => card.id), playableCardId: playableCard?.id ?? null })
    .flatMap(slot => slot.id && cards.get(slot.id) ? [{ src: cards.get(slot.id)!.imageUrl, x: slot.left, y: slot.top, w: slot.width, h: slot.height }] : []);

  // 画像の読み込みをPromiseで待つ
  const loadedImages = await Promise.all(allImages.map(entry => loadImage(entry.src)));

  // 描画
  allImages.forEach(({ x, y, w, h }, index) => {
    const img = loadedImages[index];
    if (img) {
      ctx.drawImage(img, x, y, w, h);
    }
  });
  return canvas.toDataURL('image/png');
}

// 既存のDeckImagePreviewコンポーネント
interface DeckImagePreviewProps {
  yojoDeck: CardInfo[];
  sweetDeck: CardInfo[];
  playableCard: CardInfo | null;
  onClose: () => void;
  isPopup?: boolean; // ポップアップ表示かどうか
}

const DeckImagePreview: React.FC<DeckImagePreviewProps> = ({ yojoDeck, sweetDeck, playableCard, onClose, isPopup = false }) => {
  const { t } = useI18n();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    generateDeckImageDataUrl(yojoDeck, sweetDeck, playableCard)
      .then(url => {
        if (!cancelled) setImgUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImgUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [yojoDeck, sweetDeck, playableCard]);

  return (
    <>
      {isPopup ? (
        <div
          className={css({
            position: 'fixed',
            inset: '0',
            bg: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '50',
            backdropFilter: 'blur(6px)',
            p: '4',
          })}
        >
          <div
            className={css({
              bg: 'var(--colors-card-background)',
              color: 'var(--colors-text-color)',
              p: '6',
              rounded: 'lg',
              boxShadow: 'lg',
              maxW: '5xl',
              maxH: 'calc(100dvh - 2rem)',
              w: 'full',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              overflowY: 'auto',
            })}
          >
            <h3 className={css({ fontSize: 'lg', fontWeight: 'bold', mb: '4' })}>{t('デッキ画像プレビュー')}</h3>
            {loading ? (
              <div className={css({ my: '8' })}>{t('画像生成中...')}</div>
            ) : imgUrl ? (
              <>
                <Image src={imgUrl} alt={t('デッキ画像')} className={css({ mb: '4', maxW: 'full' })} width={DECK_IMAGE_WIDTH} height={DECK_IMAGE_HEIGHT} unoptimized />
                <a href={imgUrl} download="deck.png" className={`${button({ variant: 'primary', size: 'md' })} ${css({ mb: '2' })}`}>{t('画像をダウンロード')}</a>
              </>
            ) : (
              <div className={css({ my: '8', color: 'red.500' })}>{t('画像生成に失敗しました')}</div>
            )}
            <button className={`${button({ variant: 'secondary', size: 'md' })} ${css({ mt: '2' })}`} onClick={onClose}>{t('閉じる')}</button>
          </div>
        </div>
      ) : (
        <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'center' })}>
          {loading ? (
            <div className={css({ my: '8' })}>{t('画像生成中...')}</div>
          ) : imgUrl ? (
            <>
              <Image src={imgUrl} alt={t('デッキ画像')} className={css({ mb: '4', maxW: 'full' })} width={DECK_IMAGE_WIDTH} height={DECK_IMAGE_HEIGHT} unoptimized />
              <a href={imgUrl} download="deck.png" className={`${button({ variant: 'primary', size: 'md' })} ${css({ mb: '2' })}`}>{t('画像をダウンロード')}</a>
            </>
          ) : (
            <div className={css({ my: '8', color: 'red.500' })}>{t('画像生成に失敗しました')}</div>
          )}
        </div>
      )}
    </>
  );
};

export default DeckImagePreview;
