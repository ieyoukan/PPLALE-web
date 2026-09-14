'use client';

import React, { useState } from 'react';
import { CardInfo } from '@/types/card';
import { getCardCatalog } from '@/data/catalog';
import ExportPopup from '@/components/popup/ExportPopup';
import ImportPopup from '@/components/popup/ImportPopup';
import ShareButtons from '@/components/ui/ShareButtons';
import { useSettings } from '@/app/SettingsProvider';
import DeckList from '@/components/deck/DeckList';
import TabButtons from '@/components/ui/TabButtons';
import CardList from '@/components/card/CardList';
import CardListPanel, { DECK_VIEW_TABS, DeckCardType } from '@/components/card/CardListPanel';
import { useDeckPageState } from './useDeckPageState';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

interface DeckPageClientProps {
  initialDeckName: string | null;
  initialYojoDeck: CardInfo[];
  initialSweetDeck: CardInfo[];
  initialSelectedPlayableCard: CardInfo | null;
  isServerDataAvailable: boolean;
  initialError: string | null;
  serverUserId: string; // Passed from server component (params.userId)
  serverDeckId: string; // Passed from server component (params.deckId)
}

export default function DeckPageClient(props: DeckPageClientProps) {
  const { isTwoCardLimit } = useSettings();
  const { locale, t } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);

  const {
    userId,
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
  } = useDeckPageState({ ...props, isTwoCardLimit });

  const [deckViewActiveTab, setDeckViewActiveTab] = useState<DeckCardType>('yojo');
  const [mobileAddModalType, setMobileAddModalType] = useState<DeckCardType | null>(null);

  if (isLoading) {
    return <div className={css({ mx: 'auto', maxW: '1700px', pt: '4', px: '4', pb: '4', color: 'gray.800', _dark: { color: 'gray.100' } })}>{t('読み込み中...')}</div>;
  }

  if (error) {
    return <div className={css({ mx: 'auto', maxW: '1700px', pt: '4', px: '4', pb: '4', color: 'red.500' })}>{error}</div>;
  }

  return (
    <div className={css({ mx: 'auto', maxW: '1700px', pt: '2', px: '2', pb: '2', color: 'gray.900', _dark: { color: 'gray.100' } })}>
      <div className={css({ display: 'flex', alignItems: 'center', mb: '5' })}>
        {isEditing ? (
          <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              onBlur={() => handleNameChange(deckName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNameChange(deckName);
                }
              }}
              className={css({
                fontSize: '3xl',
                fontWeight: 'bold',
                p: '2',
                borderWidth: '1px',
                rounded: 'md',
                _focus: { outline: 'none', boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5)' },
              })}
              autoFocus
            />
          </div>
        ) : (
          <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', w: 'full' })}>
            <h1
              className={css({ fontSize: '3xl', fontWeight: 'bold' })}
              onClick={() => isOwner && setIsEditing(true)}
              style={{ cursor: isOwner ? 'pointer' : 'default' }}
            >
              {deckName}
              {isOwner && (
                <span className={css({ ml: '2', fontSize: 'sm', color: 'gray.500' })}>
                  ({locale === 'ja' ? 'クリックして編集' : 'click to edit'})
                </span>
              )}
            </h1>
            {/* ローカルユーザー向けログインボタン */}
            {userId === 'local' && (
              <LoginToSaveButton onClick={handleLoginAndSave} />
            )}
            <ShareButtons
              share_url={currentUrl}
              share_text={locale === 'ja' ? '#お菓子争奪戦争ぷぷりえーる' : '#PPLALE'}
              isLocal={userId === 'local'}
              yojoDeck={yojoDeck}
              sweetDeck={sweetDeck}
              playableCard={selectedPlayableCard}
            />
          </div>
        )}
      </div>

      <div className={css({
        display: 'grid',
        gridTemplateColumns: isOwner
          ? { base: 'repeat(1, minmax(0, 1fr))', lg: 'repeat(2, minmax(0, 1fr))' }
          : 'repeat(1, minmax(0, 1fr))',
        gap: '2',
      })}>
        {/* デッキ側のカラム（スマホ時はここにタブを表示） */}
        <div className={css({ display: 'flex', flexDirection: 'column' })}>
          {isOwner && (
            <div className={css({ lg: { display: 'none' } })}>
              <TabButtons
                tabs={DECK_VIEW_TABS}
                activeTabKey={deckViewActiveTab}
                onTabClick={(key) => setDeckViewActiveTab(key as DeckCardType)}
                variant="deck"
              />
            </div>
          )}
          <DeckList
            yojoDeck={yojoDeck}
            sweetDeck={sweetDeck}
            playableCard={selectedPlayableCard}
            isOwner={isOwner}
            activeTabKey={deckViewActiveTab}
            onRemoveFromYojoDeck={handleRemoveFromYojoDeck}
            onRemoveFromSweetDeck={handleRemoveFromSweetDeck}
            onRemovePlayableCard={handleRemovePlayableCard}
            onDropDeck={handleDrop}
            onAddClick={(type) => {
              setMobileAddModalType(type === 'yojo' ? 'yojo' : type === 'sweet' ? 'sweet' : 'playable');
            }}
          />
        </div>

        {isOwner && (
          <div className={css({
            display: 'none',
            lg: { display: 'block' },
            rounded: 'lg',
            borderWidth: '1px',
            borderColor: 'gray.200',
            bg: 'white',
            p: '2',
            boxShadow: 'sm',
            _dark: { borderColor: 'gray.700', bg: 'gray.800' },
          })}>
            <CardListPanel
              allYojoCards={allYojoCards}
              allSweetCards={allSweetCards}
              allPlayableCards={allPlayableCards}
              activeTabKey={deckViewActiveTab}
              onTabClick={setDeckViewActiveTab}
              onAddToDeck={handleAddCard}
              canAddToDeck={canAddToDeck}
              draggable
              onDragStart={handleDragStart}
            />
          </div>
        )}
      </div>

      {showExportPopup && (
        <ExportPopup
          yojoDeck={yojoDeck}
          sweetDeck={sweetDeck}
          playableCard={selectedPlayableCard}
          onClose={() => setShowExportPopup(false)}
        />
      )}

      {showImportPopup && (
        <ImportPopup
          onClose={() => setShowImportPopup(false)}
          onImport={handleImportDeck}
        />
      )}

      {/* スマホ用カード追加ポップアップ */}
      {mobileAddModalType && (
        <MobileAddCardModal
          modalType={mobileAddModalType}
          onClose={() => setMobileAddModalType(null)}
          onAddToDeck={(card) => {
            handleAddCard(card);
            if (mobileAddModalType === 'playable') {
              setMobileAddModalType(null);
            }
          }}
          canAddToDeck={canAddToDeck}
        />
      )}
    </div>
  );
}

function LoginToSaveButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className={css({
        rounded: 'md',
        bg: 'blue.600',
        px: '4',
        py: '2',
        fontSize: 'sm',
        fontWeight: 'semibold',
        color: 'white',
        transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
        _hover: { bg: 'blue.700' },
      })}
    >
      {t('アカウントにデッキを保存')}
    </button>
  );
}

interface MobileAddCardModalProps {
  modalType: DeckCardType;
  onClose: () => void;
  onAddToDeck: (card: CardInfo) => void;
  canAddToDeck: (card: CardInfo) => boolean;
}

/** スマホ幅で「デッキに追加」を押したときに開くカード選択モーダル。 */
function MobileAddCardModal({ modalType, onClose, onAddToDeck, canAddToDeck }: MobileAddCardModalProps) {
  const { t } = useI18n();
  const modalTitle = modalType === 'yojo' ? t('幼女カードを追加') : modalType === 'sweet' ? t('お菓子カードを追加') : t('プレイアブルカードを追加');

  return (
    <div className={css({
      position: 'fixed',
      inset: '0',
      zIndex: '50',
      display: 'flex',
      flexDirection: 'column',
      bg: 'black/70',
      backdropFilter: 'blur(4px)',
      lg: { display: 'none' },
      pt: '12',
      px: '2',
      pb: '2',
    })}>
      <div className={css({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        bg: 'white',
        _dark: { bg: 'gray.800' },
        p: '4',
        roundedTop: 'xl',
        boxShadow: 'lg',
        position: 'relative',
        zIndex: '10',
      })}>
        <h3 className={css({ fontSize: 'xl', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2' })}>
          {modalTitle}
        </h3>
        <button
          onClick={onClose}
          className={css({
            p: '2',
            bg: 'gray.100',
            _hover: { bg: 'gray.200' },
            _dark: { bg: 'gray.700', _hover: { bg: 'gray.600' } },
            rounded: 'full',
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
          aria-label={t('閉じる')}
        >
          <svg className={css({ w: '6', h: '6', color: 'gray.600', _dark: { color: 'gray.300' } })} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div
        className={css({
          flex: '1 1 0%',
          overflowY: 'auto',
          roundedBottom: 'xl',
          boxShadow: 'xl',
          p: '3',
          bg: modalType === 'yojo' ? 'rose.100' : modalType === 'sweet' ? 'cyan.100' : 'indigo.100',
          _dark: {
            bg: modalType === 'yojo' ? 'rose.900/40' : modalType === 'sweet' ? 'cyan.900/40' : 'indigo.900/40',
          },
        })}
      >
        <CardListForModal modalType={modalType} onAddToDeck={onAddToDeck} canAddToDeck={canAddToDeck} />
      </div>
    </div>
  );
}

function CardListForModal({ modalType, onAddToDeck, canAddToDeck }: Omit<MobileAddCardModalProps, 'onClose'>) {
  const { locale } = useI18n();
  const { allYojoCards, allSweetCards, allPlayableCards } = getCardCatalog(locale);
  // モーダル内はタブ無しで単一種別のカードリストのみを表示する
  return (
    <CardList
      allYojoCards={allYojoCards}
      allSweetCards={allSweetCards}
      allPlayableCards={allPlayableCards}
      displayCardType={modalType}
      onAddToDeck={onAddToDeck}
      canAddToDeck={canAddToDeck}
      draggable={false}
    />
  );
}
