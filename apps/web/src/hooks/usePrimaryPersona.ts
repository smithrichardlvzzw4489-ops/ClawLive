'use client';

import { useCallback, useEffect, useState } from 'react';

export type PrimaryPersona = 'developer' | 'recruiter';

export const PRIMARY_PERSONA_STORAGE_KEY = 'clawlive-primary-persona';

function readPersona(): PrimaryPersona {
  if (typeof window === 'undefined') return 'developer';
  try {
    const v = localStorage.getItem(PRIMARY_PERSONA_STORAGE_KEY);
    if (v === 'developer' || v === 'recruiter') return v;
  } catch {
    /* ignore */
  }
  return 'developer';
}

export function usePrimaryPersona() {
  const [persona, setPersonaState] = useState<PrimaryPersona>('developer');

  useEffect(() => {
    setPersonaState(readPersona());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PRIMARY_PERSONA_STORAGE_KEY) return;
      if (e.newValue === 'developer' || e.newValue === 'recruiter') {
        setPersonaState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPersona = useCallback((next: PrimaryPersona) => {
    setPersonaState(next);
    try {
      localStorage.setItem(PRIMARY_PERSONA_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { persona, setPersona };
}
