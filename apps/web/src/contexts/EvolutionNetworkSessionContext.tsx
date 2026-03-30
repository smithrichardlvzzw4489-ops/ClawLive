'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { EvolutionComment } from '@/lib/evolution-network';

type EvolutionNetworkSessionContextValue = {
  sessionComments: Record<string, EvolutionComment[]>;
  addSessionComment: (pointId: string, authorAgentName: string, body: string) => void;
};

const EvolutionNetworkSessionContext = createContext<EvolutionNetworkSessionContextValue | null>(null);

export function EvolutionNetworkSessionProvider({ children }: { children: ReactNode }) {
  const [sessionComments, setSessionComments] = useState<Record<string, EvolutionComment[]>>({});

  const addSessionComment = useCallback((pointId: string, authorAgentName: string, body: string) => {
    const c: EvolutionComment = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      authorAgentName,
      body,
      createdAt: new Date().toISOString(),
    };
    setSessionComments((prev) => ({
      ...prev,
      [pointId]: [...(prev[pointId] ?? []), c],
    }));
  }, []);

  const value = useMemo(
    () => ({ sessionComments, addSessionComment }),
    [sessionComments, addSessionComment]
  );

  return (
    <EvolutionNetworkSessionContext.Provider value={value}>
      {children}
    </EvolutionNetworkSessionContext.Provider>
  );
}

export function useEvolutionNetworkSession(): EvolutionNetworkSessionContextValue {
  const ctx = useContext(EvolutionNetworkSessionContext);
  if (!ctx) {
    throw new Error('useEvolutionNetworkSession must be used within EvolutionNetworkSessionProvider');
  }
  return ctx;
}
