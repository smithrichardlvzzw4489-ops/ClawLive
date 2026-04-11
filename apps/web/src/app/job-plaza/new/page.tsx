'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

const TOAST_KEY = 'jobPlazaToast';

export default function JobPlazaNewPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [matchTagsRaw, setMatchTagsRaw] = useState('');
  const [body, setBody] = useState('');
  const [publishNow, setPublishNow] = useState(true);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/job-plaza/new');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = (await api.jobPlaza.create({
        title,
        companyName: companyName || undefined,
        location: location || undefined,
        body,
        matchTags: matchTagsRaw,
        publish: publishNow,
      })) as { notified?: number };
      try {
        sessionStorage.setItem(
          TOAST_KEY,
          JSON.stringify({
            kind: publishNow ? 'published' : 'draft',
            notified: res.notified ?? 0,
          }),
        );
      } catch {
        /* ignore */
      }
      router.push('/job-plaza');
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout flatBackground>
      <div className="min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <Link href="/job-plaza" className="text-sm text-violet-400 hover:text-violet-300 font-mono">
              ← 返回招聘广场
            </Link>
            <h1 className="text-xl font-bold mt-4">发布职位</h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              填写<strong className="text-slate-400">匹配标签</strong>（如 Rust、后端、上海）后发布，系统会向画像匹配的候选人发送站内信，每人每条 JD
              仅通知一次。
            </p>
          </div>

          {err && (
            <p className="text-sm text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-4">{err}</p>
          )}

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">职位标题 *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500/40"
                  placeholder="例如：高级后端工程师"
                  maxLength={200}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 mb-1">公司</label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500/40"
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-500 mb-1">地点</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500/40"
                    placeholder="选填，如 上海 / 远程"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">匹配标签 *（逗号分隔）</label>
                <input
                  value={matchTagsRaw}
                  onChange={(e) => setMatchTagsRaw(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500/40 font-mono"
                  placeholder="Rust, PostgreSQL, 分布式, 后端"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-1">职位描述 *</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500/40 resize-y min-h-[180px]"
                  placeholder="职责、要求、薪资范围、联系方式等"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={publishNow}
                  onChange={(e) => setPublishNow(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-violet-500 focus:ring-violet-500/30"
                />
                立即发布并向匹配用户发送站内信
              </label>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
                >
                  {submitting ? '提交中…' : publishNow ? '发布' : '保存草稿'}
                </button>
                <Link
                  href="/job-plaza"
                  className="inline-flex items-center rounded-xl border border-white/15 px-5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]"
                >
                  取消
                </Link>
              </div>
            </form>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
