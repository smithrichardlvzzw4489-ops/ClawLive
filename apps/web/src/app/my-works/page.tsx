'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 已合并至 `/my-profile/works`，保留路由以兼容旧链接 */
export default function MyWorksRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/my-profile/works');
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-gray-500">
      <p>Redirecting…</p>
    </div>
  );
}
