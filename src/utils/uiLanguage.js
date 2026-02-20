import { useEffect, useState } from 'react';

const LANG_KEY = 'uiLanguage';
const SUPPORTED = new Set(['fr', 'en', 'ar']);

export function getUiLanguage() {
  const fromSession = sessionStorage.getItem(LANG_KEY);
  const fromLocal = localStorage.getItem(LANG_KEY);
  const lang = (fromSession || fromLocal || 'fr').toLowerCase();
  return SUPPORTED.has(lang) ? lang : 'fr';
}

export function isRtlLanguage(lang) {
  return lang === 'ar';
}

export function applyUiLanguage(lang) {
  const current = SUPPORTED.has(lang) ? lang : 'fr';
  document.documentElement.lang = current;
  document.documentElement.dir = isRtlLanguage(current) ? 'rtl' : 'ltr';
}

export function setUiLanguage(lang) {
  const current = SUPPORTED.has(lang) ? lang : 'fr';
  sessionStorage.setItem(LANG_KEY, current);
  localStorage.setItem(LANG_KEY, current);
  applyUiLanguage(current);
  window.dispatchEvent(new Event('ui-language-changed'));
}

export function useUiLanguage() {
  const [language, setLanguage] = useState(getUiLanguage());

  useEffect(() => {
    applyUiLanguage(language);
  }, [language]);

  useEffect(() => {
    const sync = () => setLanguage(getUiLanguage());
    window.addEventListener('ui-language-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ui-language-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return language;
}

