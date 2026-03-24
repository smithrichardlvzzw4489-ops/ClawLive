'use client';

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { translations } from './translations';

const ZH = translations.zh;

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
  locale: 'zh';
  t: (key: string, params?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'zh-CN';
    }
    try {
      localStorage.removeItem('clawlive-locale');
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string>) => {
    const msg = getNested(ZH, key) ?? key;
    if (!params) return msg;
    return Object.entries(params).reduce(
      (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
      msg
    );
  }, []);

  return (
    <LocaleContext.Provider value={{ locale: 'zh', t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
