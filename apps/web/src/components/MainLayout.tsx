'use client';

import { ReactNode } from 'react';
import { Header } from './Header';
import { AgentChatWidget } from './AgentChatWidget';

interface MainLayoutProps {
  children: ReactNode;
  /** 首页等：纯色底，避免渐变切块感 */
  flatBackground?: boolean;
  /** 历史遗留：部分页面传入，可忽略 */
  showSidebar?: boolean;
}

export function MainLayout({ children, flatBackground }: MainLayoutProps) {
  return (
    <div className={flatBackground ? 'min-h-screen bg-[#f5f5f5]' : 'min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50'}>
      <Header />

      <div className="pt-16">
        <main>
          {children}
        </main>
      </div>

      <AgentChatWidget />
    </div>
  );
}
