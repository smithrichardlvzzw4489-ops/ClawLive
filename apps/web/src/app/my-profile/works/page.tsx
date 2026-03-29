'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, resolveMediaUrl } from '@/lib/api';

interface UserWorkRow {
  id: string;
  title: string;
  lobsterName: string;
  status: 'draft' | 'published';
  coverImage?: string;
  publishedAt?: string;
  updatedAt?: string;
}

export default function MyProfileWorksPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [works, setWorks] = useState<UserWorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my-profile/works');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) {
        router.replace('/login?redirect=/my-profile/works');
        return;
      }
      const me = (await meRes.json()) as { id: string };
      const wRes = await fetch(
        `${API_BASE_URL}/api/works/user/${encodeURIComponent(me.id)}?includeDrafts=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!wRes.ok) {
        setError(t('workDetail.loadFailed'));
        setWorks([]);
        return;
      }
      const data = (await wRes.json()) as { works?: UserWorkRow[] };
      const list = Array.isArray(data.works) ? data.works : [];
      list.sort((a, b) => {
        const ta = new Date(b.updatedAt || b.publishedAt || 0).getTime();
        const tb = new Date(a.updatedAt || a.publishedAt || 0).getTime();
        return ta - tb;
      });
      setWorks(list);
    } catch {
      setError(t('workDetail.loadFailed'));
      setWorks([]);
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('myProfileCenter.worksPageTitle')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('myProfileCenter.worksPageIntro')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/my-profile"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              {t('myProfileCenter.worksBack')}
            </Link>
            <Link
              href="/works/create"
              className="rounded-xl bg-lobster px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-lobster-dark"
            >
              {t('myProfileCenter.worksEmptyCta')}
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
          </div>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : works.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 py-16 text-center">
            <p className="text-gray-600">{t('myProfileCenter.worksEmpty')}</p>
            <Link href="/works/create" className="mt-4 inline-block text-lobster font-semibold hover:underline">
              {t('myProfileCenter.worksEmptyCta')}
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">{t('myProfileCenter.worksColTitle')}</th>
                  <th className="hidden px-4 py-3 font-medium text-gray-600 sm:table-cell sm:w-32">
                    {t('myProfileCenter.worksColAgent')}
                  </th>
                  <th className="hidden px-4 py-3 font-medium text-gray-600 md:table-cell md:w-28">
                    {t('myProfileCenter.worksColStatus')}
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">{t('myProfileCenter.worksColActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {works.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {w.coverImage ? (
                          <img
                            src={resolveMediaUrl(w.coverImage)}
                            alt=""
                            className="h-10 w-14 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">
                            —
                          </div>
                        )}
                        <span className="min-w-0 font-medium text-gray-900 line-clamp-2">{w.title || '—'}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 sm:hidden">
                        {w.lobsterName} ·{' '}
                        {w.status === 'published' ? t('myWorks.published') : t('myWorks.drafts')}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-700 sm:table-cell">{w.lobsterName || '—'}</td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          w.status === 'published'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {w.status === 'published' ? t('myWorks.published') : t('myWorks.drafts')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/works/${w.id}`}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          {t('myProfileCenter.worksActionView')}
                        </Link>
                        <Link
                          href={`/works/${w.id}/studio`}
                          className="rounded-lg bg-lobster/10 px-2.5 py-1 text-xs font-semibold text-lobster transition hover:bg-lobster/15"
                        >
                          {t('myProfileCenter.worksActionStudio')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
