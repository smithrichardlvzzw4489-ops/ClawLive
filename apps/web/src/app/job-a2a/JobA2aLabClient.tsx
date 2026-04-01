'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

type SeekerForm = {
  title: string;
  city: string;
  salaryMin: string;
  salaryMax: string;
  skills: string;
  narrative: string;
};

type EmployerForm = {
  jobTitle: string;
  companyName: string;
  city: string;
  salaryMin: string;
  salaryMax: string;
  skills: string;
  narrative: string;
};

const STATUS_ZH: Record<string, string> = {
  pending_agent: '待 Darwin 开场',
  agent_chat: 'Darwin 代聊中',
  ready_human: '已解锁真人',
  human_active: '真人沟通中',
  closed: '已关闭',
};

function parseSkills(s: string): string[] {
  return s
    .split(/[,，、\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function JobA2aLabClient() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [seekerForm, setSeekerForm] = useState<SeekerForm>({
    title: '',
    city: '',
    salaryMin: '',
    salaryMax: '',
    skills: '',
    narrative: '',
  });
  const [employerForm, setEmployerForm] = useState<EmployerForm>({
    jobTitle: '',
    companyName: '',
    city: '',
    salaryMin: '',
    salaryMax: '',
    skills: '',
    narrative: '',
  });
  const [matches, setMatches] = useState<
    Array<{
      id: string;
      score: number;
      status: string;
      agentExchangeRounds: number;
      seeker: { username: string };
      employer: { username: string };
    }>
  >([]);
  const [timeline, setTimeline] = useState<
    Array<{ id: string; kind: string; detail: string | null; createdAt: string; matchId: string | null }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matchDetail, setMatchDetail] = useState<{
    match: {
      id: string;
      status: string;
      score: number;
      agentExchangeRounds: number;
      agentMessages: Array<{ id: string; side: string; body: string; createdAt: string }>;
      humanMessages: Array<{ id: string; authorUserId: string; body: string; createdAt: string }>;
    };
    seekerUser: { username: string } | null;
    employerUser: { username: string } | null;
    seekerProfile?: { jobChatChannel?: string | null } | null;
    employerProfile?: { jobChatChannel?: string | null } | null;
  } | null>(null);
  const [humanDraft, setHumanDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const loadDashboard = useCallback(async () => {
    setErr(null);
    const d = (await api.jobA2A.dashboard()) as {
      seekerProfile: {
        title: string;
        city: string | null;
        salaryMin: number | null;
        salaryMax: number | null;
        skills: unknown;
        narrative: string;
      } | null;
      employerProfile: {
        jobTitle: string;
        companyName: string | null;
        city: string | null;
        salaryMin: number | null;
        salaryMax: number | null;
        skills: unknown;
        narrative: string;
      } | null;
      matches: typeof matches;
      timeline: typeof timeline;
    };
    if (d.seekerProfile) {
      const sk = Array.isArray(d.seekerProfile.skills)
        ? (d.seekerProfile.skills as string[]).join(', ')
        : '';
      setSeekerForm({
        title: d.seekerProfile.title,
        city: d.seekerProfile.city || '',
        salaryMin: d.seekerProfile.salaryMin != null ? String(d.seekerProfile.salaryMin) : '',
        salaryMax: d.seekerProfile.salaryMax != null ? String(d.seekerProfile.salaryMax) : '',
        skills: sk,
        narrative: d.seekerProfile.narrative,
      });
    }
    if (d.employerProfile) {
      const sk = Array.isArray(d.employerProfile.skills)
        ? (d.employerProfile.skills as string[]).join(', ')
        : '';
      setEmployerForm({
        jobTitle: d.employerProfile.jobTitle,
        companyName: d.employerProfile.companyName || '',
        city: d.employerProfile.city || '',
        salaryMin: d.employerProfile.salaryMin != null ? String(d.employerProfile.salaryMin) : '',
        salaryMax: d.employerProfile.salaryMax != null ? String(d.employerProfile.salaryMax) : '',
        skills: sk,
        narrative: d.employerProfile.narrative,
      });
    }
    setMatches(d.matches || []);
    setTimeline(d.timeline || []);
  }, []);

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await loadDashboard();
      } catch (e) {
        setErr(e instanceof APIError ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedId || !token) {
      setMatchDetail(null);
      return;
    }
    (async () => {
      try {
        const detail = (await api.jobA2A.getMatch(selectedId)) as typeof matchDetail;
        setMatchDetail(detail);
      } catch {
        setMatchDetail(null);
      }
    })();
  }, [selectedId, token]);

  async function saveSeeker() {
    setBusy(true);
    setErr(null);
    try {
      await api.jobA2A.saveSeeker({
        title: seekerForm.title,
        city: seekerForm.city || undefined,
        salaryMin: seekerForm.salaryMin ? Number(seekerForm.salaryMin) : undefined,
        salaryMax: seekerForm.salaryMax ? Number(seekerForm.salaryMax) : undefined,
        skills: parseSkills(seekerForm.skills),
        narrative: seekerForm.narrative,
      });
      await loadDashboard();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function saveEmployer() {
    setBusy(true);
    setErr(null);
    try {
      await api.jobA2A.saveEmployer({
        jobTitle: employerForm.jobTitle,
        companyName: employerForm.companyName || undefined,
        city: employerForm.city || undefined,
        salaryMin: employerForm.salaryMin ? Number(employerForm.salaryMin) : undefined,
        salaryMax: employerForm.salaryMax ? Number(employerForm.salaryMax) : undefined,
        skills: parseSkills(employerForm.skills),
        narrative: employerForm.narrative,
      });
      await loadDashboard();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function runMatch() {
    setBusy(true);
    setErr(null);
    try {
      await api.jobA2A.runMatch();
      await loadDashboard();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '匹配失败');
    } finally {
      setBusy(false);
    }
  }

  const MIN_DARWIN_ROUNDS_FOR_UNLOCK = 10;

  async function doAgentStep(rounds?: number) {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.jobA2A.agentStep(selectedId, rounds);
      const detail = (await api.jobA2A.getMatch(selectedId)) as typeof matchDetail;
      setMatchDetail(detail);
      await loadDashboard();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : 'Darwin 轮次失败');
    } finally {
      setBusy(false);
    }
  }

  async function doUnlock() {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.jobA2A.unlockHuman(selectedId);
      const detail = (await api.jobA2A.getMatch(selectedId)) as typeof matchDetail;
      setMatchDetail(detail);
      await loadDashboard();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '解锁失败');
    } finally {
      setBusy(false);
    }
  }

  async function sendHuman() {
    if (!selectedId || !humanDraft.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.jobA2A.humanMessage(selectedId, humanDraft.trim());
      setHumanDraft('');
      const detail = (await api.jobA2A.getMatch(selectedId)) as typeof matchDetail;
      setMatchDetail(detail);
      await loadDashboard();
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  }

  if (!token && !loading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-white">A2A 求职实验室</h1>
          <p className="mt-3 text-sm text-slate-400">请先登录后使用双端建档与匹配监控。</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-lobster px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            去登录
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl px-3 pb-16 pt-4 sm:px-4 lg:px-6">
        <div className="mb-6 border-b border-white/10 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">A2A 求职实验室</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            双端建档 → 全站自动匹配 → Agent 代聊满 {MIN_DARWIN_ROUNDS_FOR_UNLOCK} 轮（双方 Darwin、或一方为外部小龙虾经 Open API
            发言）后可解锁真人。单次「推进」在双方均为站内 Darwin 时会连续跑满多轮；若一方为外部通道，需由外部 Agent 与另一方
            Darwin/外部 Agent 交替完成轮次。
          </p>
          <p className="mt-2 text-xs text-slate-500">
            可与 <Link href="/my-lobster" className="text-lobster hover:underline">Darwin 对话</Link>{' '}
            配合使用：先在对话里理清诉求，再将要点填到表单。
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-950/40 px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-emerald-200">外部小龙虾接入</h2>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            注册时已为账号生成<strong className="text-emerald-200/90">一份专属文档</strong>，内含<strong>真实</strong>{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">clw_</code> Key 与完整 API 说明。  
            接入时只需打开文档页，点击<strong>「复制全文」</strong>，粘贴发给 MiniMax / 外部 Agent 即可。
          </p>
          <Link
            href="/external-lobster-doc"
            className="mt-4 inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500"
          >
            打开小龙虾接入文档 →
          </Link>
          <p className="mt-3 text-xs text-slate-500">
            与「技能 → 我发布的」中待审核技能全文一致；也可在{' '}
            <Link href="/agent-keys" className="text-emerald-400 underline hover:text-emerald-300">
              Agent API Key
            </Link>{' '}
            核对密钥前缀。
          </p>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">加载中…</p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <h2 className="mb-3 text-lg font-semibold text-lobster">求职者 Darwin 建档</h2>
                <div className="space-y-3 text-sm">
                  <label className="block text-slate-400">
                    意向职位
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={seekerForm.title}
                      onChange={(e) => setSeekerForm((s) => ({ ...s, title: e.target.value }))}
                      placeholder="如：前端工程师"
                    />
                  </label>
                  <label className="block text-slate-400">
                    城市
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={seekerForm.city}
                      onChange={(e) => setSeekerForm((s) => ({ ...s, city: e.target.value }))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-slate-400">
                      期望薪资下限 (k)
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                        value={seekerForm.salaryMin}
                        onChange={(e) => setSeekerForm((s) => ({ ...s, salaryMin: e.target.value }))}
                      />
                    </label>
                    <label className="text-slate-400">
                      期望薪资上限 (k)
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                        value={seekerForm.salaryMax}
                        onChange={(e) => setSeekerForm((s) => ({ ...s, salaryMax: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block text-slate-400">
                    技能标签（逗号分隔）
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={seekerForm.skills}
                      onChange={(e) => setSeekerForm((s) => ({ ...s, skills: e.target.value }))}
                      placeholder="React, TypeScript, Node"
                    />
                  </label>
                  <label className="block text-slate-400">
                    诉求摘要（Darwin 可据此理解你）
                    <textarea
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={seekerForm.narrative}
                      onChange={(e) => setSeekerForm((s) => ({ ...s, narrative: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveSeeker()}
                    className="rounded-xl bg-lobster/90 px-4 py-2 font-medium text-white hover:bg-lobster disabled:opacity-50"
                  >
                    保存求职者档案
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <h2 className="mb-3 text-lg font-semibold text-emerald-400/90">招聘方 Darwin 建档</h2>
                <div className="space-y-3 text-sm">
                  <label className="block text-slate-400">
                    岗位名称
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={employerForm.jobTitle}
                      onChange={(e) => setEmployerForm((s) => ({ ...s, jobTitle: e.target.value }))}
                    />
                  </label>
                  <label className="block text-slate-400">
                    公司（可选）
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={employerForm.companyName}
                      onChange={(e) => setEmployerForm((s) => ({ ...s, companyName: e.target.value }))}
                    />
                  </label>
                  <label className="block text-slate-400">
                    城市
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={employerForm.city}
                      onChange={(e) => setEmployerForm((s) => ({ ...s, city: e.target.value }))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-slate-400">
                      预算下限 (k)
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                        value={employerForm.salaryMin}
                        onChange={(e) => setEmployerForm((s) => ({ ...s, salaryMin: e.target.value }))}
                      />
                    </label>
                    <label className="text-slate-400">
                      预算上限 (k)
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                        value={employerForm.salaryMax}
                        onChange={(e) => setEmployerForm((s) => ({ ...s, salaryMax: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block text-slate-400">
                    要求技能（逗号分隔）
                    <input
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={employerForm.skills}
                      onChange={(e) => setEmployerForm((s) => ({ ...s, skills: e.target.value }))}
                    />
                  </label>
                  <label className="block text-slate-400">
                    岗位与团队摘要
                    <textarea
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-white"
                      value={employerForm.narrative}
                      onChange={(e) => setEmployerForm((s) => ({ ...s, narrative: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEmployer()}
                    className="rounded-xl bg-emerald-600/90 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    保存招聘方档案
                  </button>
                </div>
              </section>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runMatch()}
                className="rounded-xl border border-lobster/40 bg-lobster/15 px-4 py-2 text-sm font-medium text-lobster hover:bg-lobster/25 disabled:opacity-50"
              >
                全站自动匹配
              </button>
              <span className="text-xs text-slate-500">
                会为所有活跃求职者 × 招聘方计算相似度并生成匹配对（排除同人账号）。
              </span>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  我的匹配对
                </h3>
                <ul className="space-y-2">
                  {matches.length === 0 && (
                    <li className="text-sm text-slate-500">暂无匹配，请先保存双端档案并运行匹配。</li>
                  )}
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                          selectedId === m.id
                            ? 'border-lobster/50 bg-lobster/10 text-white'
                            : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        <div className="font-medium">
                          {m.seeker.username} ↔ {m.employer.username}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          分 {(m.score * 100).toFixed(1)} · {STATUS_ZH[m.status] || m.status} · Darwin 轮{' '}
                          {m.agentExchangeRounds}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  匹配详情与对话
                </h3>
                {!selectedId && (
                  <p className="text-sm text-slate-500">点击左侧一条匹配查看 Darwin 代聊与真人聊天。</p>
                )}
                {selectedId && matchDetail && (
                  <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white/10 px-2 py-0.5">
                        求职者 @{matchDetail.seekerUser?.username}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5">
                        招聘方 @{matchDetail.employerUser?.username}
                      </span>
                      <span className="text-slate-500">
                        状态：{STATUS_ZH[matchDetail.match.status] || matchDetail.match.status}
                        （代聊与 /my-lobster 同源 Darwin；一方为外部通道时由 Open API 发言）
                      </span>
                    </div>

                    {(matchDetail.seekerProfile?.jobChatChannel === 'external' ||
                      matchDetail.employerProfile?.jobChatChannel === 'external') && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100/95">
                        本匹配含 <strong>外部小龙虾</strong> 通道：该侧由外部 Agent 经 Open API 提交发言，与另一侧站内
                        Darwin 或另一外部 Agent 对聊；网页「推进」仅在双方均为站内 Darwin 时连续跑满多轮。
                      </div>
                    )}

                    <div>
                      <h4 className="mb-2 text-xs font-semibold text-amber-200/90">
                        Agent 代聊（双方 Darwin 或一方外部小龙虾）
                      </h4>
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                        {matchDetail.match.agentMessages.length === 0 && (
                          <p className="text-slate-500">
                            尚无消息。若双方均为站内 Darwin，可点击下方推进（会写入各自 /my-lobster 对话）；若求职方走外部
                            Open API，请先由外部小龙虾提交首条求职方消息。
                          </p>
                        )}
                        {matchDetail.match.agentMessages.map((msg) => {
                          const seekerExt = matchDetail.seekerProfile?.jobChatChannel === 'external';
                          const empExt = matchDetail.employerProfile?.jobChatChannel === 'external';
                          const role =
                            msg.side === 'seeker_agent'
                              ? seekerExt
                                ? '求职者（外部小龙虾）'
                                : '求职者 Darwin'
                              : empExt
                                ? '招聘方（外部小龙虾）'
                                : '招聘方 Darwin';
                          return (
                          <div
                            key={msg.id}
                            className={`rounded-lg px-3 py-2 ${
                              msg.side === 'seeker_agent'
                                ? 'ml-0 mr-4 bg-lobster/15 text-slate-200'
                                : 'ml-4 mr-0 bg-emerald-500/15 text-slate-200'
                            }`}
                          >
                            <div className="text-[10px] uppercase text-slate-500">
                              {role}
                            </div>
                            <div className="whitespace-pre-wrap">{msg.body}</div>
                          </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (matchDetail.match.status !== 'pending_agent' &&
                              matchDetail.match.status !== 'agent_chat')
                          }
                          onClick={() => void doAgentStep(10)}
                          className="rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-40"
                        >
                          连续推进 {MIN_DARWIN_ROUNDS_FOR_UNLOCK} 轮 Darwin 代聊
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (matchDetail.match.status !== 'pending_agent' &&
                              matchDetail.match.status !== 'agent_chat')
                          }
                          onClick={() => void doAgentStep(1)}
                          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-100/90 hover:bg-amber-500/10 disabled:opacity-40"
                        >
                          仅 1 轮
                        </button>
                        <span className="text-[11px] text-slate-500">
                          已 {matchDetail.match.agentExchangeRounds} / {MIN_DARWIN_ROUNDS_FOR_UNLOCK} 轮可解锁
                        </span>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            matchDetail.match.agentExchangeRounds < MIN_DARWIN_ROUNDS_FOR_UNLOCK ||
                            (matchDetail.match.status !== 'pending_agent' &&
                              matchDetail.match.status !== 'agent_chat')
                          }
                          onClick={() => void doUnlock()}
                          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-40"
                        >
                          解锁真人聊天
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-semibold text-sky-200/90">真人聊天（解锁后）</h4>
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-sm">
                        {matchDetail.match.humanMessages.length === 0 && (
                          <p className="text-slate-500">解锁后可在此发送首条消息。</p>
                        )}
                        {matchDetail.match.humanMessages.map((msg) => (
                          <div key={msg.id} className="rounded-lg bg-white/5 px-3 py-2 text-slate-200">
                            <div className="text-[10px] text-slate-500">{msg.authorUserId.slice(0, 8)}…</div>
                            <div className="whitespace-pre-wrap">{msg.body}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-sm text-white"
                          placeholder={
                            matchDetail.match.status === 'ready_human' ||
                            matchDetail.match.status === 'human_active'
                              ? '输入消息…'
                              : '请先完成 Darwin 代聊并解锁'
                          }
                          value={humanDraft}
                          onChange={(e) => setHumanDraft(e.target.value)}
                          disabled={
                            matchDetail.match.status !== 'ready_human' &&
                            matchDetail.match.status !== 'human_active'
                          }
                        />
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (matchDetail.match.status !== 'ready_human' &&
                              matchDetail.match.status !== 'human_active')
                          }
                          onClick={() => void sendHuman()}
                          className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-40"
                        >
                          发送
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                全流程监控时间线
              </h3>
              <div className="max-h-96 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4 font-mono text-xs">
                {timeline.length === 0 ? (
                  <p className="text-slate-500">暂无事件</p>
                ) : (
                  <ul className="space-y-2">
                    {timeline.map((ev) => (
                      <li key={ev.id} className="border-b border-white/5 pb-2 text-slate-400">
                        <span className="text-slate-500">
                          {new Date(ev.createdAt).toLocaleString('zh-CN')}
                        </span>{' '}
                        <span className="text-lobster/90">{ev.kind}</span>
                        {ev.detail && <span className="text-slate-300"> — {ev.detail}</span>}
                        {ev.matchId && (
                          <button
                            type="button"
                            className="ml-2 text-sky-400 hover:underline"
                            onClick={() => setSelectedId(ev.matchId)}
                          >
                            查看匹配
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
