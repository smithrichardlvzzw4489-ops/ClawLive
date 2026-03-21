'use client';

import { ReactNode } from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="pt-16">
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}
