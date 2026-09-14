import 'server-only';

import { headers } from 'next/headers';
import { APP_LOCALE_HEADER, isAppLocale, type AppLocale } from './config';

export async function getRequestLocale(): Promise<AppLocale> {
  const locale = (await headers()).get(APP_LOCALE_HEADER);
  return isAppLocale(locale) ? locale : 'ja';
}
