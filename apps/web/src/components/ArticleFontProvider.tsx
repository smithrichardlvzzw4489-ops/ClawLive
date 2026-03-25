'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ArticleFontPreset = 'system' | 'noto-sans' | 'noto-serif' | 'xiaowei';

const STORAGE_KEY = 'clawlive-article-font';

const PRESETS: ArticleFontPreset[] = ['system', 'noto-sans', 'noto-serif', 'xiaowei'];

function isPreset(v: string | null): v is ArticleFontPreset {
  return v !== null && PRESETS.includes(v as ArticleFontPreset);
}

type ArticleFontContextValue = {
  preset: ArticleFontPreset;
  setPreset: (p: ArticleFontPreset) => void;
};

const ArticleFontContext = createContext<ArticleFontContextValue | null>(null);

export function ArticleFontProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<ArticleFontPreset>('noto-sans');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (isPreset(raw)) setPresetState(raw);
    } catch {
      // ignore
    }
  }, []);

  const setPreset = useCallback((p: ArticleFontPreset) => {
    setPresetState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ preset, setPreset }), [preset, setPreset]);

  return <ArticleFontContext.Provider value={value}>{children}</ArticleFontContext.Provider>;
}

export function useArticleFont(): ArticleFontContextValue {
  const ctx = useContext(ArticleFontContext);
  if (!ctx) {
    return {
      preset: 'noto-sans',
      setPreset: () => {},
    };
  }
  return ctx;
}

export const articleFontPresetClass: Record<ArticleFontPreset, string> = {
  system: 'font-sans',
  'noto-sans': 'font-article-sans',
  'noto-serif': 'font-article-serif',
  xiaowei: 'font-article-display',
};
