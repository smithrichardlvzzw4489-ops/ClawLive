'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Locale, translations } from './translations';

const STORAGE_KEY = 'clawlive-locale';

function getNested(obj: object, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === 'zh' || stored === 'en') {
      setLocaleState(stored);
    }
    setMounted(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined' && mounted) {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    }
  }, [locale, mounted]);

  const t = useCallback(
    (key: string, params?: Record<string, string>) => {
      const msg = getNested(translations[locale], key) ?? key;
      if (!params) return msg;
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
        msg
      );
    },
    [locale]
  );

  if (!mounted) {
    return (
      <LocaleContext.Provider
        value={{ locale: 'zh', setLocale: () => {}, t }}
      >
        {children}
      </LocaleContext.Provider>
    );
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
