import React, { useEffect, useState } from 'react';
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
  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;
  const BLANK_IMAGE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJgAAACgCAYAAABw4pVUAAAAF0lEQVR4nO3BMQEAAAgDoJvc6F9hAAEAAAAAAAAAAADwG4wAAQAA//8DAAAAAElFTkSuQmCC';
  // 幼女デッキ
  const YOJO_CARD_W = 162;
  const YOJO_CARD_H = 262;
  const YOJO_MARGIN_L = 0;
  const YOJO_MARGIN_T = 0;
  const YOJO_GAP = 8;
  // お菓子デッキ
  const SWEET_CARD_W = 205;
  const SWEET_CARD_H = 333;
  const SWEET_MARGIN_R = 0;
  const SWEET_MARGIN_T = 0;
  const SWEET_GAP = 10;
  // プレイアブル
  const PLAYABLE_W = 264;
  const PLAYABLE_H = 393;
  const PLAYABLE_MARGIN_L = 10;
  const PLAYABLE_MARGIN_T = 0;

  // canvas生成
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context取得失敗');
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // ソート済みのデッキを作成
  const sortedYojoDeck = yojoDeck.slice(0, 20).sort((a, b) => {
    const idNumA = Number(a.id.replace(/^[a-z]+_/, ''));
    const idNumB = Number(b.id.replace(/^[a-z]+_/, ''));
    return idNumA - idNumB;
  });
  const sortedSweetDeck = sweetDeck.slice(0, 10).sort((a, b) => {
    const idNumA = Number(a.id.replace(/^[a-z]+_/, ''));
    const idNumB = Number(b.id.replace(/^[a-z]+_/, ''));
    return idNumA - idNumB;
  });

  // 画像を順に読み込んで描画
  const yojoPositions = sortedYojoDeck
    .map((_, i) => ({
      x: YOJO_MARGIN_L + (i % 5) * (YOJO_CARD_W + YOJO_GAP),
      y: YOJO_MARGIN_T + Math.floor(i / 5) * (YOJO_CARD_H + YOJO_GAP),
      w: YOJO_CARD_W,
      h: YOJO_CARD_H,
    }));
  const sweetPositions = sortedSweetDeck
    .map((_, i) => ({
      x: CANVAS_WIDTH - SWEET_MARGIN_R - SWEET_CARD_W * 5 - SWEET_GAP * 4 + (i % 5) * (SWEET_CARD_W + SWEET_GAP),
      y: SWEET_MARGIN_T + Math.floor(i / 5) * (SWEET_CARD_H + SWEET_GAP),
      w: SWEET_CARD_W,
      h: SWEET_CARD_H,
    }));
  const playablePosition = {
    x: YOJO_CARD_W * 5 + YOJO_GAP * 4  + PLAYABLE_MARGIN_L,
    y: CANVAS_HEIGHT - PLAYABLE_MARGIN_T - PLAYABLE_H - SWEET_GAP,
    w: PLAYABLE_W,
    h: PLAYABLE_H,
  };

  // 画像リスト作成
  const allImages: { src: string; x: number; y: number; w: number; h: number }[] = [];
  sortedYojoDeck.forEach((card, i) => {
    const pos = yojoPositions[i];
    allImages.push({ src: card?.imageUrl || BLANK_IMAGE, x: pos.x, y: pos.y, w: pos.w, h: pos.h });
  });
  sortedSweetDeck.forEach((card, i) => {
    const pos = sweetPositions[i];
    allImages.push({ src: card?.imageUrl || BLANK_IMAGE, x: pos.x, y: pos.y, w: pos.w, h: pos.h });
  });
  // プレイアブルカード
  allImages.push({ src: playableCard?.imageUrl || BLANK_IMAGE, x: playablePosition.x, y: playablePosition.y, w: playablePosition.w, h: playablePosition.h });

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
                <Image src={imgUrl} alt={t('デッキ画像')} className={css({ mb: '4', maxW: 'full' })} width={1920} height={1080} unoptimized />
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
              <Image src={imgUrl} alt={t('デッキ画像')} className={css({ mb: '4', maxW: 'full' })} width={1920} height={1080} unoptimized />
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
