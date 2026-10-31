'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CardRole, CardType, CardVersion, FruitType, SweetType } from '@/types/card';
import { APP_LOCALE_COOKIE, browserAppLocale, type AppLocale } from './config';
import type { GameEnglish } from './en/game';

import { siteEnglish } from './en/site';

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
  ja: { normal: '通常', beta: '拡張プレイアブル（ExP）' },
  en: { normal: 'Standard', beta: 'Extended (ExP)' },
};

const roleLabels: Record<AppLocale, Record<CardRole, string>> = {
  ja: { '': '', assistant_manager: '副店長', manager: '店長' },
  en: { '': '', assistant_manager: 'Assistant manager', manager: 'Manager' },
};

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  /** The text in the current language. `vars` fill `{name}` in both the Japanese key and its English. */
  t: (japaneseText: string, vars?: Record<string, string | number>) => string;
  /** Text made by the game engine or the room server (logs, prompts, errors): translated by pattern in English. */
  gameText: (text: string) => string;
  cardTypeLabel: (type: CardType) => string;
  fruitLabel: (fruit: FruitType) => string;
  sweetTypeLabel: (type: SweetType) => string;
  versionLabel: (version: CardVersion) => string;
  roleLabel: (role: CardRole) => string;
}

const defaultValue: LocaleContextValue = {
  locale: 'ja',
  setLocale: () => undefined,
  t: (text, vars) => fill(text, vars),
  gameText: text => text,
  cardTypeLabel: (type) => cardTypeLabels.ja[type],
  fruitLabel: (fruit) => fruitLabels.ja[fruit],
  sweetTypeLabel: (type) => sweetTypeLabels.ja[type],
  versionLabel: (version) => versionLabels.ja[version],
  roleLabel: (role) => roleLabels.ja[role],
};

const LocaleContext = createContext<LocaleContextValue>(defaultValue);

const noSubscription = () => () => {};
const fill = (text: string, vars?: Record<string, string | number>) => vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => name in vars ? String(vars[name]) : whole) : text;

/**
 * `initialLocale`: the server's choice (the site's proxy reads the cookie, Accept-Language and country).
 * `live` (the game): the server renders Japanese and the browser then uses the saved choice or its own
 * language; changing it switches in place instead of reloading, so the room stays connected.
 */
export function LocaleProvider({ initialLocale, live = false, children }: { initialLocale: AppLocale; live?: boolean; children: React.ReactNode }) {
  const detected = useSyncExternalStore(noSubscription, () => live ? browserAppLocale() : initialLocale, () => initialLocale);
  const [chosen, setChosen] = useState<AppLocale | null>(null);
  const locale = chosen ?? detected;
  useEffect(() => { if (live) { document.documentElement.lang = locale; document.documentElement.dataset.locale = locale; } }, [live, locale]);
  // The game's English (menus, boards, the engine's and the room's messages) is fetched only for English.
  const [game, setGame] = useState<GameEnglish | null>(null);
  useEffect(() => {
    if (locale !== 'en' || game) return;
    let current = true;
    void import('./en/game').then(module => { if (current) setGame(module.gameEnglish); });
    return () => { current = false; };
  }, [locale, game]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale(nextLocale) {
      setChosen(nextLocale);
      document.cookie = `${APP_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
      if (!live) window.location.reload();
    },
    t: (text, vars) => fill(locale === 'en' ? siteEnglish[text] ?? game?.text[text] ?? text : text, vars),
    gameText: text => locale === 'en' && game ? game.translate(text) : text,
    cardTypeLabel: (type) => cardTypeLabels[locale][type],
    fruitLabel: (fruit) => fruitLabels[locale][fruit],
    sweetTypeLabel: (type) => sweetTypeLabels[locale][type],
    versionLabel: (version) => versionLabels[locale][version],
    roleLabel: (role) => roleLabels[locale][role],
  }), [locale, live, game]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}
