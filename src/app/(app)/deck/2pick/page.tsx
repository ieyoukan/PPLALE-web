/**
 * 2Pickモードのメインページコンポーネント
 * 
 * カードの選択からデッキ構築までの全プロセスを管理し、各フェーズに応じた
 * コンポーネントを表示します。
 * 
 * @packageDocumentation
 */

'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { css } from 'styled-system/css';
import { CardInfo, CardType, CardVersion, FruitType } from '@/types/card';
import { getCardCatalog } from '@/data/catalog';
import { useSettings } from "@/app/SettingsProvider";
import { useAuth } from '@/lib/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// 分割したコンポーネントをインポート
import FruitVersionSelection from './components/FruitVersionSelection';
import PlayableCardPreview from './components/PlayableCardPreview';
import DeckCardSelection from './components/DeckCardSelection';
import PlayableCardFinalSelection from './components/PlayableCardFinalSelection';
import TwoPickResult from './components/TwoPickResult';
import DeckViewPopup from './components/DeckViewPopup';
import { useI18n } from '@/i18n/LocaleProvider';

const legacyFruitCodes: Record<string, FruitType> = {
  strawberry: 'strawberry', grape: 'grape', melon: 'melon', orange: 'orange',
  'いちご': 'strawberry', 'ぶどう': 'grape', 'めろん': 'melon', 'おれんじ': 'orange',
};
const legacyVersionCodes: Record<string, CardVersion> = {
  normal: 'normal', beta: 'beta', '通常': 'normal', 'β': 'beta',
};

/**
 * 2Pickモードのメインページコンポーネント
 * 
 * @returns {JSX.Element} 2Pickページ
 */
function TwoPickContent() {
  const { locale, t } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTwoCardLimit: defaultIsTwoCardLimit } = useSettings();
  const isTwoCardLimitParam = searchParams.get('twoCardLimit');
  const isTwoCardLimit = isTwoCardLimitParam !== null
    ? isTwoCardLimitParam === 'true'
    : defaultIsTwoCardLimit;
  const initialFruits = (searchParams.get('fruits')?.split(',') || ['strawberry'])
    .map(value => legacyFruitCodes[value])
    .filter((value): value is FruitType => Boolean(value));
  const initialPlayableVersions = (searchParams.get('playableVersions')?.split(',') || ['normal'])
    .map(value => legacyVersionCodes[value])
    .filter((value): value is CardVersion => Boolean(value));
  
  // 幼女カード、お菓子カード、プレイアブルカード
  const [yojoCards] = useState<CardInfo[]>(allYojoCards);
  const [sweetCards] = useState<CardInfo[]>(allSweetCards);
  const [playableCards] = useState<CardInfo[]>(allPlayableCards);
  
  // 現在の選択フェーズ（幼女かお菓子か）
  const [currentPhase, setCurrentPhase] = useState<CardType>('yojo');
  // 現在表示されている選択肢
  const [currentChoices, setCurrentChoices] = useState<CardInfo[]>([]);
  // 幼女デッキ
  const [yojoDeck, setYojoDeck] = useState<CardInfo[]>([]);
  // お菓子デッキ
  const [sweetDeck, setSweetDeck] = useState<CardInfo[]>([]);
  
  const [isShowDeck, setIsShowDeck] = useState(false); // デッキ確認ポップアップの表示状態
  const [round, setRound] = useState(1); // 現在のラウンド

  const { control, handleSubmit, watch } = useForm<{ fruits: FruitType[]; playableVersions: CardVersion[] }>({
    defaultValues: {
      fruits: initialFruits.length > 0 ? initialFruits : ['strawberry'],
      playableVersions: initialPlayableVersions.length > 0 ? initialPlayableVersions : ['normal'],
    },
  });

  const selectedFruits = watch('fruits');
  const selectedPlayableVersions = watch('playableVersions');
  const [selectedPlayableCard, setSelectedPlayableCard] = useState<CardInfo | null>(null);
  const [isCardDisappearing, setIsCardDisappearing] = useState(false);

  const [selectionPhase, setSelectionPhase] = useState<'fruitSelection' | 'playablePreview' | 'CardSelection' | 'playableSelection' | 'end'>('fruitSelection');

  const [playableChoices, setPlayableChoices] = useState<CardInfo[]>([]);

  // 選択肢を更新する関数
  const updateChoices = useCallback(() => {
    const availableCards =
      currentPhase === 'yojo'
        ? yojoCards.filter(card => selectedFruits.includes(card.fruit))
        : sweetCards.filter(card => selectedFruits.includes(card.fruit));

    // 2枚制限が有効な場合、すでに2枚選択されているカードを除外
    const filteredCards = isTwoCardLimit
      ? availableCards.filter(card => {
          const cardCount = currentPhase === 'yojo'
            ? yojoDeck.filter(c => c.id === card.id).length
            : sweetDeck.filter(c => c.id === card.id).length;
          return cardCount < 2;
        })
      : availableCards;

    // 動物さんソーダタイプのカードが1枚しか追加できないように制限
    const filteredSweetCards = currentPhase === 'sweet'
      ? filteredCards.filter(card => {
          if (card.sweetType === 'animal_soda') {
            const existingAnimalSodas = new Set(sweetDeck
              .filter(c => c.sweetType === 'animal_soda')
              .map(c => c.id));
            return !existingAnimalSodas.has(card.id);
          }
          return true;
        })
      : filteredCards;

    const shuffled = [...filteredSweetCards].sort(() => Math.random() - 0.5);
    setCurrentChoices(shuffled.slice(0, 4));
  }, [yojoCards, sweetCards, currentPhase, selectedFruits, isTwoCardLimit, yojoDeck, sweetDeck]);

  // プレイアブルカード選択肢を更新する関数
  const updatePlayableChoices = useCallback(() => {
    const filteredPlayableCards = playableCards.filter(card =>
      card.version && selectedPlayableVersions.includes(card.version)
    );
    const shuffled = [...filteredPlayableCards].sort(() => Math.random() - 0.5);
    setPlayableChoices(shuffled.slice(0, 3));
  }, [playableCards, selectedPlayableVersions]);

  // ラウンドが変わったときに選択肢を更新
  useEffect(() => {
    if (selectionPhase === 'CardSelection') {
      updateChoices();
    }
  }, [currentPhase, updateChoices, selectionPhase]);

  // デッキ確認を消して集中させる場所
  useEffect(() => {
    if (selectionPhase === 'playableSelection' || selectionPhase === 'playablePreview' || selectedPlayableCard) {
      setIsShowDeck(false); // デッキ確認ポップアップを非表示
    }
  }, [selectionPhase, selectedPlayableCard]);

  useEffect(() => {
    localStorage.setItem('yojoDeck', JSON.stringify(yojoDeck));
    localStorage.setItem('sweetDeck', JSON.stringify(sweetDeck));
    localStorage.setItem('selectedPlayableCard', JSON.stringify(selectedPlayableCard));
  }, [yojoDeck, sweetDeck, selectedPlayableCard]);

  // カードが選択されたときの処理
  const handleCardSelect = useCallback((card1: CardInfo, card2: CardInfo) => {
    if (currentPhase === 'yojo') {
      setYojoDeck(prevYojoDeck => {
        if (prevYojoDeck.length >= 20) return prevYojoDeck;
        const newDeck = [...prevYojoDeck, card1, card2].sort((a, b) => parseInt(a.id) - parseInt(b.id));
        localStorage.setItem('yojoDeck', JSON.stringify(newDeck));
        return newDeck;
      });
    } else {
      setSweetDeck(prevSweetDeck => {
        if (prevSweetDeck.length >= 10) return prevSweetDeck;
        const newDeck = [...prevSweetDeck, card1, card2].sort((a, b) => parseInt(a.id) - parseInt(b.id));
        localStorage.setItem('sweetDeck', JSON.stringify(newDeck));
        return newDeck;
      });
    }

    setRound(prevRound => {
      if (currentPhase === 'yojo' && prevRound >= 10) {
        setCurrentPhase('sweet');
        return 1;
      }
      if (currentPhase === 'sweet' && prevRound >= 5) {
        setSelectionPhase('playableSelection');
        return prevRound;
      }
      return prevRound + 1;
    });
  }, [currentPhase]);

  const restart = useCallback(() => {
    setYojoDeck([]);
    setSweetDeck([]);
    setSelectionPhase('fruitSelection');
    setSelectedPlayableCard(null);
    setRound(1);
    setIsShowDeck(false);
  }, []);

  const handleRestart = useCallback(() => {
    if (window.confirm(locale === 'ja' ? 'もう一度作りますか？' : 'Build another deck?')) {
      restart();
    }
  }, [restart, locale]);

  // プレイアブルカード選択完了処理
  const handlePlayableCardConfirm = () => {
    setIsCardDisappearing(true); // アニメーションを開始
    setTimeout(() => {
      setSelectionPhase('end'); // 終了に移行
      setIsCardDisappearing(false); // アニメーション状態をリセット
    }, 500); // アニメーションの時間に合わせてタイムアウトを設定
  };

  // デッキ確認ボタンの処理
  const showDeck = () => {
    setIsShowDeck(isShowDeck => !isShowDeck);
  };

  // フルーツ選択画面のフォーム送信処理
  const handleFruitSelectionSubmit = () => {
    if (selectedFruits.length === 0 || selectedPlayableVersions.length === 0) {
      return; // 最低1つ以上の選択が必要
    }
    setYojoDeck([]);
    setSweetDeck([]);
    updatePlayableChoices();
    setSelectionPhase('playablePreview');
    setSelectedPlayableCard(null);
    setRound(1);
    setIsShowDeck(false);
  };

  // プレイアブル確認フェーズでの次へボタン処理
  const handlePlayablePreviewSubmit = () => {
    setSelectionPhase('CardSelection'); // カード選択へ
    setCurrentPhase('yojo'); // 初期は幼女カードから選択
    setSelectedPlayableCard(null); // 拡大表示を解除
  };

  // デッキを保存する関数
  const handleSaveDeck = async () => {
    if (!user) {
      const provider = new GoogleAuthProvider();
      try {
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
          // ログイン成功後、デッキを保存
          const deckId = Date.now().toString();
          
          // まずローカルストレージに保存
          localStorage.setItem(`deck_${deckId}_name`, locale === 'ja' ? '2pickデッキ' : '2Pick deck');
          localStorage.setItem(`deck_${deckId}_yojo`, JSON.stringify(yojoDeck));
          localStorage.setItem(`deck_${deckId}_sweet`, JSON.stringify(sweetDeck));
          localStorage.setItem(`deck_${deckId}_playable`, JSON.stringify(selectedPlayableCard));

          // Firebaseに保存
          const deckRef = doc(db, 'users', result.user.uid, 'decks', deckId);
          await setDoc(deckRef, {
            name: t('無名の2pickデッキ'),
            yojoDeckIds: yojoDeck.map(card => card.id),
            sweetDeckIds: sweetDeck.map(card => card.id),
            playableCardId: selectedPlayableCard?.id || null,
            updatedAt: new Date(),
            is2pick: true
          });

          // 保存が完了したことを確認
          const savedDeck = await getDoc(deckRef);
          if (!savedDeck.exists()) {
            throw new Error(locale === 'ja' ? 'デッキの保存に失敗しました' : 'Could not save the deck');
          }

          // 保存成功後、デッキページに遷移
          router.push(`/deck/${result.user.uid}/${deckId}`);
        }
      } catch (error) {
        console.error('ログインエラー:', error);
        alert(locale === 'ja' ? 'ログインに失敗しました' : 'Sign-in failed');
      }
      return;
    }

    try {
      const deckId = Date.now().toString();
      
      // まずローカルストレージに保存
      localStorage.setItem(`deck_${deckId}_name`, locale === 'ja' ? '2pickデッキ' : '2Pick deck');
      localStorage.setItem(`deck_${deckId}_yojo`, JSON.stringify(yojoDeck));
      localStorage.setItem(`deck_${deckId}_sweet`, JSON.stringify(sweetDeck));
      localStorage.setItem(`deck_${deckId}_playable`, JSON.stringify(selectedPlayableCard));

      // Firebaseに保存
      const deckRef = doc(db, 'users', user.uid, 'decks', deckId);
      await setDoc(deckRef, {
        name: t('無名の2pickデッキ'),
        yojoDeckIds: yojoDeck.map(card => card.id),
        sweetDeckIds: sweetDeck.map(card => card.id),
        playableCardId: selectedPlayableCard?.id || null,
        updatedAt: new Date(),
        is2pick: true
      });

      // 保存が完了したことを確認
      const savedDeck = await getDoc(deckRef);
      if (!savedDeck.exists()) {
        throw new Error(locale === 'ja' ? 'デッキの保存に失敗しました' : 'Could not save the deck');
      }

      // 保存成功後、デッキページに遷移
      router.push(`/deck/${user.uid}/${deckId}`);
    } catch (error) {
      console.error('デッキの保存に失敗しました:', error);
      if (error instanceof Error) {
        console.error('エラーの詳細:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      alert(locale === 'ja'
        ? `デッキの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
        : `Could not save the deck: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // ページ離脱時の警告（beforeunloadのみ）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (selectionPhase !== 'fruitSelection' && selectionPhase !== 'end') {
        e.preventDefault();
        e.returnValue = locale === 'ja'
          ? 'ページを離れると、選択したカードが失われます。'
          : 'Leaving this page will discard your selected cards.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectionPhase, locale]);

  return (
  <div>
    <div className={isShowDeck ? css({ filter: 'blur(4px)' }) : '"container relative"'}>
        {/* フルーツとバージョン選択画面 */}
        {selectionPhase === 'fruitSelection' && (
          <FruitVersionSelection
            control={control}
            handleSubmit={handleSubmit}
            selectedFruits={selectedFruits}
            selectedPlayableVersions={selectedPlayableVersions}
            onSubmit={handleFruitSelectionSubmit}
          />
        )}

        {/* プレイアブルカードプレビュー画面 */}
        {selectionPhase === 'playablePreview' && (
          <PlayableCardPreview
            playableChoices={playableChoices}
            onCardClick={setSelectedPlayableCard}
            onSubmit={handlePlayablePreviewSubmit}
          />
        )}

        {/* カード選択画面 */}
        {selectionPhase === 'CardSelection' && (
          <DeckCardSelection
            currentChoices={currentChoices}
            onSelect={handleCardSelect}
            round={round}
            currentPhase={currentPhase}
            onShowDeckClick={showDeck}
            maxYojoRound={10}
            maxSweetRound={5}
          />
        )}

        {/* プレイアブルカード最終選択画面 */}
        {selectionPhase === 'playableSelection' && (
          <PlayableCardFinalSelection
            playableChoices={playableChoices}
            selectedPlayableCard={selectedPlayableCard}
            onCardClick={setSelectedPlayableCard}
            isCardDisappearing={isCardDisappearing}
            onConfirm={handlePlayableCardConfirm}
            onBack={() => setSelectedPlayableCard(null)}
            onCheckDeck={showDeck}
          />
        )}

        {/* 結果表示画面 */}
        {selectionPhase === 'end' && (
          <TwoPickResult
            yojoDeck={yojoDeck}
            sweetDeck={sweetDeck}
            playableCard={selectedPlayableCard}
            user={user}
            onSave={handleSaveDeck}
            onRestart={handleRestart}
          />
        )}
    </div>
            {/* デッキ確認ポップアップ */}
            {isShowDeck && (
          <DeckViewPopup
            yojoDeck={yojoDeck}
            sweetDeck={sweetDeck}
            selectedPlayableCard={selectedPlayableCard}
            onClose={showDeck}
          />
        )}
  </div>
  );
}

function TwoPickFallback() {
  const { t } = useI18n();
  return (
    <div className={`container ${css({ position: 'relative', pt: '6', pb: '8', textAlign: 'center', color: 'gray.700', _dark: { color: 'gray.200' } })}`}>
      {t('読み込み中...')}
    </div>
  );
}

export default function TwoPickPage() {
  return (
    <Suspense fallback={<TwoPickFallback />}>
      <TwoPickContent />
    </Suspense>
  );
}
