import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CardInfo } from '@/types/card';
import { getCardCatalog } from '@/data/catalog';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { validateDeckData } from '@/lib/schema';
import { useAuth } from '@/lib/auth';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useI18n } from '@/i18n/LocaleProvider';

const yojoLimit = 20;
const sweetLimit = 10;

export interface DeckPageStateInput {
  initialDeckName: string | null;
  initialYojoDeck: CardInfo[];
  initialSweetDeck: CardInfo[];
  initialSelectedPlayableCard: CardInfo | null;
  isServerDataAvailable: boolean;
  initialError: string | null;
  serverUserId: string;
  serverDeckId: string;
  isTwoCardLimit: boolean;
}

interface ImportedDeck {
  yojoDeck?: CardInfo[];
  sweetDeck?: CardInfo[];
  playableCard?: CardInfo | null;
}

/**
 * デッキ編集ページのデータ層（Firebase保存/localStorage同期/デッキ操作ロジック）。
 * DeckPageClient からJSXの組み立てを分離するためのフック。
 */
export function useDeckPageState({
  initialDeckName,
  initialYojoDeck,
  initialSweetDeck,
  initialSelectedPlayableCard,
  isServerDataAvailable,
  initialError,
  serverUserId,
  serverDeckId,
  isTwoCardLimit,
}: DeckPageStateInput) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
  const userId = serverUserId;
  const deckId = serverDeckId;

  const { user } = useAuth();

  const [deckName, setDeckName] = useState(initialDeckName || t('無名のデッキ'));
  const [isEditing, setIsEditing] = useState(false);
  const [yojoDeck, setYojoDeck] = useState<CardInfo[]>(initialYojoDeck);
  const [sweetDeck, setSweetDeck] = useState<CardInfo[]>(initialSweetDeck);
  const [selectedPlayableCard, setSelectedPlayableCard] = useState<CardInfo | null>(initialSelectedPlayableCard);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [isLoaded, setIsLoaded] = useState(isServerDataAvailable);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [showImportPopup, setShowImportPopup] = useState(false);

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  const checkSignificantDataLoss = useCallback((): boolean => {
    if (initialYojoDeck.length > 0 && yojoDeck.length < 1) return true;
    if (initialSweetDeck.length > 0 && sweetDeck.length < 1) return true;
    return false;
  }, [initialYojoDeck, yojoDeck, initialSweetDeck, sweetDeck]);

  useEffect(() => {
    setDeckName(initialDeckName || t('無名のデッキ'));
    setYojoDeck(initialYojoDeck);
    setSweetDeck(initialSweetDeck);
    setSelectedPlayableCard(initialSelectedPlayableCard);
    setError(initialError);
    setIsLoaded(isServerDataAvailable);
    setIsOwner(user ? user.uid === userId || userId === 'local' : userId === 'local'); //ログインしてlocalの共有データを見てもログインしなくても編集可能

    // userId === 'local' の場合、かつサーバーからのデータロードに失敗した場合のフォールバック
    if (userId === 'local' && !isServerDataAvailable) {
      const fetchLocalData = () => {
        try {
          setIsLoading(true);
          setError(null);

          const paramsFromUrl = new URLSearchParams(window.location.search);
          const yojoIds = paramsFromUrl.get('yojo')?.split(',') || [];
          const sweetIds = paramsFromUrl.get('sweet')?.split(',') || [];
          const playableId = paramsFromUrl.get('playable');

          const savedName = localStorage.getItem(`deck_${deckId}_name`);
          const savedYojo = localStorage.getItem(`deck_${deckId}_yojo`);
          const savedSweet = localStorage.getItem(`deck_${deckId}_sweet`);
          const savedPlayable = localStorage.getItem(`deck_${deckId}_playable`);

          if (yojoIds.length > 0 || sweetIds.length > 0 || playableId) {
            const newYojoDeck: CardInfo[] = yojoIds
              .map(id => allYojoCards.find(card => card.id === id))
              .filter((card): card is CardInfo => card !== undefined);
            const newSweetDeck: CardInfo[] = sweetIds
              .map(id => allSweetCards.find(card => card.id === id))
              .filter((card): card is CardInfo => card !== undefined);
            const newPlayableCard = playableId
              ? allPlayableCards.find(card => card.id === playableId) || null
              : null;

            setYojoDeck(newYojoDeck);
            setSweetDeck(newSweetDeck);
            setSelectedPlayableCard(newPlayableCard);
            setDeckName(t('共有されたデッキ'));
          } else if (savedName || savedYojo || savedSweet || savedPlayable) {
            const savedYojoCards = savedYojo ? JSON.parse(savedYojo) as CardInfo[] : [];
            const savedSweetCards = savedSweet ? JSON.parse(savedSweet) as CardInfo[] : [];
            const savedPlayableCard = savedPlayable ? JSON.parse(savedPlayable) as CardInfo | null : null;
            setDeckName(savedName || t('無名のデッキ'));
            setYojoDeck(savedYojoCards
              .map(({ id }) => allYojoCards.find(card => card.id === id))
              .filter((card): card is CardInfo => card !== undefined));
            setSweetDeck(savedSweetCards
              .map(({ id }) => allSweetCards.find(card => card.id === id))
              .filter((card): card is CardInfo => card !== undefined));
            setSelectedPlayableCard(savedPlayableCard
              ? allPlayableCards.find(card => card.id === savedPlayableCard.id) || null
              : null);
          }
        } catch (e) {
          console.error("ローカルデータの読み込みに失敗:", e);
          setError(locale === 'ja' ? 'ローカルデータの読み込みに失敗しました' : 'Could not load the local deck data');
        } finally {
          setIsLoading(false);
          setIsLoaded(true);
        }
      };
      fetchLocalData();
    } else {
      setIsLoading(false);
    }
  }, [initialDeckName, initialYojoDeck, initialSweetDeck, initialSelectedPlayableCard, isServerDataAvailable, initialError, userId, deckId, router, user, locale, t, allYojoCards, allSweetCards, allPlayableCards]);

  useEffect(() => {
    const handleExport = () => setShowExportPopup(true);
    const handleImport = () => setShowImportPopup(true);

    window.addEventListener('exportDeck', handleExport);
    window.addEventListener('importDeck', handleImport);

    return () => {
      window.removeEventListener('exportDeck', handleExport);
      window.removeEventListener('importDeck', handleImport);
    };
  }, []);

  // デッキの変更をローカルストレージに保存 (localユーザーの場合)
  useEffect(() => {
    if (userId === 'local') {
      localStorage.setItem(`deck_${deckId}_yojo`, JSON.stringify(yojoDeck));
    }
  }, [yojoDeck, deckId, userId]);

  useEffect(() => {
    if (userId === 'local') {
      localStorage.setItem(`deck_${deckId}_sweet`, JSON.stringify(sweetDeck));
    }
  }, [sweetDeck, deckId, userId]);

  useEffect(() => {
    if (userId === 'local') {
      localStorage.setItem(`deck_${deckId}_playable`, JSON.stringify(selectedPlayableCard));
    }
  }, [selectedPlayableCard, deckId, userId]);

  const showDataLossWarning = useCallback((message: string): boolean => {
    return window.confirm(locale === 'ja'
      ? `警告: ${message}\n\nこの操作により、現在のデッキデータが失われる可能性があります。\n\n本当に続行しますか？`
      : `Warning: ${message}\n\nThis operation may discard the current deck data.\n\nContinue?`);
  }, [locale]);

  // Firebaseへの保存
  useEffect(() => {
    if (!isLoaded) return;
    if (userId === 'local' || !user || user.uid !== userId) return;

    const saveToFirebase = async () => {
      try {
        const deckRef = doc(db, 'users', userId, 'decks', deckId);

        const hasSignificantDataLoss = checkSignificantDataLoss();
        if (hasSignificantDataLoss) {
          const confirmed = showDataLossWarning(
            locale === 'ja'
              ? `デッキの変更により、多くのカードが削除されます。\n\nこの変更を保存しますか？\n\n保存後は元に戻すことができません。`
              : `This change will remove many cards from the deck.\n\nSave this change?\n\nIt cannot be undone after saving.`
          );
          if (!confirmed) {
            console.log('ユーザーがデータ損失警告でキャンセルしました');
            return;
          }
        }

        const docData = {
          name: deckName,
          yojoDeckIds: yojoDeck.map(card => card.id),
          sweetDeckIds: sweetDeck.map(card => card.id),
          playableCardId: selectedPlayableCard?.id || null,
          updatedAt: new Date()
        };
        try {
          validateDeckData(docData);
        } catch (e) {
          console.error('Deck validation failed, aborting save:', e);
          alert(locale === 'ja' ? 'デッキの保存に失敗しました: データが不正です' : 'Could not save the deck: invalid data');
          return;
        }

        await setDoc(deckRef, docData, { merge: true });
      } catch (error) {
        console.error('デッキの更新に失敗しました:', error);
        if (error instanceof Error) {
          console.error('エラーの詳細:', {
            message: error.message,
            name: error.name,
            stack: error.stack
          });
        }
        alert(locale === 'ja'
          ? `デッキの更新に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
          : `Could not update the deck: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    saveToFirebase();
  }, [user, userId, deckId, isLoaded, deckName, yojoDeck, sweetDeck, selectedPlayableCard, checkSignificantDataLoss, locale, showDataLossWarning]);

  /**
   * ローカルユーザーがログインしてデッキを保存する
   */
  const handleLoginAndSave = async () => {
    if (user) {
      const deckRef = doc(db, 'users', user.uid, 'decks', deckId);
      try {
        const docData = {
          name: deckName,
          yojoDeckIds: yojoDeck.map(card => card.id),
          sweetDeckIds: sweetDeck.map(card => card.id),
          playableCardId: selectedPlayableCard?.id || null,
          updatedAt: new Date()
        };
        try {
          validateDeckData(docData);
        } catch (e) {
          console.error('Deck validation failed, aborting save:', e);
          alert(locale === 'ja' ? 'デッキの保存に失敗しました: データが不正です' : 'Could not save the deck: invalid data');
          return;
        }

        await setDoc(deckRef, docData);
        console.log('ログイン済みユーザーがデッキを更新しました:', deckId);
        router.push(`/deck/${user.uid}/${deckId}`);
      } catch (error) {
        console.error('デッキの更新に失敗しました:', error);
        alert(locale === 'ja' ? 'デッキの更新に失敗しました' : 'Could not update the deck');
      }
      return;
    }

    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        const deckRef = doc(db, 'users', result.user.uid, 'decks', deckId);
        const docData = {
          name: deckName,
          yojoDeckIds: yojoDeck.map(card => card.id),
          sweetDeckIds: sweetDeck.map(card => card.id),
          playableCardId: selectedPlayableCard?.id || null,
          updatedAt: new Date()
        };
        try {
          validateDeckData(docData);
        } catch (e) {
          console.error('Deck validation failed, aborting save:', e);
          alert(locale === 'ja' ? 'デッキの保存に失敗しました: データが不正です' : 'Could not save the deck: invalid data');
          return;
        }

        await setDoc(deckRef, docData);
        console.log('ログイン後にデッキを更新しました:', deckId);
        router.push(`/deck/${result.user.uid}/${deckId}`);
      }
    } catch (error) {
      console.error('ログインエラー:', error);
      alert(locale === 'ja' ? 'ログインに失敗しました' : 'Sign-in failed');
    }
  };

  const handleNameChange = async (newName: string) => {
    const normalizedName = newName.trim() || '無名のデッキ';

    if (userId === 'local') {
      setIsEditing(false);
      setDeckName(normalizedName);
      localStorage.setItem(`deck_${deckId}_name`, normalizedName);
      handleLoginAndSave();
      return;
    }
    if (!user || user.uid !== userId) {
      setIsEditing(false);
      setDeckName(deckName);
      return;
    }
    try {
      const deckRef = doc(db, 'users', userId, 'decks', deckId);
      await setDoc(deckRef, {
        name: normalizedName,
        updatedAt: new Date()
      }, { merge: true });
      setDeckName(normalizedName);
      setIsEditing(false);
    } catch (error) {
      console.error('デッキ名の更新に失敗しました:', error);
      alert(locale === 'ja' ? 'デッキ名の更新に失敗しました' : 'Could not update the deck name');
    }
  };

  const canAddToDeck = useCallback((card: CardInfo) => {
    if (isTwoCardLimit) {
      if (card.type === 'yojo') {
        const count = yojoDeck.filter(c => c.id === card.id).length;
        if (count >= 2) return false;
      } else if (card.type === 'sweet') {
        const count = sweetDeck.filter(c => c.id === card.id).length;
        if (count >= 2) return false;
      }
    }
    if (card.sweetType == "animal_soda") {
      const count = sweetDeck.filter(c => c.id == card.id).length;
      if (count >= 1) return false;
    }

    if (card.type === 'yojo') {
      return yojoDeck.length < yojoLimit;
    } else if (card.type === 'sweet') {
      return sweetDeck.length < sweetLimit;
    } else if (card.type === 'playable') {
      return !selectedPlayableCard;
    }
    return false;
  }, [isTwoCardLimit, yojoDeck, sweetDeck, selectedPlayableCard]);

  const handleAddCard = useCallback((card: CardInfo) => {
    if (!canAddToDeck(card)) return;
    if (card.type === 'yojo' && yojoDeck.length < yojoLimit) {
      setYojoDeck(prev => [...prev, card]);
    } else if (card.type === 'sweet' && sweetDeck.length < sweetLimit) {
      setSweetDeck(prev => [...prev, card]);
    } else if (card.type === 'playable' && !selectedPlayableCard) {
      setSelectedPlayableCard(card);
    }
  }, [canAddToDeck, yojoDeck.length, sweetDeck.length, selectedPlayableCard]);

  const handleRemoveFromYojoDeck = useCallback((card: CardInfo) => {
    setYojoDeck(prev => prev.filter(c => c.id !== card.id));
  }, []);

  const handleRemoveFromSweetDeck = useCallback((card: CardInfo) => {
    setSweetDeck(prev => prev.filter(c => c.id !== card.id));
  }, []);

  const handleRemovePlayableCard = useCallback(() => {
    setSelectedPlayableCard(null);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, card: CardInfo) => {
    e.dataTransfer.setData('cardId', card.id);
    e.dataTransfer.setData('cardType', card.type);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, deckType: string) => {
    e.preventDefault();

    const cardId = e.dataTransfer.getData('cardId');
    const cardType = e.dataTransfer.getData('cardType');

    let cardToAdd: CardInfo | undefined;
    if (cardType === 'yojo') cardToAdd = allYojoCards.find(c => c.id === cardId);
    else if (cardType === 'sweet') cardToAdd = allSweetCards.find(c => c.id === cardId);
    else if (cardType === 'playable') cardToAdd = allPlayableCards.find(c => c.id === cardId);

    if (cardToAdd && canAddToDeck(cardToAdd)) {
      if (cardType === 'yojo' && deckType === 'yojo') {
        handleAddCard(cardToAdd);
      } else if (cardType === 'sweet' && deckType === 'sweet') {
        handleAddCard(cardToAdd);
      } else if (cardType === 'playable' && deckType === 'playable') {
        handleAddCard(cardToAdd);
      }
    }
  }, [canAddToDeck, handleAddCard, allYojoCards, allSweetCards, allPlayableCards]);

  /** インポートポップアップからのデッキ一括反映 */
  const handleImportDeck = useCallback((importedDeck: ImportedDeck) => {
    if (importedDeck.yojoDeck && importedDeck.yojoDeck.length > 0) {
      setYojoDeck(importedDeck.yojoDeck);
      if (userId === 'local') localStorage.setItem(`deck_${deckId}_yojo`, JSON.stringify(importedDeck.yojoDeck));
    }
    if (importedDeck.sweetDeck && importedDeck.sweetDeck.length > 0) {
      setSweetDeck(importedDeck.sweetDeck);
      if (userId === 'local') localStorage.setItem(`deck_${deckId}_sweet`, JSON.stringify(importedDeck.sweetDeck));
    }
    if (importedDeck.playableCard) {
      setSelectedPlayableCard(importedDeck.playableCard);
      if (userId === 'local') localStorage.setItem(`deck_${deckId}_playable`, JSON.stringify(importedDeck.playableCard));
    }
    // Firebaseへの保存はuseEffectで自動的に行われるため、ここでは重複しない
    setShowImportPopup(false);
  }, [userId, deckId]);

  return {
    userId,
    deckId,
    deckName,
    isEditing,
    setIsEditing,
    setDeckName,
    yojoDeck,
    sweetDeck,
    selectedPlayableCard,
    isLoading,
    error,
    isOwner,
    currentUrl,
    showExportPopup,
    setShowExportPopup,
    showImportPopup,
    setShowImportPopup,
    handleNameChange,
    handleLoginAndSave,
    handleAddCard,
    handleRemoveFromYojoDeck,
    handleRemoveFromSweetDeck,
    handleRemovePlayableCard,
    handleDragStart,
    handleDrop,
    canAddToDeck,
    handleImportDeck,
  };
}
