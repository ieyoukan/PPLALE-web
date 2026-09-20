export const APP_LOCALE_COOKIE = 'pplale-locale';
export const APP_LOCALE_HEADER = 'x-pplale-locale';
export const APP_LOCALES = ['ja', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return value === 'ja' || value === 'en';
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
