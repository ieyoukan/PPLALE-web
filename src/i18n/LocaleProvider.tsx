'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { CardRole, CardType, CardVersion, FruitType, SweetType } from '@/types/card';
import { APP_LOCALE_COOKIE, type AppLocale } from './config';

const englishText: Record<string, string> = {
  'ぷぷりえーる デッキ構築': 'PPLALE Deck Builder',
  '2Pick構築': '2Pick Draft',
  '言語': 'Language',
  '日本語': '日本語',
  'English': 'English',
  'メニュー': 'Menu',
  'テーマ': 'Theme',
  '2枚制限': 'Two-copy limit',
  '同じカードは最大2枚まで': 'Up to two copies of the same card',
  '同じカードを何枚でも追加可能': 'Any number of copies can be added',
  'エクスポート': 'Export',
  'インポート': 'Import',
  'ログイン': 'Sign in',
  'ログアウト': 'Sign out',
  'ユーザー': 'User',
  '新しいデッキを作成': 'Create a new deck',
  '通常構築': 'Standard deck',
  '新しいデッキを最初から構築します': 'Build a new deck from scratch',
  '2枚選択方式でデッキを構築します': 'Build a deck by choosing between pairs of cards',
  '最近作成したデッキ': 'Recently updated decks',
  'その他のデッキ': 'Other decks',
  'デッキ名でフィルター': 'Filter by deck name',
  '最終更新': 'Last updated',
  'デッキを削除': 'Delete deck',
  'このデッキを削除しますか？': 'Delete this deck?',
  'キャンセル': 'Cancel',
  '削除': 'Delete',
  '無名のデッキ': 'Untitled deck',
  '無名の2pickデッキ': 'Untitled 2Pick deck',
  '共有されたデッキ': 'Shared deck',
  'デッキ': 'Deck',
  'デッキの削除': 'Delete deck',
  '削除する': 'Delete',
  '共有リンクをコピー': 'Copy share link',
  'メニューを開く': 'Open menu',
  'カードコードからデッキ画像を生成': 'Generate a deck image from card codes',
  'カードコードを入力すると自動で画像が生成されます': 'Enter card codes to generate an image automatically',
  'デッキ画像を生成中...': 'Generating deck image...',
  '幼女デッキ（カンマ区切り）': 'Little girl deck (comma-separated)',
  'お菓子デッキ（カンマ区切り）': 'Sweets deck (comma-separated)',
  'プレイアブルカード（任意）': 'Playable character (optional)',
  '幼女デッキ': 'Little girl deck',
  'お菓子デッキ': 'Sweets deck',
  'プレイアブルカード': 'Playable character',
  'カードを検索': 'Search cards',
  'すべてのフルーツ': 'All fruit types',
  'お菓子タイプ': 'Sweets type',
  'バージョン': 'Version',
  'ソートしない': 'Do not sort',
  'ID順': 'ID',
  '名前順': 'Name',
  'コスト順': 'Cost',
  '攻撃力順': 'Attack',
  'HP順': 'Health',
  '追加': 'Add',
  'デッキにカードがありません': 'There are no cards in this deck',
  '選択する': 'Select',
  'デッキに追加': 'Add to deck',
  'デッキから削除': 'Remove from deck',
  '拡大表示を閉じる': 'Close enlarged view',
  'カード裏面': 'Card back',
  '閉じる': 'Close',
  '幼女カードを追加': 'Add a little girl card',
  'お菓子カードを追加': 'Add a sweets card',
  'プレイアブルカードを追加': 'Add a playable character',
  'デッキ名を編集': 'Edit deck name',
  '保存': 'Save',
  'デッキを保存するにはログインしてください': 'Sign in to save this deck',
  'Googleでログインして保存': 'Sign in with Google and save',
  'アカウントにデッキを保存': 'Save deck to account',
  '読み込み中...': 'Loading...',
  'デッキが見つかりません': 'Deck not found',
  'デッキを見る': 'View deck',
  '結果を見る': 'View result',
  '次へ': 'Next',
  '戻る': 'Back',
  '選び直す': 'Choose again',
  '決定': 'Confirm',
  'デッキを確認': 'Review deck',
  'プレイアブルカードを確認してください': 'Review the playable characters',
  'プレイアブルカードを選択してください': 'Choose a playable character',
  'フルーツを選択してください': 'Choose fruit types',
  'プレイアブルカードのバージョンを選択してください': 'Choose playable character versions',
  'カードのフルーツを選択してください': 'Choose card fruit types',
  'カードを選択してください': 'Choose a card',
  '構築完了': 'Deck complete',
  'デッキ構築結果': 'Deck-building result',
  '構築したデッキをシェアしよう': 'Share the deck you built',
  'デッキを保存': 'Save deck',
  'ログインしてデッキを保存': 'Sign in to save deck',
  'もう一度プレイ': 'Play again',
  'ホームに戻る': 'Back to home',
  'コピー': 'Copy',
  'コピーしました！': 'Copied!',
  '幼女デッキをコピー': 'Copy little girl deck',
  'お菓子デッキをコピー': 'Copy sweets deck',
  'プレイアブルキャラ': 'Playable character',
  'デッキ情報をインポート': 'Import deck data',
  'デッキ情報をエクスポート': 'Export deck data',
  'デッキをインポート': 'Import deck',
  'デッキをエクスポート': 'Export deck',
  'デッキの画像を表示': 'Show deck image',
  'デッキ画像プレビュー': 'Deck image preview',
  '画像生成中...': 'Generating image...',
  'デッキ画像': 'Deck image',
  '画像をダウンロード': 'Download image',
  '画像生成に失敗しました': 'Could not generate the image',
  'シェア': 'Share',
  'シェアアイコン': 'Share icon',
  'リンクをコピー': 'Copy link',
  'リンクアイコン': 'Link icon',
  'Twitterでシェア': 'Share on Twitter',
  'Twitterアイコン': 'Twitter icon',
  '画像アイコン': 'Image icon',
  '大会一覧': 'Tournaments',
  '使用可能フルーツ': 'Allowed fruit types',
  '大会ページへ': 'Open tournament page',
};

const cardTypeLabels: Record<AppLocale, Record<CardType, string>> = {
  ja: { yojo: '幼女', sweet: 'お菓子', playable: 'プレイアブル' },
  en: { yojo: 'Little girl', sweet: 'Sweets', playable: 'Playable character' },
};

const fruitLabels: Record<AppLocale, Record<FruitType, string>> = {
  ja: { all: 'すべて', strawberry: 'いちご', grape: 'ぶどう', melon: 'めろん', orange: 'おれんじ' },
  en: { all: 'All', strawberry: 'Strawberry', grape: 'Grape', melon: 'Melon', orange: 'Orange' },
};

const sweetTypeLabels: Record<AppLocale, Record<SweetType, string>> = {
  ja: {
    '': '', animal_soda: '動物さんソーダ', cafe: 'カフェ', float: 'フロート', doughnut: 'ドーナツ',
    cake: 'ケーキ', back_menu: '裏メニュー', chai: 'チャイ', ice_cream: 'アイス',
    pplale_soda: 'ぷぷりえソーダ', pplale_yaki: 'ぷぷりえ焼き', currency: '通貨',
  },
  en: {
    '': '', animal_soda: 'Animal soda', cafe: 'Café', float: 'Float', doughnut: 'Doughnut',
    cake: 'Cake', back_menu: 'Back menu', chai: 'Chai', ice_cream: 'Ice cream',
    pplale_soda: 'PPLALE soda', pplale_yaki: 'PPLALE-yaki', currency: 'Currency',
  },
};

const versionLabels: Record<AppLocale, Record<CardVersion, string>> = {
  ja: { normal: '通常', beta: 'β' },
  en: { normal: 'Standard', beta: 'Beta' },
};

const roleLabels: Record<AppLocale, Record<CardRole, string>> = {
  ja: { '': '', assistant_manager: '副店長', manager: '店長' },
  en: { '': '', assistant_manager: 'Assistant manager', manager: 'Manager' },
};

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (japaneseText: string) => string;
  cardTypeLabel: (type: CardType) => string;
  fruitLabel: (fruit: FruitType) => string;
  sweetTypeLabel: (type: SweetType) => string;
  versionLabel: (version: CardVersion) => string;
  roleLabel: (role: CardRole) => string;
}

const defaultValue: LocaleContextValue = {
  locale: 'ja',
  setLocale: () => undefined,
  t: (text) => text,
  cardTypeLabel: (type) => cardTypeLabels.ja[type],
  fruitLabel: (fruit) => fruitLabels.ja[fruit],
  sweetTypeLabel: (type) => sweetTypeLabels.ja[type],
  versionLabel: (version) => versionLabels.ja[version],
  roleLabel: (role) => roleLabels.ja[role],
};

const LocaleContext = createContext<LocaleContextValue>(defaultValue);

export function LocaleProvider({ initialLocale, children }: { initialLocale: AppLocale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale(nextLocale) {
      setLocaleState(nextLocale);
      document.cookie = `${APP_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.location.reload();
    },
    t: (text) => locale === 'en' ? englishText[text] ?? text : text,
    cardTypeLabel: (type) => cardTypeLabels[locale][type],
    fruitLabel: (fruit) => fruitLabels[locale][fruit],
    sweetTypeLabel: (type) => sweetTypeLabels[locale][type],
    versionLabel: (version) => versionLabels[locale][version],
    roleLabel: (role) => roleLabels[locale][role],
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}
