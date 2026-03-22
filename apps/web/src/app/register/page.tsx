'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** 注册已整合到登录页，重定向到 /login */
export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    const url = redirect && redirect.startsWith('/') ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
    router.replace(url);
  }, [router, redirect]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-lobster-light via-pink-100 to-purple-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin text-6xl mb-4">🦞</div>
        <p className="text-gray-600">跳转中...</p>
      </div>
    </div>
  );
}
