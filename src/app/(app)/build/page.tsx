'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import SavedDeckGrid from '@/components/deck/SavedDeckGrid';
import { useI18n } from '@/i18n/LocaleProvider';
import { nanoid } from 'nanoid';
import { css } from 'styled-system/css';

const createDeckOptionButtonClass = css({
  position: 'relative',
  overflow: 'hidden',
  rounded: 'lg',
  borderWidth: '1px',
  borderColor: 'gray.200',
  bg: 'white',
  p: '6',
  boxShadow: 'xs',
  transitionProperty: 'box-shadow',
  transitionDuration: '150ms',
  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  _dark: { borderColor: 'gray.700', bg: 'gray.800' },
  // エクスポート/インポートボタンと同じ、中心から広がるリップルhover効果
  _after: {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100%',
    paddingBottom: '100%',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%) scale(0)',
    transition: 'transform 0.4s ease',
    pointerEvents: 'none',
    bg: 'black/8',
  },
  _hover: {
    boxShadow: 'lg',
    _after: { transform: 'translate(-50%, -50%) scale(2.5)' },
  },
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
          <h2 className={css({ mb: '4', fontSize: '2xl', fontWeight: 'semibold', color: 'gray.900', _dark: { color: 'gray.100' } })}>{t('新しいデッキを作成')}</h2>
          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, gap: '4' })}>
            <button
              onClick={() => handleCreateDeck('normal')}
              disabled={isCreating}
              className={createDeckOptionButtonClass}
            >
              <div className={css({ display: 'flex', alignItems: 'center', gap: '4' })}>
                <div className={css({ w: '12', h: '12', bg: 'blue.100', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', _dark: { bg: 'blue.200' } })}>
                  <svg className={css({ w: '6', h: '6', color: 'blue.600', _dark: { color: 'blue.400' } })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className={css({ fontSize: 'lg', fontWeight: 'medium', color: 'gray.800', _dark: { color: 'gray.100' } })}>{t('通常構築')}</h3>
                  <p className={css({ mt: '1', fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.400' } })}>{t('新しいデッキを最初から構築します')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleCreateDeck('2pick')}
              disabled={isCreating}
              className={createDeckOptionButtonClass}
            >
              <div className={css({ display: 'flex', alignItems: 'center', gap: '4' })}>
                <div className={css({ w: '12', h: '12', bg: 'green.100', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', _dark: { bg: 'green.900' } })}>
                  <svg className={css({ w: '6', h: '6', color: 'green.600', _dark: { color: 'green.400' } })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                </div>
                <div>
                  <h3 className={css({ fontSize: 'lg', fontWeight: 'medium', color: 'gray.800', _dark: { color: 'gray.100' } })}>2pick</h3>
                  <p className={css({ mt: '1', fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.400' } })}>{t('2枚選択方式でデッキを構築します')}</p>
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
