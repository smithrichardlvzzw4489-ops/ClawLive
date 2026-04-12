'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';

type CandidateRow = {
  id: string;
  githubUsername: string;
  displayName: string | null;
  email: string | null;
  notes: string | null;
  pipelineStage: string;
  createdAt: string;
  updatedAt: string;
};

type JdRow = {
  id: string;
  title: string;
  companyName: string | null;
  location: string | null;
  body: string;
  matchTags: string[];
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  candidates: CandidateRow[];
};

type RecommendHit = {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  score: number;
  reason: string;
  stats: { totalPublicRepos: number; totalStars: number; followers: number };
  location: string | null;
};

function RecruitmentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [stages, setStages] = useState<string[]>([]);
  const [items, setItems] = useState<JdRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [body, setBody] = useState('');
  const [matchTagsStr, setMatchTagsStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newGh, setNewGh] = useState('');
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendHits, setRecommendHits] = useState<RecommendHit[] | null>(null);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

  const loadAll = useCallback(async () => {
    setErr(null);
    const [stRes, listRes] = await Promise.all([
      api.recruitment.pipelineStages() as Promise<{ stages?: string[] }>,
      api.recruitment.listJds() as Promise<{ items?: JdRow[] }>,
    ]);
    setStages(stRes.stages ?? []);
    setItems(listRes.items ?? []);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/recruitment');
      return;
    }
    setLoading(true);
    loadAll()
      .catch((e: unknown) => {
        setErr(e instanceof APIError ? e.message : '加载失败');
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, router, loadAll]);

  useEffect(() => {
    const id = searchParams.get('select');
    if (!id || items.length === 0) return;
    if (!items.some((x) => x.id === id)) return;
    setSelectedId(id);
    setRecommendHits(null);
    router.replace('/recruitment', { scroll: false });
  }, [searchParams, items, router]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setCompanyName(selected.companyName ?? '');
    setLocation(selected.location ?? '');
    setBody(selected.body);
    setMatchTagsStr(selected.matchTags.join('、'));
  }, [selected]);

  const syncItem = (jd: JdRow) => {
    setItems((prev) => prev.map((x) => (x.id === jd.id ? jd : x)));
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setRecommendHits(null);
    setErr(null);
  };

  const handleSaveJd = async () => {
    if (!selectedId) return;
    setSaving(true);
    setErr(null);
    try {
      const matchTags = matchTagsStr
        .split(/[,，、\n]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const data = (await api.recruitment.updateJd(selectedId, {
        title,
        body,
        companyName: companyName || null,
        location: location || null,
        matchTags,
      })) as { jd?: JdRow };
      if (data.jd) syncItem(data.jd);
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJd = async () => {
    if (!selectedId || !confirm('确定删除该 JD 及全部候选人记录？')) return;
    setSaving(true);
    setErr(null);
    try {
      await api.recruitment.deleteJd(selectedId);
      setItems((prev) => prev.filter((x) => x.id !== selectedId));
      setSelectedId(null);
      setRecommendHits(null);
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const patchCandidate = async (
    cid: string,
    patch: { displayName?: string | null; email?: string | null; notes?: string | null; pipelineStage?: string },
  ) => {
    if (!selectedId) return;
    try {
      const data = (await api.recruitment.updateCandidate(selectedId, cid, patch)) as { candidate?: CandidateRow };
      if (data.candidate) {
        setItems((prev) =>
          prev.map((jd) =>
            jd.id !== selectedId
              ? jd
              : {
                  ...jd,
                  candidates: jd.candidates.map((c) => (c.id === cid ? data.candidate! : c)),
                },
          ),
        );
      }
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '更新候选人失败');
    }
  };

  const handleAddCandidate = async () => {
    if (!selectedId) return;
    const gh = newGh.trim().replace(/^@/, '');
    if (!gh) return;
    setErr(null);
    try {
      const data = (await api.recruitment.addCandidate(selectedId, { githubUsername: gh })) as {
        candidate?: CandidateRow;
      };
      if (data.candidate) {
        setItems((prev) =>
          prev.map((jd) =>
            jd.id !== selectedId ? jd : { ...jd, candidates: [data.candidate!, ...jd.candidates] },
          ),
        );
        setNewGh('');
      }
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '添加失败');
    }
  };

  const handleDeleteCandidate = async (cid: string) => {
    if (!selectedId || !confirm('从该 JD 移除该候选人？')) return;
    try {
      await api.recruitment.deleteCandidate(selectedId, cid);
      setItems((prev) =>
        prev.map((jd) =>
          jd.id !== selectedId ? jd : { ...jd, candidates: jd.candidates.filter((c) => c.id !== cid) },
        ),
      );
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '删除失败');
    }
  };

  const handleRecommend = async () => {
    if (!selectedId) return;
    setRecommendLoading(true);
    setRecommendHits(null);
    setErr(null);
    try {
      const data = (await api.recruitment.recommend(selectedId, { limit: 15 })) as { results?: RecommendHit[] };
      setRecommendHits(data.results ?? []);
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '推荐失败');
    } finally {
      setRecommendLoading(false);
    }
  };

  const addFromRecommend = async (gh: string) => {
    if (!selectedId) return;
    try {
      const data = (await api.recruitment.addCandidate(selectedId, { githubUsername: gh })) as {
        candidate?: CandidateRow;
      };
      if (data.candidate) {
        setItems((prev) =>
          prev.map((jd) =>
            jd.id !== selectedId ? jd : { ...jd, candidates: [data.candidate!, ...jd.candidates] },
          ),
        );
      }
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '加入候选人失败（可能已存在）');
    }
  };

  if (authLoading || loading) {
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
      <div className="mx-auto max-w-7xl px-4 py-8 text-slate-200">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">招聘管理</h1>
            <p className="text-sm text-slate-500 mt-1">管理 JD、候选人流程状态；智能推荐消耗与 LINK 相同的搜索额度。</p>
          </div>
          <Link
            href="/recruitment/new"
            className="inline-flex items-center rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white"
          >
            新建 JD
          </Link>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 max-h-[70vh] overflow-y-auto">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">我的 JD</p>
            <ul className="space-y-1">
              {items.map((jd) => (
                <li key={jd.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(jd.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      selectedId === jd.id
                        ? 'bg-violet-600/30 text-white ring-1 ring-violet-500/40'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                    }`}
                  >
                    <span className="line-clamp-2">{jd.title}</span>
                    <span className="block text-[10px] text-slate-600 mt-0.5">
                      {jd.status === 'published' ? '已发布' : jd.status === 'closed' ? '已关闭' : '草稿'} ·{' '}
                      {jd.candidates.length} 人
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length === 0 && (
              <p className="text-xs text-slate-600 mt-4 px-1">
                暂无 JD，点击右上方
                <Link href="/recruitment/new" className="text-violet-400 hover:underline mx-0.5">
                  新建
                </Link>
                。
              </p>
            )}
          </aside>

          <main className="min-w-0 space-y-6">
            {selected ? (
              <>
                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-white">编辑 JD</h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveJd()}
                        className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium"
                      >
                        保存 JD
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleDeleteJd()}
                        className="rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 px-4 py-1.5 text-sm"
                      >
                        删除 JD
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-slate-500 text-xs">标题</span>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-slate-500 text-xs">匹配标签（逗号分隔）</span>
                      <input
                        value={matchTagsStr}
                        onChange={(e) => setMatchTagsStr(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-500 text-xs">公司</span>
                      <input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
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
                      rows={10}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm resize-y min-h-[180px]"
                    />
                  </label>
                  <p className="text-[10px] text-slate-600 mt-2">
                    状态：{selected.status === 'published' ? '已发布（广场可见）' : selected.status === 'closed' ? '已关闭' : '草稿'}
                    。发布/关闭请在「招聘广场」流程中操作或使用既有 job-plaza API。
                  </p>
                </section>

                <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-cyan-100">岗位智能推荐</h2>
                    <button
                      type="button"
                      disabled={recommendLoading || selected.status === 'closed'}
                      onClick={() => void handleRecommend()}
                      className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
                    >
                      {recommendLoading ? '分析中…' : '根据本 JD 推荐候选人'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    使用 JD 标题、正文与匹配标签拼接为检索语，走与 LINK 相同的 GitHub 语义搜人；每次点击消耗 1 次搜索额度。
                  </p>
                  {recommendHits && recommendHits.length === 0 && (
                    <p className="text-sm text-slate-500">未返回结果，可尝试补充匹配标签或调整 JD 描述。</p>
                  )}
                  {recommendHits && recommendHits.length > 0 && (
                    <ul className="space-y-2 max-h-80 overflow-y-auto">
                      {recommendHits.map((h) => (
                        <li
                          key={h.githubUsername}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={h.avatarUrl} alt="" className="h-9 w-9 rounded-lg border border-white/10" />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-white">@{h.githubUsername}</span>
                            <span className="text-violet-400 text-xs ml-2">{(h.score * 100).toFixed(0)}%</span>
                            <p className="text-[11px] text-slate-500 line-clamp-1">{h.reason}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Link
                              href={`/codernet/github/${encodeURIComponent(h.githubUsername)}`}
                              className="text-xs text-violet-300 hover:underline"
                            >
                              画像
                            </Link>
                            <button
                              type="button"
                              onClick={() => void addFromRecommend(h.githubUsername)}
                              className="text-xs rounded bg-white/10 hover:bg-white/15 px-2 py-1"
                            >
                              加入候选人
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">候选人</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <input
                      value={newGh}
                      onChange={(e) => setNewGh(e.target.value)}
                      placeholder="GitHub 用户名"
                      className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono flex-1 min-w-[160px]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddCandidate()}
                      className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
                    >
                      添加
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-white/10">
                          <th className="py-2 pr-3">GitHub</th>
                          <th className="py-2 pr-3">状态</th>
                          <th className="py-2 pr-3">备注</th>
                          <th className="py-2 w-24">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.candidates.map((c) => (
                          <tr key={c.id} className="border-b border-white/[0.06] align-top">
                            <td className="py-2 pr-3">
                              <Link
                                href={`/codernet/github/${encodeURIComponent(c.githubUsername)}`}
                                className="font-mono text-violet-300 hover:underline"
                              >
                                @{c.githubUsername}
                              </Link>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                value={c.pipelineStage}
                                onChange={(e) => void patchCandidate(c.id, { pipelineStage: e.target.value })}
                                className="rounded border border-white/15 bg-black/40 px-2 py-1 text-xs max-w-[8rem]"
                              >
                                {stages.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <textarea
                                key={`${c.id}-${c.updatedAt}`}
                                defaultValue={c.notes ?? ''}
                                rows={2}
                                className="w-full min-w-[140px] max-w-xs rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v !== (c.notes ?? '')) void patchCandidate(c.id, { notes: v || null });
                                }}
                              />
                            </td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() => void handleDeleteCandidate(c.id)}
                                className="text-xs text-red-400 hover:underline"
                              >
                                移除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selected.candidates.length === 0 && (
                    <p className="text-sm text-slate-600 mt-2">暂无候选人，可手动添加或使用上方智能推荐。</p>
                  )}
                </section>
              </>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center text-slate-400">
                <p className="mb-4">还没有职位 JD。</p>
                <Link
                  href="/recruitment/new"
                  className="inline-flex rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm font-semibold text-white"
                >
                  新建职位 JD
                </Link>
              </div>
            ) : (
              <p className="text-slate-500">请从左侧选择一个 JD，或点击右上方「新建 JD」。</p>
            )}
          </main>
        </div>
      </div>
    </MainLayout>
  );
}

export default function RecruitmentPage() {
  return (
    <Suspense
      fallback={
        <MainLayout flatBackground>
          <div className="mx-auto max-w-6xl px-4 py-16 text-center text-slate-400">加载中…</div>
        </MainLayout>
      }
    >
      <RecruitmentPageContent />
    </Suspense>
  );
}
