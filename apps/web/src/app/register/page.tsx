'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function RegisterRedirect() {
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
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
        <p className="text-gray-600">跳转中...</p>
      </div>
    </div>
  );
}

/** 注册已整合到登录页，重定向到 /login */
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-lobster-light via-pink-100 to-purple-100 flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
            <p className="text-gray-600">跳转中...</p>
          </div>
        </div>
      }
    >
      <RegisterRedirect />
    </Suspense>
  );
}
