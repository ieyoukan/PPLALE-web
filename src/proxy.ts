import { NextResponse, type NextRequest } from 'next/server';
import {
  APP_LOCALE_COOKIE,
  APP_LOCALE_HEADER,
  detectAppLocale,
  isAppLocale,
} from '@/i18n/config';

export function proxy(request: NextRequest) {
  const savedLocale = request.cookies.get(APP_LOCALE_COOKIE)?.value;
  const locale = isAppLocale(savedLocale)
    ? savedLocale
    : detectAppLocale(
        request.headers.get('accept-language'),
        request.headers.get('x-vercel-ip-country')
      );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(APP_LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (!isAppLocale(savedLocale)) {
    response.cookies.set(APP_LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  matcher: ['/build/:path*', '/deck/:path*', '/deck-view/:path*', '/tournament/:path*'],
};
