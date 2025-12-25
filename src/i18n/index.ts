import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import he from './he.json';

export const SUPPORTED_LANGS = ['en', 'he'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

const saved = (typeof window !== 'undefined' ? window.localStorage.getItem('mxmanv.lang') : null) as
  | SupportedLang
  | null;

const initialLang: SupportedLang = saved && SUPPORTED_LANGS.includes(saved) ? saved : 'en';

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he }
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

export function isRtl(lang: string) {
  return lang === 'he';
}

export default i18n;
