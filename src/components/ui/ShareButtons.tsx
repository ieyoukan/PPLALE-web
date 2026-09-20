/**
 * @file ShareButtons.tsx
 * @description SNS共有ボタンコンポーネント
 */

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { CardInfo } from '@/types/card';
import DeckImagePreview from '@/components/deck/DeckImagePreview';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

interface ShareButtonsProps {
  share_url: string;
  share_text: string;
  isLocal?: boolean;
  yojoDeck?: CardInfo[];
  sweetDeck?: CardInfo[];
  playableCard?: CardInfo | null;
}

/**
 * SNS共有ボタンコンポーネント
 * クリック時にリンクコピーとTwitterシェアの選択肢を横並びアイコンで表示します。
 * @param {ShareButtonsProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} SNS共有ボタンコンポーネント
 */
const ShareButtons: React.FC<ShareButtonsProps> = ({ 
  share_url, 
  share_text, 
  isLocal = false, 
  yojoDeck = [], 
  sweetDeck = [], 
  playableCard = null 
}) => {
  const { locale, t } = useI18n();
  const [show_options, set_show_options] = useState(false);
  const [copy_success, set_copy_success] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const share_button_ref = useRef<HTMLDivElement>(null);

  // ローカルデッキの場合の共有URLを生成
  const getLocalShareUrl = () => {
    if (!isLocal) return share_url;

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams();

    // 幼女デッキのIDをカンマ区切りで追加
    if (yojoDeck.length > 0) {
      params.append('yojo', yojoDeck.map(card => card.id).join(','));
    }

    // お菓子デッキのIDをカンマ区切りで追加
    if (sweetDeck.length > 0) {
      params.append('sweet', sweetDeck.map(card => card.id).join(','));
    }

    // プレイアブルカードのIDを追加
    if (playableCard) {
      params.append('playable', playableCard.id);
    }

    return `${baseUrl}/deck/local/local?${params.toString()}`;
  };

  const shareUrl = isLocal ? getLocalShareUrl() : share_url;
  const encoded_url = encodeURIComponent(shareUrl);
  const encoded_text = encodeURIComponent(share_text);
  const twitter_url = `https://twitter.com/intent/tweet?url=${encoded_url}&text=${encoded_text}`;

  // 画像のURLを直接指定
  const ShareIcon = '/images/share.png';
  const LinkIcon = '/images/link.png';
  const TwitterIcon = '/images/twitter.png';
  const ImageIcon = '/images/image.svg';

  // 外部クリックで選択肢を閉じる
  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (share_button_ref.current && !share_button_ref.current.contains(event.target as Node)) {
        set_show_options(false);
      }
    };
    document.addEventListener('mousedown', handle_click_outside);
    return () => {
      document.removeEventListener('mousedown', handle_click_outside);
    };
  }, [share_button_ref]);

  // リンクをクリップボードにコピー
  const handle_copy_link = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      set_copy_success(true);
      set_show_options(false);
      setTimeout(() => set_copy_success(false), 2000);
    } catch (err) {
      console.error('リンクのコピーに失敗しました:', err);
      alert(locale === 'ja' ? 'リンクのコピーに失敗しました。' : 'Could not copy the link.');
      set_show_options(false);
    }
  };

  return (
    <div className={css({ position: 'relative' })} ref={share_button_ref}>
      {/* シェアボタン */}
      <button
        onClick={() => set_show_options(!show_options)}
        className={css({
          display: 'flex',
          h: '8',
          w: '8',
          alignItems: 'center',
          justifyContent: 'center',
          rounded: 'full',
          color: 'gray.800',
          transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          _hover: { bg: 'gray.100' },
          _dark: { color: 'gray.100', _hover: { bg: 'gray.800' } },
        })}
        aria-label={t('シェア')}
        title={t('シェア')}
      >
        <Image
          src={ShareIcon}
          alt={t('シェアアイコン')}
          width={40}
          height={40}
        />
      </button>

      {/* コピー成功メッセージ */}
      {copy_success && (
        <span className={css({ ml: '2', color: 'green.600', fontSize: 'sm' })}>{t('コピーしました！')}</span>
      )}

      {/* シェアの選択肢（横並びアイコン） */}
      {show_options && (
        <div
          className={css({
            position: 'absolute',
            right: '0',
            zIndex: '10',
            mt: '2',
            display: 'flex',
            w: 'auto',
            gap: '2',
            rounded: 'sm',
            borderWidth: '1px',
            borderColor: 'gray.200',
            bg: 'white',
            p: '2',
            boxShadow: 'lg',
            _dark: { borderColor: 'gray.700', bg: 'gray.800' },
          })}
        >
          {/* リンクコピーボタン */}
          <button
            onClick={handle_copy_link}
            className={css({
              display: 'flex',
              h: '10',
              w: '10',
              alignItems: 'center',
              justifyContent: 'center',
              rounded: 'full',
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
              _hover: { bg: 'gray.100' },
              _dark: { _hover: { bg: 'gray.700' } },
            })}
            aria-label={t('リンクをコピー')}
            title={t('リンクをコピー')}
          >
            <Image
              src={LinkIcon}
              alt={t('リンクアイコン')}
              width={50}
              height={50}
            />
          </button>
          {/* Twitterシェアボタン */}
          <button
            onClick={() => {
              window.open(twitter_url, '_blank', 'noopener,noreferrer');
              set_show_options(false);
            }}
            className={css({
              display: 'flex',
              h: '10',
              w: '10',
              alignItems: 'center',
              justifyContent: 'center',
              rounded: 'full',
              bg: 'sky.500',
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
              _hover: { bg: 'sky.600' },
            })}
            aria-label={t('Twitterでシェア')}
            title={t('Twitterでシェア')}
          >
            <Image
              src={TwitterIcon}
              alt={t('Twitterアイコン')}
              width={50}
              height={50}
            />
          </button>
          {/* 画像共有ボタン */}
          <button
            onClick={() => {
              setShowImagePreview(true);
              set_show_options(false);
            }}
            className={css({
              display: 'flex',
              h: '10',
              w: '10',
              alignItems: 'center',
              justifyContent: 'center',
              rounded: 'full',
              transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
              _hover: { bg: 'gray.100' },
              _dark: { _hover: { bg: 'gray.700' } },
            })}
            aria-label={t('デッキの画像を表示')}
            title={t('デッキの画像を表示')}
          >
            <Image
              src={ImageIcon}
              alt={t('画像アイコン')}
              width={50}
              height={50}
            />
          </button>
        </div>
      )}

      {/* デッキ画像プレビュー */}
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
  );
};

export default ShareButtons;
