import { getLocale } from './locale.context';

export function translate(en: string, ar: string): string {
  return getLocale() === 'ar' ? ar : en;
}
