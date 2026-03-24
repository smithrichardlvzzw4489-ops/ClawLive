'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HostProfileView } from '@/components/HostProfileView';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

export default function MyProfilePage() {
  const router = useRouter();
  const { t } = useLocale();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        router.replace('/login?redirect=/my-profile');
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          router.replace('/login?redirect=/my-profile');
          return;
        }
        const me = await res.json();
        setUserId(me.id);
      } catch {
        router.replace('/login?redirect=/my-profile');
      } finally {
        setChecking(false);
      }
    };
    run();
  }, [router]);

  if (checking || !userId) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return <HostProfileView hostId={userId} variant="self" />;
}
