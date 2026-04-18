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
  firstRecommendAt?: string | null;
  lastDailyRecommendAt?: string | null;
  recommendBootstrapPending?: boolean;
  recommendBootstrapOutcome?: string;
  recommendBootstrapLastPhase?: string | null;
  recommendBootstrapLastOk?: boolean | null;
  pendingRecommendCount?: number;
  backlogRecommendCount?: number;
  createdAt: string;
  updatedAt: string;
  candidates: CandidateRow[];
};

type BootstrapTraceStep = {
  at: string;
  phase: string;
  ok: boolean;
  detail?: string;
  meta?: Record<string, unknown>;
};

function bootstrapPhaseLabel(phase: string): string {
  const m: Record<string, string> = {
    claimed: '已认领首轮任务',
    abort_jd_missing_or_closed: '中止：JD 不存在或已关闭',
    abort_quota: '中止：招聘推荐额度不足',
    abort_no_github_token: '中止：未配置服务端 GitHub Token',
    search_started: '检索已开始',
    search_done: '检索已结束',
    persisting: '正在写入待查看池 / 后备池',
    complete: '首轮引导已完成',
    error: '执行异常',
  };
  return m[phase] ?? phase;
}

function bootstrapOutcomeLabel(outcome: string | undefined): string {
  const m: Record<string, string> = {
    idle: '无记录',
    running: '执行中',
    succeeded: '已成功',
    aborted: '已中止（业务条件）',
    failed: '失败（见末步）',
    stuck: '可能中断（标记超时或进程未写完）',
  };
  return outcome ? m[outcome] ?? outcome : '—';
}

type RecommendHit = {
  githubUsername: string;
  avatarUrl: string;
  oneLiner: string;
  techTags: string[];
  score: number;
  reason: string;
  stats: { totalPublicRepos: number; totalStars: number; followers: number };
  location: string | null;
  source?: string;
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
  const [poolPending, setPoolPending] = useState<RecommendHit[] | null>(null);
  const [poolQueueMeta, setPoolQueueMeta] = useState<{
    firstRecommendAt: string | null;
    lastDailyRecommendAt: string | null;
    backlogCount: number;
    recommendBootstrapPending: boolean;
    recommendBootstrapOutcome?: string;
    recommendBootstrapLastPhase?: string | null;
    recommendBootstrapLastOk?: boolean | null;
    recommendBootstrapTrace?: BootstrapTraceStep[];
  } | null>(null);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

  const loadRecommendQueue = useCallback(async (jid: string) => {
    try {
      const data = await api.recruitment.recommendQueue(jid);
      const raw = data.pending;
      const hits: RecommendHit[] = Array.isArray(raw)
        ? raw
            .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
            .map((o) => ({
              githubUsername: String(o.githubUsername ?? ''),
              avatarUrl: String(o.avatarUrl ?? ''),
              oneLiner: String(o.oneLiner ?? ''),
              techTags: Array.isArray(o.techTags) ? o.techTags.filter((t): t is string => typeof t === 'string') : [],
              score: typeof o.score === 'number' ? o.score : 0,
              reason: String(o.reason ?? ''),
              stats: {
                totalPublicRepos: Number((o.stats as { totalPublicRepos?: unknown })?.totalPublicRepos) || 0,
                totalStars: Number((o.stats as { totalStars?: unknown })?.totalStars) || 0,
                followers: Number((o.stats as { followers?: unknown })?.followers) || 0,
              },
              location: typeof o.location === 'string' ? o.location : null,
              source: typeof o.source === 'string' ? o.source : undefined,
            }))
            .filter((h) => h.githubUsername)
        : [];
      setPoolPending(hits);
      const traceRaw = data.recommendBootstrapTrace;
      const trace: BootstrapTraceStep[] = Array.isArray(traceRaw)
        ? traceRaw
            .filter((x) => x != null && typeof x === 'object')
            .map((x) => {
              const o = x as Record<string, unknown>;
              return {
              at: typeof o.at === 'string' ? o.at : '',
              phase: typeof o.phase === 'string' ? o.phase : '',
              ok: o.ok === true,
              detail: typeof o.detail === 'string' ? o.detail : undefined,
              meta: o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta) ? (o.meta as Record<string, unknown>) : undefined,
              };
            })
            .filter((s) => s.at && s.phase)
        : [];
      setPoolQueueMeta({
        firstRecommendAt: data.firstRecommendAt ?? null,
        lastDailyRecommendAt: data.lastDailyRecommendAt ?? null,
        backlogCount: typeof data.backlogCount === 'number' ? data.backlogCount : 0,
        recommendBootstrapPending: Boolean(data.recommendBootstrapPending),
        recommendBootstrapOutcome: typeof data.recommendBootstrapOutcome === 'string' ? data.recommendBootstrapOutcome : undefined,
        recommendBootstrapLastPhase:
          data.recommendBootstrapLastPhase === null || typeof data.recommendBootstrapLastPhase === 'string'
            ? data.recommendBootstrapLastPhase
            : null,
        recommendBootstrapLastOk:
          typeof data.recommendBootstrapLastOk === 'boolean' ? data.recommendBootstrapLastOk : null,
        recommendBootstrapTrace: trace,
      });
    } catch {
      setPoolPending(null);
      setPoolQueueMeta(null);
    }
  }, []);

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

  useEffect(() => {
    if (!selectedId) {
      setPoolPending(null);
      setPoolQueueMeta(null);
      return;
    }
    void loadRecommendQueue(selectedId);
  }, [selectedId, loadRecommendQueue]);

  useEffect(() => {
    if (!selected?.recommendBootstrapPending || !selectedId) return;
    const timer = setInterval(() => {
      void loadAll().then(() => {
        void loadRecommendQueue(selectedId);
      });
    }, 5_000);
    return () => clearInterval(timer);
  }, [selected?.recommendBootstrapPending, selectedId, loadAll, loadRecommendQueue]);

  const syncItem = (jd: JdRow) => {
    setItems((prev) => prev.map((x) => (x.id === jd.id ? jd : x)));
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
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
        void loadRecommendQueue(selectedId);
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
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">招聘管理</h1>
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

        <div className={`grid gap-6 ${items.length > 0 ? 'lg:grid-cols-[240px_1fr]' : ''}`}>
          {items.length > 0 && (
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
            </aside>
          )}

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
                    状态：{selected.status === 'published' ? '已发布（职位列表可见）' : selected.status === 'closed' ? '已关闭' : '草稿'}
                    。新建 JD 默认已发布；关闭职位可在职位详情或 job-plaza API 操作。
                  </p>
                </section>

                <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
                  <h2 className="text-lg font-semibold text-cyan-100 mb-3">岗位智能推荐</h2>
                  <p className="text-xs text-slate-500 mb-3">
                    与 LINK 相同流水线，扣「招聘推荐」月度额度（全员有免费试用额度）。新建 JD 后系统会自动首轮检索。每日北京时间 8:00（可配 RECRUIT_DAILY_CRON / RECRUIT_DAILY_TZ）后台向下方「待查看池」写入最多 10 人；backlog 用尽时会自动补缺检索。
                  </p>
                  {selected?.recommendBootstrapPending ? (
                    <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                      正在后台执行首轮智能推荐（约每 5 秒刷新进度）；完成后候选人将出现在「待查看池」。
                    </div>
                  ) : null}
                  {poolQueueMeta &&
                    (poolQueueMeta.recommendBootstrapTrace?.length ||
                      poolQueueMeta.recommendBootstrapOutcome) ? (
                    <div className="mb-4 rounded-xl border border-white/[0.12] bg-black/20 px-3 py-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-slate-300 mb-2">
                        <span className="font-medium text-slate-200">首轮引导执行记录</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
                          {bootstrapOutcomeLabel(poolQueueMeta.recommendBootstrapOutcome)}
                        </span>
                        {poolQueueMeta.recommendBootstrapLastPhase ? (
                          <span className="text-slate-500">
                            末步：{bootstrapPhaseLabel(poolQueueMeta.recommendBootstrapLastPhase)}
                            {poolQueueMeta.recommendBootstrapLastOk === false ? ' · 未成功' : ''}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-slate-600 mb-2">
                        以下步骤由服务端写入数据库，用于定位「卡在哪一步 / 为何中止」，非前端推测。
                      </p>
                      {poolQueueMeta.recommendBootstrapTrace && poolQueueMeta.recommendBootstrapTrace.length > 0 ? (
                        <ul className="max-h-40 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-400 border-t border-white/[0.06] pt-2">
                          {poolQueueMeta.recommendBootstrapTrace.map((s, i) => (
                            <li key={`${s.at}-${i}`} className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <span className="text-slate-600 shrink-0">{new Date(s.at).toLocaleString('zh-CN')}</span>
                              <span className={s.ok ? 'text-emerald-400/90' : 'text-rose-300/90'}>
                                {bootstrapPhaseLabel(s.phase)}
                              </span>
                              {s.detail ? <span className="text-slate-500 break-all">— {s.detail}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-600">暂无分步记录（可能尚未认领任务或库未迁移）。</p>
                      )}
                    </div>
                  ) : null}
                  {poolPending && poolPending.length > 0 && (
                    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      待查看池共 {poolPending.length} 人
                      {poolQueueMeta?.backlogCount != null && poolQueueMeta.backlogCount > 0
                        ? ` · 后备池约 ${poolQueueMeta.backlogCount} 人`
                        : ''}
                      {poolQueueMeta?.lastDailyRecommendAt
                        ? ` · 最近写入 ${new Date(poolQueueMeta.lastDailyRecommendAt).toLocaleString('zh-CN')}`
                        : ''}
                    </div>
                  )}
                  {poolPending && poolPending.length > 0 && (
                    <ul className="space-y-2 max-h-56 overflow-y-auto mb-4">
                      {poolPending.map((h) => (
                        <li
                          key={`w-${h.githubUsername}`}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-sm"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={h.avatarUrl} alt="" className="h-9 w-9 rounded-lg border border-white/10" />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-white">@{h.githubUsername}</span>
                            <span className="text-amber-200/80 text-[10px] ml-2">
                              {h.source === 'daily' ? '每日' : h.source === 'weekly' ? '周更' : '推荐'}
                            </span>
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
            ) : (
              <p className="text-slate-500">
                {items.length === 0
                  ? '请先点击右上方「新建 JD」创建职位。'
                  : '请从左侧选择一个 JD，或点击右上方「新建 JD」。'}
              </p>
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
