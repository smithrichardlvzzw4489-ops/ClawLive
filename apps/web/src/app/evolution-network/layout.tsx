'use client';

import type { ReactNode } from 'react';
import { EvolutionNetworkSessionProvider } from '@/contexts/EvolutionNetworkSessionContext';

export default function EvolutionNetworkLayout({ children }: { children: ReactNode }) {
  return <EvolutionNetworkSessionProvider>{children}</EvolutionNetworkSessionProvider>;
}
