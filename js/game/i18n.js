// Language dictionaries and lookup. Every UI string lives in js/i18n/<lang>.js.
// To add a language: add a file with the same keys, import it here and add it
// to DICTS and LANG_NAMES (the settings sheet lists every entry of LANG_NAMES).
import en from '../i18n/en.js';
import tr from '../i18n/tr.js';

export const DICTS = { en, tr };
export const DEFAULT_LANG = 'en';
// Shown in the language picker in each language's own name.
export const LANG_NAMES = { en: 'English', tr: 'Türkçe' };

export function dict(lang) {
  return DICTS[lang] || DICTS[DEFAULT_LANG];
}

// Pick a language from the phone settings (navigator.languages), English otherwise.
export function detectLang(languages) {
  let list = languages;
  if (!list) {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      list = nav ? (nav.languages && nav.languages.length ? nav.languages : [nav.language]) : [];
    } catch {
      list = [];
    }
  }
  for (const l of list || []) {
    if (typeof l !== 'string') continue;
    const code = l.toLowerCase().split(/[-_]/)[0];
    if (DICTS[code]) return code;
  }
  return DEFAULT_LANG;
}

// t('goal.sold', { n: '25' }, 'tr'). Missing keys fall back to English, then the key.
export function t(lang, key, params) {
  let s = dict(lang)[key];
  if (s === undefined) s = DICTS[DEFAULT_LANG][key];
  if (s === undefined) return key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  }
  return s;
}

// Locale-correct upper case (Turkish i -> İ).
export function upper(lang, s) {
  try { return s.toLocaleUpperCase(lang); } catch { return s.toUpperCase(); }
}
