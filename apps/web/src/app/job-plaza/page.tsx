'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

const TOAST_KEY = 'jobPlazaToast';

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

function formatPostedAt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function JobPlazaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PostingCard[]>([]);
  const [mine, setMine] = useState<PostingCard[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    try {
      const list = (await api.jobPlaza.list({ limit: 50 })) as {
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

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TOAST_KEY);
      if (!raw) return;
      sessionStorage.removeItem(TOAST_KEY);
      const j = JSON.parse(raw) as { kind?: string; notified?: number };
      if (j.kind === 'published') {
        setToast(`已发布。已向约 ${j.notified ?? 0} 位匹配用户发送站内信通知。`);
      } else if (j.kind === 'draft') {
        setToast('已保存为草稿，可在下方「我发布的」中点击「发布」后再推送通知。');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const goPublish = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/job-plaza/new');
      return;
    }
    router.push('/job-plaza/new');
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
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div className="min-w-0">
              <h1 className="text-xl font-bold">招聘广场</h1>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-md">
                浏览在招职位；HR 与招聘方可发布 JD，系统会向画像匹配的开发者发送站内信。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => goPublish()}
                className="rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                发布职位
              </button>
              <Link href="/messages" className="text-sm text-violet-400 hover:text-violet-300 font-mono px-2">
                站内信
              </Link>
            </div>
          </div>

          {err && (
            <p className="text-sm text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-4">{err}</p>
          )}
          {toast && (
            <p className="text-sm text-emerald-300/95 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 mb-6">
              {toast}
            </p>
          )}

          <section className="mb-10">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">在招职位</h2>
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                <p className="text-sm text-slate-500">暂无公开职位。</p>
                <p className="text-xs text-slate-600 mt-2">成为第一个发布者，点击右上角「发布职位」。</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 hover:border-white/[0.12] transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/job-plaza/${p.id}`}
                          className="text-base font-semibold text-white hover:text-violet-200"
                        >
                          {p.title}
                        </Link>
                        <p className="text-[12px] text-slate-500 mt-1.5">
                          {(p.companyName || '公司未填') + ' · ' + (p.location || '地点未填')}
                          {p.author?.username ? ` · @${p.author.username}` : ''}
                          {p.publishedAt ? ` · ${formatPostedAt(p.publishedAt)}` : ''}
                        </p>
                        {p.matchTags?.length ? (
                          <p className="text-[11px] text-violet-400/80 font-mono mt-2">
                            {(p.matchTags ?? []).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                      <Link
                        href={`/job-plaza/${p.id}`}
                        className="text-[11px] font-mono text-violet-400 hover:text-violet-300 shrink-0"
                      >
                        查看 JD →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mine.length > 0 && (
            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-300">我发布的</h2>
                <button
                  type="button"
                  onClick={() => goPublish()}
                  className="text-[11px] font-mono text-violet-400 hover:text-violet-300"
                >
                  + 再发一条
                </button>
              </div>
              <ul className="space-y-2">
                {mine.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5"
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
        </div>
      </div>
    </MainLayout>
  );
}
