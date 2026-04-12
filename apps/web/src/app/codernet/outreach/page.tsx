'use client';

import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { useHistoryBack, withReturnTo } from '@/hooks/useHistoryBack';

/* ── Types ──────────────────────────────────────────────── */

interface Recipient {
  githubUsername: string;
  avatarUrl: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  followers: number;
  publicRepos: number;
  contact: {
    profileEmail: string | null;
    commitEmail: string | null;
    twitter: string | null;
    blog: string | null;
    bestEmail: string | null;
  };
  tier: 1 | 2 | 3 | 4;
  techTags?: string[];
  oneLiner?: string;
  personalizedMessage?: string;
  status: string;
}

interface Campaign {
  id: string;
  createdAt: number;
  updatedAt: number;
  searchQuery: string;
  githubQuery: string;
  intent: string;
  senderName: string;
  status: string;
  totalFound: number;
  recipients: Recipient[];
  progress: {
    phase: string;
    detail: string;
    contactsExtracted: number;
    messagesGenerated: number;
    messagesSent: number;
    emailableCount: number;
  };
  tierConfig: { tier1: number; tier2: number; tier3: number; tier4: number };
}

const PIPELINE_PHASES = [
  { key: 'searching', label: '搜索候选人', icon: '🔍' },
  { key: 'extracting_contacts', label: '提取联系方式', icon: '📧' },
  { key: 'generating_messages', label: 'AI 生成消息', icon: '✍️' },
  { key: 'ready', label: '准备就绪', icon: '✅' },
] as const;

const MAX_RECIPIENT_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10 人（快速测试）' },
  { value: 50, label: '50 人' },
  { value: 100, label: '100 人' },
  { value: 300, label: '300 人' },
  { value: 500, label: '500 人' },
  { value: 1000, label: '1000 人（完整覆盖）' },
];

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Tier 1', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  2: { label: 'Tier 2', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  3: { label: 'Tier 3', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  4: { label: 'Tier 4', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

/* ── Main Page ──────────────────────────────────────────── */

export default function OutreachPage() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const here = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    [pathname, searchParams],
  );
  const goBack = useHistoryBack('/codernet', { returnTo: searchParams.get('returnTo') });

  function jsonAuthHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      router.replace(`/login?redirect=${encodeURIComponent(here || '/codernet/outreach')}`);
    }
  }, [here, router]);
  const [step, setStep] = useState<'form' | 'running' | 'dashboard'>('form');
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  /* ── Form state ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [intent, setIntent] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderInfo, setSenderInfo] = useState('');
  const [maxRecipients, setMaxRecipients] = useState(100);
  const [maxRecipientsMenuOpen, setMaxRecipientsMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* ── Polling for campaign progress ── */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRecipientsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!maxRecipientsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = maxRecipientsMenuRef.current;
      if (el && !el.contains(e.target as Node)) setMaxRecipientsMenuOpen(false);
    };
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onPointerDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [maxRecipientsMenuOpen]);

  function startPolling(campaignId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const base = API_BASE_URL || '';
        const res = await fetch(`${base}/api/codernet/outreach/${campaignId}`, {
          headers: jsonAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        setCampaign(data.campaign);
        if (['ready', 'completed', 'error'].includes(data.campaign.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.campaign.status === 'ready' || data.campaign.status === 'completed') {
            setStep('dashboard');
          }
        }
      } catch {}
    }, 3000);
  }

  /* ── Create Campaign ── */
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim() || !intent.trim() || !senderName.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const base = API_BASE_URL || '';
      const res = await fetch(`${base}/api/codernet/outreach`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          searchQuery: searchQuery.trim(),
          githubQuery: searchQuery.trim(),
          intent: intent.trim(),
          senderName: senderName.trim(),
          senderInfo: senderInfo.trim(),
          tierConfig: { tier1: 10, tier2: 50, tier3: Math.min(maxRecipients, 200), tier4: maxRecipients },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCampaign(data.campaign);
      setStep('running');
      startPolling(data.campaign.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Send Campaign ── */
  const [fromEmail, setFromEmail] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!campaign || !fromEmail.trim()) return;
    setSending(true);
    try {
      const base = API_BASE_URL || '';
      const res = await fetch(`${base}/api/codernet/outreach/${campaign.id}/send`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ fromEmail: fromEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Send failed');
      }
      startPolling(campaign.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  /* ── Preview a single message ── */
  const [previewUser, setPreviewUser] = useState('');
  const [previewMsg, setPreviewMsg] = useState('');
  const [previewing, setPreviewing] = useState(false);

  async function handlePreview(username?: string) {
    const target = username || previewUser.trim();
    if (!target || !intent.trim() || !senderName.trim()) return;
    setPreviewing(true);
    try {
      const base = API_BASE_URL || '';
      const res = await fetch(`${base}/api/codernet/outreach/preview`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          intent: intent.trim(),
          senderName: senderName.trim(),
          senderInfo: senderInfo.trim(),
          recipientUsername: target,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewMsg(data.message);
    } catch (err: any) {
      setPreviewMsg(`Error: ${err.message}`);
    } finally {
      setPreviewing(false);
    }
  }

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/15 blur-[160px]" />
      <div className="pointer-events-none fixed -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-indigo-600/10 blur-[160px]" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button type="button" onClick={goBack} className="cursor-pointer text-slate-500 hover:text-white transition text-sm">
            &larr; GITLINK
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1">
            <span className="text-xs font-mono text-violet-400 tracking-wider">OUTREACH</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
          Developer{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
            Outreach
          </span>
        </h1>
        <p className="text-slate-400 text-sm mb-8">
          描述你的需求 → AI 从 GitHub 搜人 → 提取联系方式 → 生成个性化消息 → 一键发送
        </p>

        {/* ── Step 1: Form ── */}
        {step === 'form' && (
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">你想找什么样的开发者？</label>
              <textarea
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="例如：上海的 Rust 后端开发者，专注分布式系统，粉丝 100+"
                rows={2}
                className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none resize-none focus:border-violet-500/40 transition"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">你的意图（AI 会基于此为每人生成不同的消息）</label>
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="例如：我在做一个去中心化存储项目，需要 Rust 后端开发者加入，远程兼职，有期权激励。我们团队 5 人，已拿到种子轮。"
                rows={3}
                className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none resize-none focus:border-violet-500/40 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">你的名字</label>
                <input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="张三"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40 transition"
                />
              </div>
              <div className="relative" ref={maxRecipientsMenuRef}>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">最大外联人数</label>
                <button
                  type="button"
                  id="max-recipients-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={maxRecipientsMenuOpen}
                  onClick={() => setMaxRecipientsMenuOpen((o) => !o)}
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-left text-sm text-white outline-none focus:border-violet-500/40 transition flex items-center justify-between gap-2"
                >
                  <span>{MAX_RECIPIENT_OPTIONS.find((o) => o.value === maxRecipients)?.label ?? `${maxRecipients} 人`}</span>
                  <span className="text-slate-500 shrink-0" aria-hidden>
                    ▾
                  </span>
                </button>
                {maxRecipientsMenuOpen && (
                  <ul
                    role="listbox"
                    aria-labelledby="max-recipients-trigger"
                    className="absolute z-50 mt-1 w-full rounded-xl border border-white/[0.12] bg-[#0c0e14] py-1 shadow-xl shadow-black/50 max-h-64 overflow-y-auto"
                  >
                    {MAX_RECIPIENT_OPTIONS.map((opt) => (
                      <li key={opt.value} role="option" aria-selected={maxRecipients === opt.value}>
                        <button
                          type="button"
                          onClick={() => {
                            setMaxRecipients(opt.value);
                            setMaxRecipientsMenuOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm transition ${
                            maxRecipients === opt.value
                              ? 'bg-violet-600/35 text-violet-100'
                              : 'text-slate-200 hover:bg-white/[0.06]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">你的背景（可选，帮助 AI 写出更好的消息）</label>
              <input
                value={senderInfo}
                onChange={(e) => setSenderInfo(e.target.value)}
                placeholder="CTO @ XYZ Corp，前 Google 工程师，开源贡献者"
                className="w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40 transition"
              />
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-xs text-slate-400 mb-2 font-medium">预览消息（可选）</p>
              <div className="flex gap-2">
                <input
                  value={previewUser}
                  onChange={(e) => setPreviewUser(e.target.value)}
                  placeholder="输入 GitHub 用户名预览"
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handlePreview()}
                  disabled={!previewUser.trim() || !intent.trim() || !senderName.trim() || previewing}
                  className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-30 text-xs text-slate-300 font-medium transition"
                >
                  {previewing ? 'AI 生成中...' : '预览'}
                </button>
              </div>
              {previewMsg && (
                <pre className="mt-3 rounded-lg bg-black/30 border border-white/[0.06] p-3 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {previewMsg}
                </pre>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">{error}</div>
            )}

            <button
              type="submit"
              disabled={!searchQuery.trim() || !intent.trim() || !senderName.trim() || submitting}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 disabled:cursor-not-allowed text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating campaign...
                </>
              ) : (
                `启动外联 → 搜索 ${maxRecipients} 位开发者`
              )}
            </button>
          </form>
        )}

        {/* ── Step 2: Running Pipeline ── */}
        {step === 'running' && campaign && (
          <div className="space-y-6">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-6">
              <h3 className="text-sm font-bold mb-4">Pipeline Progress</h3>

              {/* Phase indicators */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {PIPELINE_PHASES.map((ph, i) => {
                  const active = campaign.progress.phase === ph.key;
                  const phaseIdx = PIPELINE_PHASES.findIndex((p) => p.key === campaign.progress.phase);
                  const done = phaseIdx > i || campaign.status === 'ready';
                  return (
                    <div key={ph.key} className="flex items-center gap-1.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all duration-300 ${
                        active ? 'bg-violet-600 scale-110 ring-2 ring-violet-400/50' :
                        done ? 'bg-green-600/80' : 'bg-white/[0.06]'
                      }`}>
                        {done ? '✓' : ph.icon}
                      </div>
                      <span className={`text-xs ${active ? 'text-violet-300 font-semibold' : done ? 'text-green-400/70' : 'text-slate-600'}`}>
                        {ph.label}
                      </span>
                      {i < PIPELINE_PHASES.length - 1 && <div className={`w-6 h-px ${done ? 'bg-green-600/50' : 'bg-white/[0.08]'}`} />}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400 animate-pulse">{campaign.progress.detail}</p>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                <Stat label="Total Found" value={campaign.totalFound} />
                <Stat label="Contacts" value={campaign.progress.contactsExtracted} />
                <Stat label="With Email" value={campaign.progress.emailableCount} />
                <Stat label="Messages" value={campaign.progress.messagesGenerated} />
              </div>
            </div>

            {campaign.status === 'error' && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
                {campaign.progress.detail}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Dashboard ── */}
        {step === 'dashboard' && campaign && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green-400 text-lg">✅</span>
                <h3 className="text-sm font-bold text-green-300">Campaign Ready</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Stat label="GitHub Found" value={campaign.totalFound} />
                <Stat label="Contacts" value={campaign.progress.contactsExtracted} />
                <Stat label="Email Found" value={campaign.progress.emailableCount} color="text-green-400" />
                <Stat label="Messages" value={campaign.progress.messagesGenerated} color="text-violet-400" />
                <Stat label="Sent" value={campaign.progress.messagesSent} color="text-blue-400" />
              </div>
            </div>

            {/* Tier breakdown */}
            <div className="grid grid-cols-4 gap-3">
              {([1, 2, 3, 4] as const).map((tier) => {
                const count = campaign.recipients.filter((r) => r.tier === tier).length;
                const emailable = campaign.recipients.filter((r) => r.tier === tier && r.contact.bestEmail).length;
                const t = TIER_LABELS[tier];
                return (
                  <div key={tier} className={`rounded-lg border p-3 ${t.color}`}>
                    <p className="text-xs font-bold">{t.label}</p>
                    <p className="text-lg font-mono mt-1">{count}</p>
                    <p className="text-[10px] opacity-70">{emailable} emailable</p>
                  </div>
                );
              })}
            </div>

            {/* Send controls */}
            {campaign.status === 'ready' && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                <h3 className="text-sm font-bold mb-3">Send Emails</h3>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">发件邮箱</label>
                    <input
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="you@yourdomain.com"
                      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!fromEmail.trim() || sending}
                    className="px-6 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 text-sm font-semibold transition"
                  >
                    {sending ? 'Starting...' : `Send ${campaign.progress.messagesGenerated} Emails`}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">
                  Requires RESEND_API_KEY. Emails are rate-limited (1 per 3 seconds) with unsubscribe links.
                </p>
              </div>
            )}

            {campaign.status === 'sending' && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                  <p className="text-sm text-blue-300">Sending... {campaign.progress.messagesSent} / {campaign.progress.messagesGenerated}</p>
                </div>
              </div>
            )}

            {campaign.status === 'completed' && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
                <p className="text-sm text-green-300 font-medium">
                  All done! {campaign.progress.messagesSent} emails sent.
                </p>
              </div>
            )}

            {/* Recipients list */}
            <div>
              <h3 className="text-sm font-bold mb-3">Recipients ({campaign.recipients.length})</h3>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {campaign.recipients.map((r) => (
                  <RecipientRow
                    key={r.githubUsername}
                    recipient={r}
                    here={here}
                    onPreview={() => handlePreview(r.githubUsername)}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">{error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-mono font-bold ${color || 'text-white'}`}>{value.toLocaleString()}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function RecipientRow({ recipient: r, here, onPreview }: { recipient: Recipient; here: string; onPreview: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_LABELS[r.tier] || TIER_LABELS[4];

  const statusColors: Record<string, string> = {
    pending: 'bg-slate-500/20 text-slate-400',
    message_generated: 'bg-violet-500/20 text-violet-300',
    sent: 'bg-blue-500/20 text-blue-300',
    delivered: 'bg-green-500/20 text-green-300',
    opened: 'bg-green-500/20 text-green-300',
    replied: 'bg-yellow-500/20 text-yellow-300',
    failed: 'bg-red-500/20 text-red-300',
    no_contact: 'bg-slate-800/50 text-slate-600',
  };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.avatarUrl} alt={r.githubUsername} className="w-8 h-8 rounded-lg border border-white/10" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">@{r.githubUsername}</span>
            {r.name && <span className="text-xs text-slate-500">{r.name}</span>}
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tier.color}`}>{tier.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {r.contact.bestEmail && <span className="text-[10px] text-green-400/80">📧 {r.contact.bestEmail}</span>}
            {r.contact.twitter && <span className="text-[10px] text-blue-400/80">🐦 {r.contact.twitter}</span>}
            {!r.contact.bestEmail && !r.contact.twitter && <span className="text-[10px] text-slate-600">No contact info</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded ${statusColors[r.status] || statusColors.pending}`}>
            {r.status}
          </span>
          <span className="text-xs text-slate-600">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.04] pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">Location:</span> <span className="text-slate-300">{r.location || '—'}</span></div>
            <div><span className="text-slate-500">Company:</span> <span className="text-slate-300">{r.company || '—'}</span></div>
            <div><span className="text-slate-500">Followers:</span> <span className="text-slate-300">{r.followers.toLocaleString()}</span></div>
            <div><span className="text-slate-500">Repos:</span> <span className="text-slate-300">{r.publicRepos}</span></div>
            <div className="col-span-2"><span className="text-slate-500">Profile Email:</span> <span className="text-slate-300">{r.contact.profileEmail || '—'}</span></div>
            <div className="col-span-2"><span className="text-slate-500">Commit Email:</span> <span className="text-slate-300">{r.contact.commitEmail || '—'}</span></div>
            <div className="col-span-2"><span className="text-slate-500">Blog:</span> <span className="text-slate-300">{r.contact.blog || '—'}</span></div>
          </div>
          {r.bio && <p className="text-xs text-slate-400 italic">{r.bio}</p>}
          {r.personalizedMessage && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1 font-medium">AI Generated Message:</p>
              <pre className="rounded-lg bg-black/30 border border-white/[0.06] p-2.5 text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {r.personalizedMessage}
              </pre>
            </div>
          )}
          <div className="flex gap-2">
            <Link
              href={withReturnTo(`/codernet/github/${encodeURIComponent(r.githubUsername)}`, here)}
              className="text-[10px] px-2 py-1 rounded border border-white/[0.08] text-slate-400 hover:text-white transition"
            >
              View Profile
            </Link>
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              className="text-[10px] px-2 py-1 rounded border border-violet-500/20 text-violet-300 hover:bg-violet-500/10 transition"
            >
              Regenerate Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
