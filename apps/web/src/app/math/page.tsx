'use client';

import { MainLayout } from '@/components/MainLayout';
import { MathMatchPanel } from '@/components/math/MathMatchPanel';

/** 独立 MATH 页（求职者模式无 hub 时使用；亦为旧书签 /math 的落点） */
export default function MathPage() {
  return (
    <MainLayout flatBackground>
      <div className="mx-auto w-full max-w-6xl px-0 py-6 sm:px-2 sm:py-8">
        <MathMatchPanel />
      </div>
    </MainLayout>
  );
}
