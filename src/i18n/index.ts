import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import he from './he.json';

export const SUPPORTED_LANGS = ['en', 'he'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];


const initialLang: SupportedLang = 'he';

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he }
    },
    lng: initialLang,
    fallbackLng: 'he',
    interpolation: { escapeValue: false }
  });

export function isRtl(lang: string) {
  return lang === 'he';
}

export default i18n;
