'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PrimaryPersona = 'unset' | 'developer' | 'recruiter';

export const PRIMARY_PERSONA_STORAGE_KEY = 'clawlive-primary-persona';

function readPersonaFromStorage(): PrimaryPersona {
  if (typeof window === 'undefined') return 'unset';
  try {
    const v = localStorage.getItem(PRIMARY_PERSONA_STORAGE_KEY);
    if (v === 'developer' || v === 'recruiter') return v;
  } catch {
    /* ignore */
  }
  return 'unset';
}

type Ctx = {
  persona: PrimaryPersona;
  /** 已从 localStorage 同步，避免首屏与客户端不一致时误渲染 */
  personaReady: boolean;
  setPersona: (next: 'developer' | 'recruiter') => void;
  clearPersona: () => void;
};

const PrimaryPersonaContext = createContext<Ctx | null>(null);

export function PrimaryPersonaProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<PrimaryPersona>('unset');
  const [personaReady, setPersonaReady] = useState(false);

  useLayoutEffect(() => {
    setPersonaState(readPersonaFromStorage());
    setPersonaReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PRIMARY_PERSONA_STORAGE_KEY) return;
      if (e.newValue === 'developer' || e.newValue === 'recruiter') {
        setPersonaState(e.newValue);
      } else {
        setPersonaState('unset');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPersona = useCallback((next: 'developer' | 'recruiter') => {
    setPersonaState(next);
    try {
      localStorage.setItem(PRIMARY_PERSONA_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const clearPersona = useCallback(() => {
    setPersonaState('unset');
    try {
      localStorage.removeItem(PRIMARY_PERSONA_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ persona, personaReady, setPersona, clearPersona }),
    [persona, personaReady, setPersona, clearPersona],
  );

  return <PrimaryPersonaContext.Provider value={value}>{children}</PrimaryPersonaContext.Provider>;
}

export function usePrimaryPersona(): Ctx {
  const ctx = useContext(PrimaryPersonaContext);
  if (!ctx) {
    throw new Error('usePrimaryPersona must be used within PrimaryPersonaProvider');
  }
  return ctx;
}
