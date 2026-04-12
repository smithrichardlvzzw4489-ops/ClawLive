'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';

export default function RecruitmentNewJdPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [body, setBody] = useState('');
  const [matchTagsStr, setMatchTagsStr] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/recruitment/new');
    }
  }, [authLoading, user, router]);

  const handleCreateJd = async () => {
    if (!title.trim() || !body.trim()) {
      setErr('请填写标题与职位描述');
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const matchTags = matchTagsStr
        .split(/[,，、\n]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const data = (await api.recruitment.createJd({
        title: title.trim(),
        body: body.trim(),
        companyName: companyName || null,
        location: location || null,
        matchTags: matchTags.length ? matchTags : undefined,
      })) as { jd?: { id: string } };
      if (data.jd?.id) {
        router.replace(`/recruitment?select=${encodeURIComponent(data.jd.id)}`);
      }
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <MainLayout flatBackground>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-slate-400">加载中…</div>
      </MainLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <MainLayout flatBackground>
      <div className="mx-auto max-w-3xl px-4 py-8 text-slate-200">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/recruitment"
              className="text-sm text-violet-400 hover:text-violet-300 hover:underline"
            >
              ← 返回招聘管理
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-white">新建职位 JD</h1>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-500 text-xs">标题</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-500 text-xs">匹配标签（逗号分隔，可空则默认「招聘管理」）</span>
              <input
                value={matchTagsStr}
                onChange={(e) => setMatchTagsStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                placeholder="Rust, 后端, 上海"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-500 text-xs">公司</span>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-500 text-xs">地点</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm mt-4">
            <span className="text-slate-500 text-xs">职位描述</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm resize-y min-h-[200px]"
            />
          </label>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreateJd()}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white"
            >
              {creating ? '创建中…' : '创建'}
            </button>
            <Link
              href="/recruitment"
              className="inline-flex items-center rounded-xl border border-white/15 px-5 py-2 text-sm text-slate-400 hover:bg-white/[0.06]"
            >
              取消
            </Link>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
