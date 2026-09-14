/**
 * 2Pick結果表示コンポーネント
 * 
 * 2pickが完了した後の結果画面を表示し、デッキの保存やエクスポート、共有などの機能を提供します。
 * 
 * @packageDocumentation
 */

'use client';

import React, { useEffect, useState } from 'react';
import { CardInfo } from '@/types/card';
import ShareButtons from '@/components/ui/ShareButtons';
import { User } from 'firebase/auth';
import DeckImagePreview from '@/components/deck/DeckImagePreview';
import JungaryCopy from '@/components/icons/JungaryCopy';
import Link from 'next/link';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';

/**
 * 2Pick結果表示コンポーネントのProps
 * 
 * @interface
 * @property {CardInfo[]} yojoDeck - 構築された幼女デッキ
 * @property {CardInfo[]} sweetDeck - 構築されたお菓子デッキ
 * @property {CardInfo | null} playableCard - 選択されたプレイアブルカード
 * @property {User | null} user - 現在のユーザー情報
 * @property {() => Promise<void>} onSave - デッキを保存ボタンがクリックされたときのコールバック関数
 */
interface TwoPickResultProps {
  /** 構築された幼女デッキ */
  yojoDeck: CardInfo[];
  /** 構築されたお菓子デッキ */
  sweetDeck: CardInfo[];
  /** 選択されたプレイアブルカード */
  playableCard: CardInfo | null;
  /** 現在のユーザー情報 */
  user: User | null;
  /** デッキを保存ボタンがクリックされたときのコールバック関数 */
  onSave: () => Promise<void>;
  /** もう一度プレイボタンがクリックされたときのコールバック関数 */
  onRestart: () => void;
}

/**
 * 2Pick結果表示コンポーネント
 * 
 * @param {TwoPickResultProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} 2Pick結果表示画面
 */
function DeckExportBlock({
  title,
  deck,
  copied,
  onCopy,
}: {
  title: string;
  deck: CardInfo[];
  copied: boolean;
  onCopy: () => void;
}) {
  const { locale, t } = useI18n();
  const text = deck.map((card) => card.id.replace(/\D/g, '')).join(',');
  const copyHint = locale === 'ja' ? 'クリックでコピー' : 'Click to copy';
  return (
    <section aria-label={title} className={css({ mb: '4' })}>
      <h3 className={css({ fontWeight: 'bold', mb: '2' })}>{title}</h3>
      <div
        role="button"
        tabIndex={0}
        title={copied ? t('コピーしました！') : copyHint}
        aria-label={locale === 'ja' ? `${title}をコピー` : `Copy ${title}`}
        onClick={onCopy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCopy();
          }
        }}
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '2',
          bg: 'gray.100',
          color: 'gray.800',
          p: '3',
          rounded: 'sm',
          borderWidth: '1px',
          borderColor: 'gray.300',
          overflow: 'auto',
          maxH: '40',
          mb: '2',
          cursor: 'pointer',
          _dark: { bg: 'gray.800', color: 'gray.100', borderColor: 'gray.600' },
        })}
      >
        <pre className={css({ fontSize: 'sm', flex: '1', textAlign: 'left' })}>{text}</pre>
        <JungaryCopy aria-hidden="true" width={20} height={20} className={css({ display: 'inline-block', flexShrink: '0' })} />
      </div>
      <p aria-live="polite" className={css({ fontSize: 'sm', minH: '5', color: copied ? 'green.600' : 'gray.500', _dark: { color: copied ? 'green.300' : 'gray.400' } })}>
        {copied ? t('コピーしました！') : copyHint}
      </p>
    </section>
  );
}

const TwoPickResult: React.FC<TwoPickResultProps> = ({
  yojoDeck,
  sweetDeck,
  playableCard,
  user,
  onSave,
  onRestart,
}) => {
  const { locale, t } = useI18n();
  const [yojoCopied, setYojoCopied] = useState(false);
  const [sweetCopied, setSweetCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  const copyDeck = async (deck: CardInfo[], done: (v: boolean) => void) => {
    await navigator.clipboard.writeText(deck.map((card) => card.id.replace(/\D/g, '')).join(','));
    done(true);
    setTimeout(() => done(false), 2000);
  };

  return (
    <div className={css({ textAlign: 'center', position: 'relative' })}>
      <div className={css({ position: 'absolute', top: '0', right: '20' })}>
        <ShareButtons
          share_url={shareUrl}
          share_text={locale === 'ja' ? '2pickでデッキを作成しました！\n#お菓子争奪戦争ぷぷりえーる' : 'I built a PPLALE deck with 2Pick!\n#PPLALE'}
          isLocal={true}
          yojoDeck={yojoDeck}
          sweetDeck={sweetDeck}
          playableCard={playableCard}
        />
      </div>
      <header>
        <h2 className={css({ fontSize: '2xl', fontWeight: 'bold', mb: '4' })}>{t('デッキ構築結果')}</h2>
        <p className={css({ mb: '4' })}>{t('構築したデッキをシェアしよう')}</p>
      </header>

      <section aria-label={t('デッキ画像プレビュー')} className={css({ w: '1/2', mx: 'auto', mb: '4' })}>
        <DeckImagePreview
          yojoDeck={yojoDeck}
          sweetDeck={sweetDeck}
          playableCard={playableCard}
          onClose={() => {}}
          isPopup={false}
        />
      </section>

      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10', mb: '6' })}>
        <DeckExportBlock
          title={t('幼女デッキ')}
          deck={yojoDeck}
          copied={yojoCopied}
          onCopy={() => copyDeck(yojoDeck, setYojoCopied)}
        />
        <DeckExportBlock
          title={t('お菓子デッキ')}
          deck={sweetDeck}
          copied={sweetCopied}
          onCopy={() => copyDeck(sweetDeck, setSweetCopied)}
        />
      </div>

      <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4', mb: '4', mt: '10' })}>
        {user ? (
          <button
            className={button({ variant: 'primary', size: 'md' })}
            onClick={onSave}
          >
            {t('デッキを保存')}
          </button>
        ) : (
          <button
            className={button({ variant: 'primary', size: 'md' })}
            onClick={onSave}
          >
            {t('ログインしてデッキを保存')}
          </button>
        )}
        <div className={css({ display: 'flex', alignItems: 'center', gap: '4' })}>
        <button
          className={button({ variant: 'secondary', size: 'md' })}
          onClick={onRestart}
        >
          {t('もう一度プレイ')}
        </button>
        <Link href="/" className={button({ variant: 'secondary', size: 'md' })}>
          {t('ホームに戻る')}
        </Link>
        </div>
      </div>
    </div>
  );
};

export default TwoPickResult;
