import { AsyncLocalStorage } from 'node:async_hooks';

export const LOCALE_VALUES = ['en', 'ar'] as const;

export type Locale = (typeof LOCALE_VALUES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

const localeStorage = new AsyncLocalStorage<Locale>();

export function resolveLocale(acceptLanguageHeader?: string | string[]): Locale {
  const header = Array.isArray(acceptLanguageHeader) ? acceptLanguageHeader[0] : acceptLanguageHeader;
  if (!header) return DEFAULT_LOCALE;

  const primaryTag = header.split(',')[0]?.trim().split(';')[0]?.trim().toLowerCase();
  if (!primaryTag) return DEFAULT_LOCALE;

  const baseLanguage = primaryTag.split('-')[0];
  if (LOCALE_VALUES.includes(baseLanguage as Locale)) return baseLanguage as Locale;

  return DEFAULT_LOCALE;
}

export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return localeStorage.run(locale, fn);
}

export function getLocale(): Locale {
  return localeStorage.getStore() ?? DEFAULT_LOCALE;
}
