'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, orderBy, limit, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';
import { generateDeckImageDataUrl } from '@/components/deck/DeckImagePreview';
import { getCardCatalog } from '@/data/catalog';
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

interface Deck {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  yojoDeckIds?: string[];
  sweetDeckIds?: string[];
  playableCardId?: string | null;
}

export default function BuildPage() {
  const { locale, t } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
  const router = useRouter();
  const { user } = useAuth();
  const [recentDecks, setRecentDecks] = useState<Deck[]>([]);
  const [deckImages, setDeckImages] = useState<{ [deckId: string]: string }>({});
  const [isCreating, setIsCreating] = useState(false);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setRecentDecks([]);
      return;
    }
    // ログインユーザーのみデッキ取得
    const fetchRecentDecks = async () => {
      try {
        const decksRef = collection(db, 'users', user.uid, 'decks');
        const q = query(
          decksRef,
          orderBy('updatedAt', 'desc'),
          limit(6)
        );
        const querySnapshot = await getDocs(q);
        const decks = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as Deck[];
        setRecentDecks(decks);

        // 画像生成処理
        const images: { [deckId: string]: string } = {};
        await Promise.all(
          decks.map(async (deck) => {
            // カード情報をローカルデータから取得
            const yojoDeck = (deck.yojoDeckIds || [])
              .map((id) => allYojoCards.find(c => c.id === id))
              .filter((c): c is import('@/types/card').CardInfo => Boolean(c));
            const sweetDeck = (deck.sweetDeckIds || [])
              .map((id) => allSweetCards.find(c => c.id === id))
              .filter((c): c is import('@/types/card').CardInfo => Boolean(c));
            const playableCard = deck.playableCardId
              ? allPlayableCards.find(c => c.id === deck.playableCardId) || null
              : null;
            if (yojoDeck.length > 0) {
              try {
                images[deck.id] = await generateDeckImageDataUrl(yojoDeck, sweetDeck, playableCard);
              } catch {
                images[deck.id] = '';
              }
            }
          })
        );
        setDeckImages(images);
      } catch (error) {
        console.error('デッキの取得に失敗しました:', error);
      }
    };
    fetchRecentDecks();
  }, [user, locale, allYojoCards, allSweetCards, allPlayableCards]);

  const topDecks = recentDecks.slice(0, 3);
  const otherDecks = recentDecks.slice(3);

  // メニューポップアップ外クリックで閉じる
  useEffect(() => {
    if (!menuOpenId) return;
    const handleClick = () => {
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [menuOpenId]);

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

  const handleDeleteDeck = async (deckId: string) => {
    try {
      if (user) {
        const deckRef = doc(db, 'users', user.uid, 'decks', deckId);
        await deleteDoc(deckRef);
      } else {
        const localDecks = JSON.parse(localStorage.getItem('localDecks') || '[]');
        const updatedDecks = localDecks.filter((deck: Deck) => deck.id !== deckId);
        localStorage.setItem('localDecks', JSON.stringify(updatedDecks));
      }
      
      setRecentDecks(prevDecks => prevDecks.filter(deck => deck.id !== deckId));
      setDeletingDeckId(null);
    } catch (error) {
      console.error('デッキの削除に失敗しました:', error);
      alert(locale === 'ja' ? 'デッキの削除に失敗しました' : 'Could not delete the deck');
    }
  };

  return (
    <main className={css({ minH: '100vh', px: '8', pt: '6', pb: '8' })}>
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

        {/* 最近作成したデッキセクション（ログインユーザーのみ表示） */}
        {user && (
          <section>
            <h2 className={css({ mb: '4', fontSize: '2xl', fontWeight: 'semibold', color: 'gray.900', _dark: { color: 'gray.100' } })}>{t('最近作成したデッキ')}</h2>
            {/* 直近3つを大きく表示 */}
            <div className={css({
              display: 'grid',
              gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
              md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
              lg: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
              gap: '4',
              mb: '8',
            })}>
              {topDecks
                .filter(deck => deck.name.includes(filter))
                .map((deck) => (
                  <div key={deck.id} className={`group ${css({ position: 'relative' })}`}>
                    <Link
                      href={`/deck/${user?.uid}/${deck.id}`}
                      className={css({
                        display: 'block',
                        rounded: 'lg',
                        borderWidth: '1px',
                        borderColor: 'gray.200',
                        bg: 'white',
                        p: '3',
                        boxShadow: 'xs',
                        transitionProperty: 'box-shadow',
                        transitionDuration: '150ms',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        _hover: { boxShadow: 'lg' },
                        _dark: { borderColor: 'gray.700', bg: 'gray.800' },
                      })}
                    >
                      <div className={css({ aspectRatio: '16/9', position: 'relative', bg: 'orange.200', rounded: 'sm', mb: '3', overflow: 'hidden' })}>
                        {deck.yojoDeckIds && deck.yojoDeckIds.length > 0 && deckImages[deck.id] && (
                          <Image
                            src={deckImages[deck.id]}
                            alt={locale === 'ja' ? `${deck.name}のデッキ画像` : `Deck image for ${deck.name}`}
                            fill
                            className={css({ objectFit: 'cover' })}
                            unoptimized
                          />
                        )}
                      </div>
                      <h3 className={css({ fontWeight: 'medium', color: 'gray.800', _dark: { color: 'gray.100' } })}>{deck.name}</h3>
                      <p className={css({ mt: '1', fontSize: 'sm', color: 'gray.500', _dark: { color: 'gray.400' } })}>
                        {t('最終更新')}: {deck.updatedAt.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US')}
                      </p>
                    </Link>
                    <button
                      onClick={() => setDeletingDeckId(deck.id)}
                      className={css({
                        position: 'absolute',
                        top: '2',
                        right: '2',
                        p: '2',
                        bg: 'red.500',
                        color: 'white',
                        rounded: 'full',
                        opacity: '0',
                        transitionProperty: 'opacity',
                        transitionDuration: '150ms',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        _groupHover: { opacity: '1' },
                      })}
                      aria-label={t('デッキを削除')}
                    >
                      <svg className={css({ w: '4', h: '4' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>
            {/* それ以外を小さくリスト表示 */}
            {otherDecks.length > 0 && (
              <div className={css({ rounded: 'sm', borderWidth: '1px', borderColor: 'gray.200', bg: 'gray.50', p: '4', _dark: { borderColor: 'gray.700', bg: 'gray.800/60' } })}>
                {/* フィルターとソートUIをここに移動 */}
                <div className={css({
                  display: 'flex',
                  flexDirection: 'column',
                  md: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
                  mb: '4',
                  gap: '2',
                })}>
                  <input
                    type="text"
                    placeholder={t('デッキ名でフィルター')}
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className={css({
                      w: 'full',
                      maxW: 'xs',
                      rounded: 'sm',
                      borderWidth: '1px',
                      borderColor: 'gray.300',
                      bg: 'white',
                      p: '2',
                      color: 'gray.900',
                      _dark: { borderColor: 'gray.600', bg: 'gray.800', color: 'gray.100' },
                    })}
                  />
                  {/* ソートUI例: */}
                  {/* <select className="p-2 border rounded main-color">
                    <option value="updatedAt">{locale === 'ja' ? '最終更新順' : 'Last updated'}</option>
                    <option value="name">{t('名前順')}</option>
                  </select> */}
                </div>
                <h3 className={css({ mb: '2', fontSize: 'lg', fontWeight: 'semibold', color: 'gray.900', _dark: { color: 'gray.100' } })}>{t('その他のデッキ')}</h3>
                <ul>
                  {otherDecks
                    .filter(deck => deck.name.includes(filter))
                    .map(deck => (
                      <li key={deck.id} className={`group ${css({
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: '1px',
                        borderColor: 'gray.200',
                        py: '2',
                        _dark: { borderColor: 'gray.700' },
                      })}`}>
                        <Link href={`/deck/${user?.uid}/${deck.id}`} className={css({
                          display: 'flex',
                          minW: '0',
                          flex: '1',
                          alignItems: 'center',
                          rounded: 'sm',
                          px: '2',
                          py: '1',
                          _hover: { bg: 'gray.100' },
                          _dark: { _hover: { bg: 'gray.700/60' } },
                        })}>
                          <span className={css({ truncate: true, fontWeight: 'medium', color: 'gray.800', _dark: { color: 'gray.100' } })}>{deck.name}</span>
                          <span className={css({ ml: '2', fontSize: 'xs', color: 'gray.500', flexShrink: '0' })}>{deck.updatedAt.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US')}</span>
                        </Link>
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === deck.id ? null : deck.id); }}
                          className={css({
                            ml: '2',
                            rounded: 'sm',
                            p: '1',
                            color: 'gray.700',
                            _hover: { bg: 'gray.200' },
                            _dark: { color: 'gray.200', _hover: { bg: 'gray.700' } },
                          })}
                          aria-label={t('メニューを開く')}
                        >
                          {/* 3点縦メニューアイコン */}
                          <svg className={css({ w: '5', h: '5', color: 'gray.600' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.5"/>
                            <circle cx="12" cy="12" r="1.5"/>
                            <circle cx="12" cy="19" r="1.5"/>
                          </svg>
                        </button>
                        {/* メニューポップアップ */}
                        {menuOpenId === deck.id && (
                          <div
                            className={css({
                              position: 'absolute',
                              right: '0',
                              top: '8',
                              zIndex: '10',
                              bg: 'white',
                              borderWidth: '1px',
                              rounded: 'sm',
                              boxShadow: 'md',
                              minW: '120px',
                            })}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={e => { e.stopPropagation(); setDeletingDeckId(deck.id); setMenuOpenId(null); }}
                              className={css({ display: 'block', w: 'full', textAlign: 'left', px: '4', py: '2', _hover: { bg: 'red.100' }, color: 'red.600' })}
                            >
                              {t('削除')}
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(`${window.location.origin}/deck/${user?.uid}/${deck.id}`);
                                setMenuOpenId(null);
                              }}
                              className={css({ display: 'block', w: 'full', textAlign: 'left', px: '4', py: '2', _hover: { bg: 'blue.100' }, color: 'blue.600' })}
                            >
                              {t('共有リンクをコピー')}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* 削除確認モーダル */}
        {deletingDeckId && (
          <div className={css({ position: 'fixed', inset: '0', bg: 'black/50', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '50' })}>
            <div className={css({
              mx: '4',
              w: 'full',
              maxW: 'sm',
              rounded: 'lg',
              bg: 'white',
              p: '6',
              color: 'gray.900',
              boxShadow: 'xl',
              _dark: { bg: 'gray.800', color: 'gray.100' },
            })}>
              <h3 className={css({ mb: '4', fontSize: 'lg', fontWeight: 'bold' })}>{t('デッキの削除')}</h3>
              <p className={css({ mb: '6', fontSize: 'sm', color: 'gray.600', _dark: { color: 'gray.300' } })}>
                {locale === 'ja' ? 'このデッキを削除してもよろしいですか？この操作は取り消せません。' : 'Are you sure you want to delete this deck? This action cannot be undone.'}
              </p>
              <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '4' })}>
                <button
                  onClick={() => setDeletingDeckId(null)}
                  className={css({
                    rounded: 'sm',
                    borderWidth: '1px',
                    borderColor: 'gray.300',
                    px: '4',
                    py: '2',
                    color: 'gray.700',
                    _hover: { bg: 'gray.100' },
                    _dark: { borderColor: 'gray.600', color: 'gray.200', _hover: { bg: 'gray.700' } },
                  })}
                >
                  {t('キャンセル')}
                </button>
                <button
                  onClick={() => handleDeleteDeck(deletingDeckId)}
                  className={css({ px: '4', py: '2', bg: 'red.500', color: 'white', rounded: 'sm', _hover: { bg: 'red.600' } })}
                >
                  {t('削除する')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
