'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import SavedDeckGrid from '@/components/deck/SavedDeckGrid';
import { useI18n } from '@/i18n/LocaleProvider';
import { nanoid } from 'nanoid';
import { css } from 'styled-system/css';

// デッキ作成の入口。サイト共通の淡い紙面と8pxの角丸で、ホバーは面の色だけを変える（docs/design-system.md）。
const createDeckOptionButtonClass = css({
  position: 'relative',
  rounded: 'var(--brand-control-radius)',
  borderWidth: '2px',
  borderColor: 'var(--brand-pink)',
  bg: 'var(--brand-paper)',
  p: '6',
  textAlign: 'left',
  cursor: 'pointer',
  transitionProperty: 'background-color',
  transitionDuration: '150ms',
  _dark: { borderColor: 'gray.700', bg: 'gray.800' },
  _hover: { bg: 'var(--brand-blush)', _dark: { bg: 'gray.700' } },
  _active: { transform: 'translateY(2px)' },
  _focusVisible: { outline: '3px solid var(--brand-cocoa)', outlineOffset: '3px' },
  _disabled: { opacity: 0.6, cursor: 'wait' },
});

export default function BuildPage() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateDeck = async (type: string, options?: { isTwoCardLimit?: boolean, initialFruits?: string[], initialPlayableVersions?: string[] }) => {
    setIsCreating(true);
    try {
      if (type === '2pick') {
        const queryParams = new URLSearchParams();
        if (options?.isTwoCardLimit) queryParams.set('twoCardLimit', 'true');
        if (options?.initialFruits) queryParams.set('fruits', options.initialFruits.join(','));
        if (options?.initialPlayableVersions) queryParams.set('playableVersions', options.initialPlayableVersions.join(','));
        router.push(`/deck/2pick?${queryParams.toString()}`);
        return;
      }
      
      // 新規作成の場合はデッキIDを生成してから遷移
      if (user) {
        // ログインユーザーの場合、Firebaseに新しいデッキを作成
        const newDeckId = nanoid(8);
        const deckRef = doc(db, 'users', user.uid, 'decks', newDeckId);
        
        await setDoc(deckRef, {
          name: t('無名のデッキ'),
          yojoDeckIds: [],
          sweetDeckIds: [],
          playableCardId: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log('新しいデッキを作成しました:', newDeckId);
        router.push(`/deck/${user.uid}/${newDeckId}?isNew=true`);
      } else {
        // ローカルユーザーの場合
        const deckId = nanoid(8);
        const newDeck = {
          id: deckId,
          name: t('無名のデッキ'),
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'local'
        };
        const localDecks = JSON.parse(localStorage.getItem('localDecks') || '[]');
        localStorage.setItem('localDecks', JSON.stringify([newDeck, ...localDecks]));
        router.push(`/deck/local/${deckId}?isNew=true`);
      }
    } catch (error) {
      console.error('デッキの作成に失敗しました:', error);
      alert(locale === 'ja' ? 'デッキの作成に失敗しました' : 'Could not create the deck');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className={css({ minH: '100vh', px: '4', md: { px: '8' }, pt: '6', pb: '8' })}>
      <div className={css({ maxW: '7xl', mx: 'auto' })}>

        {/* 新しいデッキ作成セクション */}
        <section className={css({ mb: '12' })}>
          <h2 className={css({ mb: '4', fontFamily: 'var(--font-site-title), sans-serif', fontSize: '2xl', fontWeight: 'normal', color: 'var(--brand-cocoa)', _dark: { color: 'gray.100' } })}>{t('新しいデッキを作成')}</h2>
          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, gap: '4' })}>
            <button
              onClick={() => handleCreateDeck('normal')}
              disabled={isCreating}
              className={createDeckOptionButtonClass}
            >
              <div className={css({ display: 'flex', alignItems: 'center', gap: '4' })}>
                <div className={css({ w: '12', h: '12', bg: 'var(--brand-pink)', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' })}>
                  <svg className={css({ w: '6', h: '6', color: 'var(--brand-cocoa-deep)' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className={css({ fontFamily: 'var(--font-site-title), sans-serif', fontSize: 'lg', fontWeight: 'normal', color: 'var(--brand-cocoa)', _dark: { color: 'gray.100' } })}>{t('通常構築')}</h3>
                  <p className={css({ mt: '1', fontSize: 'sm', color: 'var(--brand-cocoa-soft)', _dark: { color: 'gray.400' } })}>{t('新しいデッキを最初から構築します')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleCreateDeck('2pick')}
              disabled={isCreating}
              className={createDeckOptionButtonClass}
            >
              <div className={css({ display: 'flex', alignItems: 'center', gap: '4' })}>
                <div className={css({ w: '12', h: '12', bg: 'var(--brand-sage)', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' })}>
                  <svg className={css({ w: '6', h: '6', color: 'var(--brand-cocoa-deep)' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                </div>
                <div>
                  <h3 className={css({ fontFamily: 'var(--font-site-title), sans-serif', fontSize: 'lg', fontWeight: 'normal', color: 'var(--brand-cocoa)', _dark: { color: 'gray.100' } })}>2pick</h3>
                  <p className={css({ mt: '1', fontSize: 'sm', color: 'var(--brand-cocoa-soft)', _dark: { color: 'gray.400' } })}>{t('2枚選択方式でデッキを構築します')}</p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {user && <SavedDeckGrid key={user.uid} userId={user.uid} />}
      </div>
    </main>
  );
}
