'use client';

import { ReactNode } from 'react';
import { Header } from './Header';

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
  /** 锁定单屏高度，仅 main 内滚动，避免整页 document 随滚轮上下滚动 */
  lockViewportHeight?: boolean;
}

export function MainLayout({
  children,
  flatBackground,
  spaciousHeader,
  showSidebar,
  hideLeftNav,
  hideHeader,
  lockViewportHeight,
}: MainLayoutProps) {
  const mainTop =
    hideHeader ? 'pt-0' : spaciousHeader ? 'pt-28 sm:pt-24' : 'pt-16';

  return (
    <div
      className={`${
        flatBackground ? 'bg-[#06080f]' : 'bg-void-950 bg-dot'
      } ${
        lockViewportHeight ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen'
      }`}
    >
      {!hideHeader && <Header />}

      <div
        className={`${mainTop} ${
          lockViewportHeight
            ? 'box-border h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden'
            : ''
        }`}
      >
        <main
          className={`min-w-0 ${
            lockViewportHeight
              ? 'h-full max-h-full min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]'
              : ''
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
