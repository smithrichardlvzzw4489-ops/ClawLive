'use client';

import { ReactNode } from 'react';
import { Header } from './Header';
import { MainLeftNav } from './MainLeftNav';
import { AgentChatWidget } from './AgentChatWidget';

interface MainLayoutProps {
  children: ReactNode;
  /** 首页等：纯色底，避免渐变切块感 */
  flatBackground?: boolean;
  /** 历史兼容：等价于 hideLeftNav */
  showSidebar?: boolean;
  /** 沉浸式页面（作品详情等）：不显示左侧导航栏 */
  hideLeftNav?: boolean;
  /** 不显示顶栏（如作品沉浸式阅读页） */
  hideHeader?: boolean;
}

export function MainLayout({
  children,
  flatBackground,
  showSidebar,
  hideLeftNav,
  hideHeader,
}: MainLayoutProps) {
  const noLeftRail = Boolean(hideLeftNav) || showSidebar === false;

  return (
    <div className={flatBackground ? 'min-h-screen bg-[#f5f5f5]' : 'min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50'}>
      {!hideHeader && <Header leftNav={!noLeftRail} />}

      <div className={hideHeader ? 'pt-0' : 'pt-16'}>
        {!noLeftRail && <MainLeftNav />}
        <main className={`min-w-0 ${!noLeftRail ? 'lg:pl-[220px] xl:pl-[240px]' : ''}`}>{children}</main>
      </div>

      {noLeftRail ? <AgentChatWidget /> : <div className="lg:hidden"><AgentChatWidget /></div>}
    </div>
  );
}
