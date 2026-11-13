export const APP_LOCALE_COOKIE = 'pplale-locale';
export const APP_LOCALE_HEADER = 'x-pplale-locale';
export const APP_LOCALES = ['ja', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return value === 'ja' || value === 'en';
}

/** In the browser: the saved choice, or else the browser's first language (as detectAppLocale reads Accept-Language). */
export function browserAppLocale(): AppLocale {
  const saved = document.cookie.match(new RegExp(`(?:^|; )${APP_LOCALE_COOKIE}=([^;]*)`))?.[1];
  if (isAppLocale(saved)) return saved;
  const language = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  return !language || language === 'ja' || language.startsWith('ja-') ? 'ja' : 'en';
}

export function detectAppLocale(acceptLanguage: string | null, country: string | null): AppLocale {
  const preferredLanguages = (acceptLanguage ?? '')
    .split(',')
    .map((entry) => {
      const [language, ...parameters] = entry.trim().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      return {
        language: language.toLowerCase(),
        quality: quality ? Number(quality.split('=')[1]) : 1,
      };
    })
    .filter(({ language, quality }) => language && Number.isFinite(quality) && quality > 0)
    .sort((left, right) => right.quality - left.quality);

  const preferredLanguage = preferredLanguages[0]?.language;
  if (preferredLanguage === 'ja' || preferredLanguage?.startsWith('ja-')) {
    return 'ja';
  }
  if (preferredLanguage) return 'en';
  return country?.toUpperCase() === 'JP' ? 'ja' : 'en';
}

/**
 * Runs in <head> before anything is drawn: the language for <html lang> and data-locale (which <Bi> and the
 * LocaleProvider follow). The same rule as browserAppLocale.
 */
export const LOCALE_SCRIPT = `(() => { try {
  const saved = document.cookie.match(/(?:^|; )${APP_LOCALE_COOKIE}=(ja|en)(?:;|$)/);
  const language = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
  const locale = saved ? saved[1] : !language || language === 'ja' || language.startsWith('ja-') ? 'ja' : 'en';
  document.documentElement.lang = locale; document.documentElement.dataset.locale = locale;
} catch {} })();`;
