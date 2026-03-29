'use client';

import { ReactNode } from 'react';
import { Header } from './Header';
import { MainLeftNav } from './MainLeftNav';
import { LobsterWidget } from './LobsterWidget';

interface MainLayoutProps {
  children: ReactNode;
  /** 首页等：纯色底，避免渐变切块感 */
  flatBackground?: boolean;
  /** 顶栏含多行标语时加大 main 顶部留白，避免被 fixed 顶栏遮挡 */
  spaciousHeader?: boolean;
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
  spaciousHeader,
  showSidebar,
  hideLeftNav,
  hideHeader,
}: MainLayoutProps) {
  const noLeftRail = Boolean(hideLeftNav) || showSidebar === false;
  const mainTop =
    hideHeader ? 'pt-0' : spaciousHeader ? 'pt-28 sm:pt-24' : 'pt-16';

  return (
    <div className="min-h-screen bg-void-950 bg-dot">
      {!hideHeader && <Header leftNav={!noLeftRail} />}

      <div className={mainTop}>
        {!noLeftRail && <MainLeftNav />}
        <main className={`min-w-0 ${!noLeftRail ? 'lg:pl-[220px] xl:pl-[240px]' : ''}`}>{children}</main>
      </div>

      {/* 虾米悬浮入口（/my-lobster 页面自动隐藏） */}
      <LobsterWidget />
    </div>
  );
}
