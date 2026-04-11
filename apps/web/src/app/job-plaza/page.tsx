'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

type PostingCard = {
  id: string;
  authorId: string;
  title: string;
  companyName?: string | null;
  location?: string | null;
  body?: string;
  matchTags: string[];
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author?: { username: string; githubUsername?: string | null };
};

export default function JobPlazaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PostingCard[]>([]);
  const [mine, setMine] = useState<PostingCard[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [matchTagsRaw, setMatchTagsRaw] = useState('');
  const [body, setBody] = useState('');
  const [publishNow, setPublishNow] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    try {
      const list = (await api.jobPlaza.list({ limit: 30 })) as {
        items?: PostingCard[];
      };
      setItems(list.items ?? []);
      if (token) {
        try {
          const m = (await api.jobPlaza.mine()) as { items?: PostingCard[] };
          setMine(m.items ?? []);
        } catch {
          setMine([]);
        }
      } else {
        setMine([]);
      }
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/job-plaza');
      return;
    }
    setSubmitting(true);
    setErr(null);
    setToast(null);
    try {
      const res = (await api.jobPlaza.create({
        title,
        companyName: companyName || undefined,
        location: location || undefined,
        body,
        matchTags: matchTagsRaw,
        publish: publishNow,
      })) as { notified?: number };
      setToast(
        publishNow
          ? `已发布。已向约 ${res.notified ?? 0} 位匹配用户发送站内信通知。`
          : '已保存为草稿，可在下方「我的职位」中发布后推送通知。',
      );
      setTitle('');
      setCompanyName('');
      setLocation('');
      setMatchTagsRaw('');
      setBody('');
      await load();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MainLayout flatBackground>
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#06080f]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout flatBackground>
      <div className="min-h-[calc(100dvh-4rem)] bg-[#06080f] text-white px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl font-bold">招聘广场</h1>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
                发布职位描述并填写<strong className="text-slate-400">匹配标签</strong>
                （如 Rust、后端、机器学习）。发布后，系统会根据候选人在 GITLINK
                的画像标签与求职意向，向合适的人发送<strong className="text-slate-400">站内信</strong>
                ，每人每条 JD 仅通知一次。
              </p>
            </div>
            <Link href="/messages" className="text-sm text-violet-400 hover:text-violet-300 font-mono shrink-0">
              站内信 →
            </Link>
          </div>

          {err && (
            <p className="text-sm text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-4">{err}</p>
          )}
          {toast && (
            <p className="text-sm text-emerald-300/95 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 mb-4">
              {toast}
            </p>
          )}

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 mb-10">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">发布职位（HR / 招聘方）</h2>
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
                  rows={8}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500/40 resize-y min-h-[140px]"
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
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                {submitting ? '提交中…' : publishNow ? '发布' : '保存草稿'}
              </button>
            </form>
          </section>

          {mine.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">我的职位</h2>
              <ul className="space-y-2">
                {mine.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Link href={`/job-plaza/${m.id}`} className="text-sm font-medium text-violet-300 hover:text-violet-200">
                        {m.title}
                      </Link>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {m.status === 'published' ? '已发布' : m.status === 'closed' ? '已关闭' : '草稿'} ·{' '}
                        {(m.matchTags ?? []).join(', ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {m.status === 'draft' && (
                        <button
                          type="button"
                          className="text-[11px] font-mono rounded-lg bg-emerald-600/80 hover:bg-emerald-500 px-3 py-1.5"
                          onClick={() => {
                            void (async () => {
                              try {
                                const r = (await api.jobPlaza.publish(m.id)) as { notified?: number };
                                setToast(`已发布，站内信已推送给约 ${r.notified ?? 0} 人。`);
                                await load();
                              } catch (e) {
                                setErr(e instanceof APIError ? e.message : '发布失败');
                              }
                            })();
                          }}
                        >
                          发布
                        </button>
                      )}
                      {m.status !== 'closed' && (
                        <button
                          type="button"
                          className="text-[11px] font-mono rounded-lg border border-white/15 px-3 py-1.5 text-slate-300 hover:bg-white/[0.06]"
                          onClick={() => {
                            void (async () => {
                              try {
                                await api.jobPlaza.close(m.id);
                                setToast('已关闭该职位。');
                                await load();
                              } catch (e) {
                                setErr(e instanceof APIError ? e.message : '操作失败');
                              }
                            })();
                          }}
                        >
                          关闭
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-slate-200 mb-3">在招职位</h2>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">暂无公开职位。</p>
            ) : (
              <ul className="space-y-3">
                {items.map((p) => (
                  <li key={p.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <Link href={`/job-plaza/${p.id}`} className="text-sm font-semibold text-white hover:text-violet-200">
                      {p.title}
                    </Link>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {(p.companyName || '公司未填') + ' · ' + (p.location || '地点未填')}
                      {p.author?.username ? ` · @${p.author.username}` : ''}
                    </p>
                    {p.matchTags?.length ? (
                      <p className="text-[10px] text-slate-600 font-mono mt-2">{(p.matchTags ?? []).join(' · ')}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
