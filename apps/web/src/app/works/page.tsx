'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 作品列表页已移除，重定向到首页 */
export default function WorksPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
        <p className="text-gray-600">跳转中...</p>
      </div>
    </div>
  );
}
