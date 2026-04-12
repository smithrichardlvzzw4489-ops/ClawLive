'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useHistoryBack, withReturnTo } from '@/hooks/useHistoryBack';
import { API_BASE_URL } from '@/lib/api';

interface AgentMessage {
  id: string;
  side: 'initiator_agent' | 'target_agent';
  body: string;
  createdAt: number;
}

interface HumanMessage {
  id: string;
  authorSide: 'initiator' | 'target';
  body: string;
  createdAt: number;
}

interface ConnectProfile {
  githubUsername: string;
  avatarUrl?: string | null;
  oneLiner?: string;
  techTags?: string[];
}

interface ConnectSession {
  id: string;
  initiatorGhUsername: string;
  targetGhUsername: string;
  intent: string;
  intentCategory: string;
  status: string;
  initiatorProfile: ConnectProfile;
  targetProfile: ConnectProfile;
  agentMessages: AgentMessage[];
  humanMessages: HumanMessage[];
  agentRounds: number;
  agentVerdict?: { compatible: boolean; summary: string } | null;
  createdAt: number;
  updatedAt: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  agent_chat: { label: 'Agent 对话中', color: 'text-amber-400' },
  agent_positive: { label: 'Agent 建议沟通', color: 'text-emerald-400' },
  agent_negative: { label: 'Agent 认为不匹配', color: 'text-red-400' },
  human_unlocked: { label: '真人对话已解锁', color: 'text-violet-400' },
  human_active: { label: '真人对话中', color: 'text-violet-400' },
  closed: { label: '已关闭', color: 'text-slate-500' },
};

export default function ConnectChatPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const here = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const sessionId = params.id;
  const [session, setSession] = useState<ConnectSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stepping, setStepping] = useState(false);
  const [humanInput, setHumanInput] = useState('');
  const [sendingSide, setSendingSide] = useState<'initiator' | 'target'>('initiator');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = API_BASE_URL || '';
  const goBack = useHistoryBack('/codernet', { returnTo: searchParams.get('returnTo') });

  const postAuthHeaders = (jsonBody?: boolean): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const h: Record<string, string> = {};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const fetchSession = useCallback(async () => {
    const res = await fetch(`${base}/api/codernet/connect/${sessionId}`);
    if (!res.ok) throw new Error('Session not found');
    const data = await res.json();
    return data.session as ConnectSession;
  }, [base, sessionId]);

  useEffect(() => {
    fetchSession()
      .then(setSession)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchSession]);

  useEffect(() => {
    if (!session || session.status === 'closed') return;
    if (session.status === 'agent_chat' && session.agentRounds === 0) {
      pollRef.current = setTimeout(async () => {
        try { const s = await fetchSession(); setSession(s); } catch {}
      }, 3000);
      return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    }
  }, [session, fetchSession]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.agentMessages?.length, session?.humanMessages?.length]);

  const handleAgentStep = async () => {
    if (stepping) return;
    setStepping(true);
    try {
      const res = await fetch(`${base}/api/codernet/connect/${sessionId}/agent-step`, {
        method: 'POST',
        headers: postAuthHeaders(false),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data.session);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStepping(false);
    }
  };

  const handleUnlock = async () => {
    try {
      const res = await fetch(`${base}/api/codernet/connect/${sessionId}/unlock`, {
        method: 'POST',
        headers: postAuthHeaders(false),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data.session);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSendHuman = async () => {
    if (!humanInput.trim()) return;
    try {
      const res = await fetch(`${base}/api/codernet/connect/${sessionId}/human-message`, {
        method: 'POST',
        headers: postAuthHeaders(true),
        body: JSON.stringify({ body: humanInput.trim(), side: sendingSide }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data.session);
      setHumanInput('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-[#06080f] flex items-center justify-center text-center p-4">
        <div>
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button type="button" onClick={goBack} className="cursor-pointer text-violet-400 text-sm hover:underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const statusInfo = STATUS_LABELS[session.status] || { label: session.status, color: 'text-slate-400' };
  const canStep = session.status === 'agent_chat' || session.status === 'agent_positive' || session.status === 'agent_negative';
  const canUnlock = (session.status === 'agent_positive' || session.status === 'agent_negative') && session.agentRounds >= 3;
  const canHumanChat = session.status === 'human_unlocked' || session.status === 'human_active';

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="pointer-events-none fixed -top-48 -left-48 h-[700px] w-[700px] rounded-full bg-violet-700/10 blur-[160px]" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Link href="/codernet" className="text-xs font-mono text-violet-400 hover:text-violet-300 transition">GITLINK</Link>
          <span className="text-xs text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-500">connect</span>
        </div>

        {/* Participants */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 mb-4">
          <div className="flex items-center justify-between gap-4">
            <ProfileBadge profile={session.initiatorProfile} label="发起方" here={here} />
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="text-xs font-mono px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03]">
                {session.intentCategory}
              </div>
              <span className={`text-[10px] font-mono ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
            <ProfileBadge profile={session.targetProfile} label="目标方" align="right" here={here} />
          </div>

          {/* Intent */}
          <div className="mt-4 rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
            <p className="text-[10px] text-slate-500 font-mono uppercase mb-1">Intent</p>
            <p className="text-sm text-slate-300">{session.intent}</p>
          </div>
        </div>

        {/* Agent Verdict */}
        {session.agentVerdict && (
          <div className={`rounded-xl border px-4 py-3 mb-4 ${
            session.agentVerdict.compatible
              ? 'border-emerald-500/20 bg-emerald-500/10'
              : 'border-amber-500/20 bg-amber-500/10'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-bold ${session.agentVerdict.compatible ? 'text-emerald-400' : 'text-amber-400'}`}>
                {session.agentVerdict.compatible ? 'Agent 建议: 值得进一步沟通' : 'Agent 评估: 暂时不太匹配'}
              </span>
            </div>
            <p className="text-xs text-slate-300">{session.agentVerdict.summary}</p>
          </div>
        )}

        {/* Chat Messages */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden mb-4">
          <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">Agent Exchange · {session.agentRounds} rounds</span>
            {canStep && (
              <button
                onClick={handleAgentStep}
                disabled={stepping}
                className="text-xs px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 text-white font-medium transition flex items-center gap-1"
              >
                {stepping ? (
                  <><div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" /> Running...</>
                ) : (
                  '+ Next Round'
                )}
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
            {session.agentMessages.length === 0 && (
              <div className="text-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-400 border-t-transparent mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-mono">Agent is starting the conversation...</p>
              </div>
            )}
            {session.agentMessages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.side === 'target_agent' ? 'flex-row-reverse' : ''}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                  msg.side === 'initiator_agent'
                    ? 'bg-violet-500/10 border border-violet-500/20'
                    : 'bg-indigo-500/10 border border-indigo-500/20'
                }`}>
                  <p className="text-[10px] font-mono text-slate-500 mb-1">
                    {msg.side === 'initiator_agent'
                      ? `@${session.initiatorGhUsername} 's Agent`
                      : `@${session.targetGhUsername} 's Agent`}
                  </p>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                </div>
              </div>
            ))}

            {/* Human messages */}
            {session.humanMessages.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex-1 h-px bg-violet-500/20" />
                  <span className="text-[10px] font-mono text-violet-400">Human Chat</span>
                  <div className="flex-1 h-px bg-violet-500/20" />
                </div>
                {session.humanMessages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.authorSide === 'target' ? 'flex-row-reverse' : ''}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                      msg.authorSide === 'initiator'
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-cyan-500/10 border border-cyan-500/20'
                    }`}>
                      <p className="text-[10px] font-mono text-slate-500 mb-1">
                        @{msg.authorSide === 'initiator' ? session.initiatorGhUsername : session.targetGhUsername}
                      </p>
                      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Action area */}
        {canUnlock && !canHumanChat && (
          <button
            onClick={handleUnlock}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition mb-4"
          >
            解锁真人对话
          </button>
        )}

        {canHumanChat && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-500">发送身份:</span>
              <button
                onClick={() => setSendingSide('initiator')}
                className={`text-xs px-2 py-1 rounded-md transition ${sendingSide === 'initiator' ? 'bg-violet-600 text-white' : 'bg-white/[0.06] text-slate-400'}`}
              >
                @{session.initiatorGhUsername}
              </button>
              <button
                onClick={() => setSendingSide('target')}
                className={`text-xs px-2 py-1 rounded-md transition ${sendingSide === 'target' ? 'bg-violet-600 text-white' : 'bg-white/[0.06] text-slate-400'}`}
              >
                @{session.targetGhUsername}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={humanInput}
                onChange={(e) => setHumanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendHuman(); } }}
                placeholder="Type a message..."
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40"
              />
              <button onClick={handleSendHuman} disabled={!humanInput.trim()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/30 text-sm font-medium transition">
                Send
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400 text-center mb-4">{error}</p>}

        <div className="text-center">
          <button type="button" onClick={goBack} className="cursor-pointer text-xs text-slate-600 font-mono hover:text-violet-400 transition">
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileBadge({ profile, label, align, here }: { profile: ConnectProfile; label: string; align?: 'right'; here: string }) {
  const portraitHref = withReturnTo(`/codernet/github/${encodeURIComponent(profile.githubUsername)}`, here);
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" className="w-9 h-9 rounded-lg border border-white/10 shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-violet-600/30 flex items-center justify-center text-sm font-bold shrink-0">
          {profile.githubUsername[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] text-slate-600 font-mono">{label}</p>
        <Link href={portraitHref} className="text-sm font-medium text-white hover:text-violet-300 transition truncate block">
          @{profile.githubUsername}
        </Link>
      </div>
    </div>
  );
}
