'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, APIError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/MainLayout';
import { RecruiterOutboundEmailSection } from '@/components/my/RecruiterOutboundEmailSection';

type CandidateRow = {
  id: string;
  githubUsername: string;
  displayName: string | null;
  email: string | null;
  notes: string | null;
  intro: string | null;
  matchScore: number | null;
  systemRecommendedAt: string | null;
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
  /** ISO 8601，服务端写入待查看池时间 */
  addedAt?: string;
};

function recommendAddBody(gh: string, pool: RecommendHit[] | null | undefined) {
  const key = gh.trim().toLowerCase();
  const hit = pool?.find((h) => h.githubUsername.trim().toLowerCase() === key);
  if (!hit) return { githubUsername: gh };
  const intro = hit.oneLiner?.trim() || null;
  const matchScore = typeof hit.score === 'number' && Number.isFinite(hit.score) ? hit.score : null;
  const systemRecommendedAt = hit.addedAt?.trim() || new Date().toISOString();
  return {
    githubUsername: gh,
    intro,
    matchScore,
    systemRecommendedAt,
  };
}

function formatSystemRecommendedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** 浏览器对 GET 链接长度有限；超长时分层：尽量保留主题进 URL，正文用剪贴板 */
const WEB_COMPOSE_URL_MAX = 2000;

/** 使用 /u/0/ 后 Gmail 对 view=cm&su&body 的识别更稳定 */
const GMAIL_COMPOSE_BASE = 'https://mail.google.com/mail/u/0/?';

function buildGmailComposeQuery(to: string, opts: { su?: string; body?: string } = {}): string {
  const p = new URLSearchParams();
  p.set('view', 'cm');
  p.set('fs', '1');
  p.set('to', to);
  if (opts.su !== undefined) p.set('su', opts.su);
  if (opts.body !== undefined) p.set('body', opts.body);
  return p.toString();
}

const OUTLOOK_COMPOSE_BASE = 'https://outlook.live.com/mail/0/deeplink/compose?';

function buildOutlookComposeQuery(to: string, opts: { subject?: string; body?: string } = {}): string {
  const p = new URLSearchParams();
  p.set('to', to);
  if (opts.subject !== undefined) p.set('subject', opts.subject);
  if (opts.body !== undefined) p.set('body', opts.body);
  return p.toString();
}

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
  /** 岗位智能推荐列表多选：GitHub 用户名 */
  const [recommendSelected, setRecommendSelected] = useState<Set<string>>(() => new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const [smartEmailCandidate, setSmartEmailCandidate] = useState<CandidateRow | null>(null);
  const [smartEmailLoading, setSmartEmailLoading] = useState(false);
  const [smartEmailResult, setSmartEmailResult] = useState<{ subject: string; body: string } | null>(null);
  const [smartEmailErr, setSmartEmailErr] = useState<string | null>(null);
  const [smartEmailSending, setSmartEmailSending] = useState(false);
  const [smartEmailSendErr, setSmartEmailSendErr] = useState<string | null>(null);
  const [smartEmailSendOk, setSmartEmailSendOk] = useState(false);
  const [smartEmailComposeHint, setSmartEmailComposeHint] = useState<string | null>(null);
  /** 是否已配置服务端代发（RESEND + 发件域），用于突出「一键发送」 */
  const [serverSendConfigured, setServerSendConfigured] = useState<boolean | null>(null);
  /** 编辑 JD：职位描述长文折叠 */
  const [jdDescriptionOpen, setJdDescriptionOpen] = useState(false);
  /** 候选人表格：待批量移除的 id */
  const [candidateRemoveSelected, setCandidateRemoveSelected] = useState<Set<string>>(() => new Set());
  const candidateSelectAllRef = useRef<HTMLInputElement>(null);
  /** 当前 JD 是否已尝试过自动拉取 GitHub 邮箱（避免重复请求） */
  const candidateEmailsResolvedJdRef = useRef<string | null>(null);
  const [recruiterOutboundEmail, setRecruiterOutboundEmail] = useState<string | null>(null);

  const recruiterContactEmail = useMemo(() => {
    if (!user) return null;
    const o = user.recruiterOutboundEmail && String(user.recruiterOutboundEmail).trim();
    const e = user.email && String(user.email).trim();
    return o || e || null;
  }, [user]);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

  const candidateIdsOnPage = useMemo(
    () => (selected?.candidates ?? []).map((c) => c.id),
    [selected],
  );

  const allCandidatesSelected = useMemo(
    () => candidateIdsOnPage.length > 0 && candidateIdsOnPage.every((id) => candidateRemoveSelected.has(id)),
    [candidateIdsOnPage, candidateRemoveSelected],
  );

  const someCandidatesSelected = useMemo(
    () => candidateIdsOnPage.some((id) => candidateRemoveSelected.has(id)),
    [candidateIdsOnPage, candidateRemoveSelected],
  );

  useEffect(() => {
    const el = candidateSelectAllRef.current;
    if (!el) return;
    el.indeterminate = someCandidatesSelected && !allCandidatesSelected;
  }, [someCandidatesSelected, allCandidatesSelected]);

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
              addedAt: typeof o.addedAt === 'string' ? o.addedAt : undefined,
            }))
            .filter((h) => h.githubUsername)
        : [];
      setPoolPending(hits);
    } catch {
      setPoolPending(null);
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
    if (!user) return;
    const raw = user.recruiterOutboundEmail;
    setRecruiterOutboundEmail(
      typeof raw === 'string' && raw.trim() ? raw.trim() : null,
    );
  }, [user]);

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
    setJdDescriptionOpen(false);
  }, [selected]);

  useEffect(() => {
    if (!selectedId) {
      setPoolPending(null);
      return;
    }
    void loadRecommendQueue(selectedId);
  }, [selectedId, loadRecommendQueue]);

  useEffect(() => {
    setRecommendSelected(new Set());
  }, [selectedId]);

  useEffect(() => {
    setCandidateRemoveSelected(new Set());
  }, [selectedId]);

  useEffect(() => {
    candidateEmailsResolvedJdRef.current = null;
  }, [selectedId, selected?.candidates?.length]);

  useEffect(() => {
    if (!selectedId || !selected?.candidates?.length) return;
    if (candidateEmailsResolvedJdRef.current === selectedId) return;
    if (!selected.candidates.some((c) => !String(c.email ?? '').trim())) return;
    candidateEmailsResolvedJdRef.current = selectedId;
    void (async () => {
      try {
        const data = (await api.recruitment.resolveCandidateEmails(selectedId)) as {
          candidates?: CandidateRow[];
        };
        if (data.candidates?.length) {
          setItems((prev) =>
            prev.map((jd) => (jd.id !== selectedId ? jd : { ...jd, candidates: data.candidates! })),
          );
        }
      } catch {
        /* 未配置 GitHub Token 或限流时跳过 */
      }
    })();
  }, [selectedId, selected]);

  useEffect(() => {
    if (!poolPending?.length) return;
    const inPool = new Set(poolPending.map((h) => h.githubUsername));
    setRecommendSelected((prev) => {
      const next = new Set([...prev].filter((u) => inPool.has(u)));
      return next.size === prev.size && [...next].every((u) => prev.has(u)) ? prev : next;
    });
  }, [poolPending]);

  const poolUsernames = useMemo(
    () => (poolPending ?? []).map((h) => h.githubUsername),
    [poolPending],
  );

  const allPoolSelected = useMemo(
    () => poolUsernames.length > 0 && poolUsernames.every((u) => recommendSelected.has(u)),
    [poolUsernames, recommendSelected],
  );

  const somePoolSelected = useMemo(
    () => poolUsernames.some((u) => recommendSelected.has(u)),
    [poolUsernames, recommendSelected],
  );

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = somePoolSelected && !allPoolSelected;
  }, [somePoolSelected, allPoolSelected]);

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
    patch: {
      displayName?: string | null;
      email?: string | null;
      notes?: string | null;
      intro?: string | null;
      pipelineStage?: string;
    },
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
      setCandidateRemoveSelected((prev) => {
        const n = new Set(prev);
        n.delete(cid);
        return n;
      });
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '删除失败');
    }
  };

  const toggleCandidateRowSelect = (cid: string) => {
    setCandidateRemoveSelected((prev) => {
      const n = new Set(prev);
      if (n.has(cid)) n.delete(cid);
      else n.add(cid);
      return n;
    });
  };

  const toggleSelectAllCandidates = () => {
    if (!selected?.candidates.length) return;
    if (allCandidatesSelected) {
      setCandidateRemoveSelected(new Set());
    } else {
      setCandidateRemoveSelected(new Set(candidateIdsOnPage));
    }
  };

  const bulkDeleteCandidates = async () => {
    if (!selectedId || candidateRemoveSelected.size === 0) return;
    const n = candidateRemoveSelected.size;
    if (!confirm(`确定从该 JD 移除选中的 ${n} 名候选人？`)) return;
    const ids = [...candidateRemoveSelected];
    setErr(null);
    try {
      for (const cid of ids) {
        await api.recruitment.deleteCandidate(selectedId, cid);
      }
      const removeSet = new Set(ids);
      setItems((prev) =>
        prev.map((jd) =>
          jd.id !== selectedId
            ? jd
            : { ...jd, candidates: jd.candidates.filter((c) => !removeSet.has(c.id)) },
        ),
      );
      setCandidateRemoveSelected(new Set());
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '批量移除失败');
      void loadAll();
    }
  };

  const addFromRecommend = async (gh: string) => {
    if (!selectedId) return;
    try {
      const data = (await api.recruitment.addCandidate(selectedId, recommendAddBody(gh, poolPending))) as {
        candidate?: CandidateRow;
      };
      if (data.candidate) {
        setItems((prev) =>
          prev.map((jd) =>
            jd.id !== selectedId ? jd : { ...jd, candidates: [data.candidate!, ...jd.candidates] },
          ),
        );
        setRecommendSelected((prev) => {
          const n = new Set(prev);
          n.delete(gh);
          return n;
        });
        void loadRecommendQueue(selectedId);
      }
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '加入候选人失败（可能已存在）');
    }
  };

  const ignoreFromRecommend = async (gh: string) => {
    if (!selectedId) return;
    setErr(null);
    try {
      await api.recruitment.recommendIgnore(selectedId, { githubUsername: gh });
      setRecommendSelected((prev) => {
        const n = new Set(prev);
        n.delete(gh);
        return n;
      });
      void loadRecommendQueue(selectedId);
    } catch (e: unknown) {
      setErr(e instanceof APIError ? e.message : '忽略失败');
    }
  };

  const toggleRecommendSelect = (gh: string) => {
    setRecommendSelected((prev) => {
      const n = new Set(prev);
      if (n.has(gh)) n.delete(gh);
      else n.add(gh);
      return n;
    });
  };

  const toggleSelectAllPool = () => {
    if (!poolPending?.length) return;
    if (allPoolSelected) {
      setRecommendSelected(new Set());
    } else {
      setRecommendSelected(new Set(poolUsernames));
    }
  };

  const addBulkFromRecommend = async () => {
    if (!selectedId || recommendSelected.size === 0) return;
    const toAdd = [...recommendSelected];
    setBulkAdding(true);
    setErr(null);
    const failures: string[] = [];
    try {
      for (const gh of toAdd) {
        try {
          const data = (await api.recruitment.addCandidate(selectedId, recommendAddBody(gh, poolPending))) as {
            candidate?: CandidateRow;
          };
          if (data.candidate) {
            setItems((prev) =>
              prev.map((jd) =>
                jd.id !== selectedId ? jd : { ...jd, candidates: [data.candidate!, ...jd.candidates] },
              ),
            );
            setRecommendSelected((prev) => {
              const n = new Set(prev);
              n.delete(gh);
              return n;
            });
            await loadRecommendQueue(selectedId);
          }
        } catch {
          failures.push(gh);
        }
      }
      if (failures.length > 0) {
        setErr(`未能加入：${failures.join('、')}（可能已存在或网络错误）`);
      }
    } finally {
      setBulkAdding(false);
    }
  };

  const loadSmartEmail = useCallback(
    async (c: CandidateRow) => {
      if (!selectedId) return;
      setSmartEmailLoading(true);
      setSmartEmailErr(null);
      setSmartEmailSendErr(null);
      setSmartEmailSendOk(false);
      setSmartEmailComposeHint(null);
      setSmartEmailResult(null);
      try {
        const data = (await api.recruitment.smartEmail(selectedId, c.id)) as {
          subject?: string;
          body?: string;
        };
        if (data.subject && data.body) {
          setSmartEmailResult({ subject: data.subject, body: data.body });
        } else {
          setSmartEmailErr('未返回完整内容');
        }
      } catch (e: unknown) {
        setSmartEmailErr(e instanceof APIError ? e.message : '生成失败');
      } finally {
        setSmartEmailLoading(false);
      }
    },
    [selectedId],
  );

  const openSmartEmail = useCallback(
    (c: CandidateRow) => {
      setSmartEmailCandidate(c);
      setSmartEmailErr(null);
      setSmartEmailSendErr(null);
      setSmartEmailSendOk(false);
      setSmartEmailComposeHint(null);
      setServerSendConfigured(null);
      setSmartEmailResult(null);
      void loadSmartEmail(c);
    },
    [loadSmartEmail],
  );

  useEffect(() => {
    if (!smartEmailCandidate) return;
    void api.recruitment
      .emailSendCapabilities()
      .then((d) => setServerSendConfigured(!!d.serverSendConfigured))
      .catch(() => setServerSendConfigured(false));
  }, [smartEmailCandidate]);

  const smartEmailCanSend = useMemo(() => {
    if (!smartEmailResult || !smartEmailCandidate) return false;
    const to = smartEmailCandidate.email?.trim() || '';
    const rt = recruiterContactEmail || '';
    return !!(to && looksLikeEmail(to) && rt && looksLikeEmail(rt));
  }, [smartEmailResult, smartEmailCandidate, recruiterContactEmail]);

  /** 网页版撰写只需候选人邮箱；不依赖 mailto / 系统默认邮件客户端 */
  const smartEmailHasCandidateMail = useMemo(() => {
    const em = smartEmailCandidate?.email?.trim();
    return !!(em && looksLikeEmail(em));
  }, [smartEmailCandidate]);

  const openWebMailCompose = useCallback(
    (provider: 'gmail' | 'outlook') => {
      if (!smartEmailResult || !smartEmailCandidate?.email?.trim()) return;
      const to = smartEmailCandidate.email.trim();
      if (!looksLikeEmail(to)) return;
      const { subject, body } = smartEmailResult;
      const fullPlain = `主题：${subject}\n\n${body}`;

      const open = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      };

      if (provider === 'gmail') {
        const full = `${GMAIL_COMPOSE_BASE}${buildGmailComposeQuery(to, { su: subject, body })}`;
        if (full.length <= WEB_COMPOSE_URL_MAX) {
          open(full);
          setSmartEmailComposeHint(null);
          return;
        }
        const subjOnly = `${GMAIL_COMPOSE_BASE}${buildGmailComposeQuery(to, { su: subject })}`;
        if (subjOnly.length <= WEB_COMPOSE_URL_MAX) {
          void navigator.clipboard.writeText(body).then(
            () => {
              open(subjOnly);
              setSmartEmailComposeHint(
                '正文较长：已将正文复制到剪贴板，请在「正文」区域粘贴（主题已自动填入）。',
              );
            },
            () => {
              open(subjOnly);
              setSmartEmailComposeHint('无法写入剪贴板：请点「复制全部」后手动粘贴正文（主题已填入）。',
              );
            },
          );
          return;
        }
        let su = subject;
        let truncated = `${GMAIL_COMPOSE_BASE}${buildGmailComposeQuery(to, { su })}`;
        for (let i = 0; i < 40 && su.length > 12 && truncated.length > WEB_COMPOSE_URL_MAX; i++) {
          su = su.slice(0, Math.max(12, su.length - 48)) + '…';
          truncated = `${GMAIL_COMPOSE_BASE}${buildGmailComposeQuery(to, { su })}`;
        }
        if (truncated.length <= WEB_COMPOSE_URL_MAX) {
          void navigator.clipboard.writeText(fullPlain).then(
            () => {
              open(truncated);
              setSmartEmailComposeHint(
                '主题过长已截断显示；完整主题与正文已复制到剪贴板，请核对后粘贴正文。',
              );
            },
            () => {
              open(truncated);
              setSmartEmailComposeHint('请使用「复制全部」后手动粘贴（主题可能已截断）。');
            },
          );
          return;
        }
        const toOnly = `${GMAIL_COMPOSE_BASE}${buildGmailComposeQuery(to)}`;
        void navigator.clipboard.writeText(fullPlain).then(
          () => {
            open(toOnly);
            setSmartEmailComposeHint('链接过长：已将完整主题与正文复制到剪贴板，请粘贴到主题与正文。');
          },
          () => {
            open(toOnly);
            setSmartEmailComposeHint('请先点「复制全部」，再在已打开的窗口中粘贴。');
          },
        );
        return;
      }

      /* Outlook 网页版：同样分层 */
      const fullOl = `${OUTLOOK_COMPOSE_BASE}${buildOutlookComposeQuery(to, { subject, body })}`;
      if (fullOl.length <= WEB_COMPOSE_URL_MAX) {
        open(fullOl);
        setSmartEmailComposeHint(null);
        return;
      }
      const subjOl = `${OUTLOOK_COMPOSE_BASE}${buildOutlookComposeQuery(to, { subject })}`;
      if (subjOl.length <= WEB_COMPOSE_URL_MAX) {
        void navigator.clipboard.writeText(body).then(
          () => {
            open(subjOl);
            setSmartEmailComposeHint(
              '正文较长：已将正文复制到剪贴板，请粘贴到正文（主题已自动填入）。',
            );
          },
          () => {
            open(subjOl);
            setSmartEmailComposeHint('无法写入剪贴板：请点「复制全部」后粘贴正文（主题已填入）。');
          },
        );
        return;
      }
      void navigator.clipboard.writeText(fullPlain).then(
        () => {
          open(`${OUTLOOK_COMPOSE_BASE}${buildOutlookComposeQuery(to)}`);
          setSmartEmailComposeHint('链接过长：已将完整主题与正文复制到剪贴板，请粘贴到邮件中。');
        },
        () => {
          open(`${OUTLOOK_COMPOSE_BASE}${buildOutlookComposeQuery(to)}`);
          setSmartEmailComposeHint('请先点「复制全部」，再在 Outlook 窗口中粘贴。');
        },
      );
    },
    [smartEmailResult, smartEmailCandidate],
  );

  const handleSendSmartEmailServer = useCallback(async () => {
    if (!selectedId || !smartEmailCandidate || !smartEmailResult || !smartEmailCanSend) return;
    setSmartEmailSending(true);
    setSmartEmailSendErr(null);
    setSmartEmailSendOk(false);
    try {
      await api.recruitment.sendSmartEmail(selectedId, smartEmailCandidate.id, {
        subject: smartEmailResult.subject,
        body: smartEmailResult.body,
      });
      setSmartEmailSendOk(true);
    } catch (e: unknown) {
      setSmartEmailSendOk(false);
      setSmartEmailSendErr(e instanceof APIError ? e.message : '发送失败');
    } finally {
      setSmartEmailSending(false);
    }
  }, [selectedId, smartEmailCandidate, smartEmailResult, smartEmailCanSend]);

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
      <>
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

        <RecruiterOutboundEmailSection
          initialEmail={recruiterOutboundEmail}
          onSaved={(e) => setRecruiterOutboundEmail(e)}
          variant="dark"
        />

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
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="text-slate-500 text-xs">职位描述</span>
                      <button
                        type="button"
                        onClick={() => setJdDescriptionOpen((v) => !v)}
                        className="text-xs text-violet-400 hover:text-violet-300 tabular-nums"
                      >
                        {jdDescriptionOpen ? '收起 ▲' : '展开编辑 ▼'}
                      </button>
                    </div>
                    {jdDescriptionOpen ? (
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={10}
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm resize-y min-h-[180px]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setJdDescriptionOpen(true)}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-slate-400 hover:bg-black/30 hover:border-white/15 transition"
                      >
                        {body.trim() ? (
                          <span className="line-clamp-4 whitespace-pre-wrap">{body}</span>
                        ) : (
                          <span className="text-slate-600">暂无正文，点击展开编辑</span>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">
                    状态：{selected.status === 'published' ? '已发布（职位列表可见）' : selected.status === 'closed' ? '已关闭' : '草稿'}
                    。新建 JD 默认已发布；关闭职位可在职位详情或 job-plaza API 操作。
                  </p>
                </section>

                <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-cyan-100">岗位智能推荐</h2>
                    {poolPending && poolPending.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                          <input
                            ref={selectAllCheckboxRef}
                            type="checkbox"
                            className="rounded border-white/30 bg-black/40"
                            checked={allPoolSelected}
                            onChange={toggleSelectAllPool}
                            disabled={bulkAdding}
                          />
                          全选
                        </label>
                        <button
                          type="button"
                          disabled={bulkAdding || recommendSelected.size === 0}
                          onClick={() => void addBulkFromRecommend()}
                          className="text-xs rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none px-3 py-1.5 font-medium"
                        >
                          加入所选
                          {recommendSelected.size > 0 ? `（${recommendSelected.size}）` : ''}
                        </button>
                      </div>
                    )}
                  </div>
                  {poolPending && poolPending.length > 0 && (
                    <ul className="space-y-2 max-h-56 overflow-y-auto mb-4">
                      {poolPending.map((h) => (
                        <li
                          key={`w-${h.githubUsername}`}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded border-white/30 bg-black/40 shrink-0"
                            checked={recommendSelected.has(h.githubUsername)}
                            onChange={() => toggleRecommendSelect(h.githubUsername)}
                            disabled={bulkAdding}
                            aria-label={`选择 ${h.githubUsername}`}
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={h.avatarUrl} alt="" className="h-9 w-9 rounded-lg border border-white/10" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-mono text-white">@{h.githubUsername}</span>
                              <span className="text-amber-200/80 text-[10px]">
                                {h.source === 'daily' ? '每日' : h.source === 'weekly' ? '周更' : '推荐'}
                                {h.addedAt ? ` · ${new Date(h.addedAt).toLocaleDateString('zh-CN')}` : ''}
                              </span>
                            </div>
                            <div className="mt-1 space-y-0.5 text-[11px] leading-snug">
                              <p className="text-slate-300">
                                <span className="text-slate-600">简介</span>{' '}
                                <span className="line-clamp-2">{h.oneLiner?.trim() ? h.oneLiner.trim() : '—'}</span>
                              </p>
                              <p className="text-slate-300">
                                <span className="text-slate-600">匹配度</span>{' '}
                                <span className="tabular-nums text-cyan-200/95">
                                  {typeof h.score === 'number' && Number.isFinite(h.score)
                                    ? h.score.toFixed(1)
                                    : '—'}
                                </span>
                              </p>
                            </div>
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
                              disabled={bulkAdding}
                              onClick={() => void addFromRecommend(h.githubUsername)}
                              className="text-xs rounded bg-white/10 hover:bg-white/15 disabled:opacity-40 px-2 py-1"
                            >
                              加入候选人
                            </button>
                            <button
                              type="button"
                              disabled={bulkAdding}
                              onClick={() => void ignoreFromRecommend(h.githubUsername)}
                              className="text-xs rounded border border-white/15 text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-40 px-2 py-1"
                            >
                              忽略
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-white">候选人</h2>
                    {selected.candidates.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <button
                          type="button"
                          disabled={candidateRemoveSelected.size === 0}
                          onClick={() => void bulkDeleteCandidates()}
                          className="rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none px-3 py-1.5 text-xs font-medium"
                        >
                          移除所选
                          {candidateRemoveSelected.size > 0 ? `（${candidateRemoveSelected.size}）` : ''}
                        </button>
                      </div>
                    ) : null}
                  </div>
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
                          <th className="w-10 py-2 pr-1 align-middle">
                            <input
                              ref={candidateSelectAllRef}
                              type="checkbox"
                              className="rounded border-white/30 bg-black/40"
                              checked={allCandidatesSelected}
                              onChange={toggleSelectAllCandidates}
                              disabled={selected.candidates.length === 0}
                              aria-label="全选候选人"
                            />
                          </th>
                          <th className="py-2 pr-3">GitHub</th>
                          <th className="py-2 pr-3 min-w-[10rem]">简介</th>
                          <th className="py-2 pr-3 whitespace-nowrap">匹配度</th>
                          <th className="py-2 pr-3 whitespace-nowrap">系统推荐时间</th>
                          <th className="py-2 pr-3 min-w-[11rem] align-bottom">
                            <span className="block">联系方式</span>
                            <span className="block text-[10px] font-normal text-slate-600 mt-0.5 leading-snug max-w-[10rem]">
                              自动从 GitHub 提取（公开资料或近期 Push）
                            </span>
                          </th>
                          <th className="py-2 pr-3">状态</th>
                          <th className="py-2 pr-3">备注</th>
                          <th className="py-2 min-w-[9rem]">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.candidates.map((c) => (
                          <tr key={c.id} className="border-b border-white/[0.06] align-top">
                            <td className="py-2 pr-1 align-top">
                              <input
                                type="checkbox"
                                className="mt-1 rounded border-white/30 bg-black/40"
                                checked={candidateRemoveSelected.has(c.id)}
                                onChange={() => toggleCandidateRowSelect(c.id)}
                                aria-label={`选择 ${c.githubUsername}`}
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <Link
                                href={`/codernet/github/${encodeURIComponent(c.githubUsername)}`}
                                className="font-mono text-violet-300 hover:underline"
                              >
                                @{c.githubUsername}
                              </Link>
                            </td>
                            <td className="py-2 pr-3 max-w-[14rem]">
                              <textarea
                                key={`intro-${c.id}-${c.updatedAt}`}
                                defaultValue={c.intro ?? ''}
                                rows={2}
                                placeholder="—"
                                className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-200 resize-y min-h-[2.5rem]"
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v !== (c.intro ?? '')) void patchCandidate(c.id, { intro: v || null });
                                }}
                              />
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-slate-300">
                              {c.matchScore != null && Number.isFinite(c.matchScore) ? c.matchScore.toFixed(1) : '—'}
                            </td>
                            <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">
                              {formatSystemRecommendedAt(c.systemRecommendedAt)}
                            </td>
                            <td className="py-2 pr-3">
                              <input
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                key={`email-${c.id}-${c.updatedAt}`}
                                defaultValue={c.email ?? ''}
                                placeholder="自动提取"
                                className="w-full min-w-[10rem] max-w-[14rem] rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-200"
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v !== (c.email ?? '')) void patchCandidate(c.id, { email: v || null });
                                }}
                              />
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
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <button
                                  type="button"
                                  onClick={() => openSmartEmail(c)}
                                  className="text-xs text-cyan-400 hover:underline"
                                >
                                  智能邮件
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCandidate(c.id)}
                                  className="text-xs text-red-400 hover:underline"
                                >
                                  移除
                                </button>
                              </div>
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

      {smartEmailCandidate ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-email-title"
          onClick={() => {
            setSmartEmailCandidate(null);
            setSmartEmailSendErr(null);
            setSmartEmailSendOk(false);
            setSmartEmailComposeHint(null);
          }}
        >
          <div
            className="w-full max-w-2xl max-h-[min(90dvh,720px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f16] shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 shrink-0">
              <h3 id="smart-email-title" className="text-sm font-semibold text-white">
                智能邮件 · @{smartEmailCandidate.githubUsername}
              </h3>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white text-lg leading-none"
                onClick={() => {
                  setSmartEmailCandidate(null);
                  setSmartEmailSendErr(null);
                  setSmartEmailSendOk(false);
                  setSmartEmailComposeHint(null);
                }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
              {smartEmailLoading ? (
                <p className="text-sm text-slate-400">正在生成邮件内容…</p>
              ) : null}
              {smartEmailErr ? (
                <p className="text-sm text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                  {smartEmailErr}
                </p>
              ) : null}
              {smartEmailResult ? (
                <>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-400 space-y-1.5">
                    <p>
                      <span className="text-slate-500">收件人（候选人）</span>{' '}
                      {smartEmailCandidate.email?.trim() && looksLikeEmail(smartEmailCandidate.email.trim()) ? (
                        <span className="font-mono text-slate-200">{smartEmailCandidate.email.trim()}</span>
                      ) : (
                        <span className="text-amber-400/95">请先在表格「联系方式」中填写或解析有效邮箱</span>
                      )}
                    </p>
                    <p>
                      <span className="text-slate-500">回复/联系（招聘方）</span>{' '}
                      {recruiterContactEmail && looksLikeEmail(recruiterContactEmail) ? (
                        <span className="font-mono text-slate-200">{recruiterContactEmail}</span>
                      ) : (
                        <span className="text-amber-400/95">请在资料中填写招聘沟通邮箱或绑定账号邮箱</span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-600 leading-snug pt-0.5">
                      推荐「通过服务器发送」：投递<strong className="text-slate-400">完整</strong>主题与正文，无浏览器链接长度截断。Gmail / Outlook
                      网页打开仅作备选，正文过长时可能需在提示下从剪贴板粘贴。
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">主题</span>
                    <input
                      readOnly
                      value={smartEmailResult.subject}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">正文</span>
                    <textarea
                      readOnly
                      rows={16}
                      value={smartEmailResult.body}
                      className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 font-mono leading-relaxed min-h-[240px]"
                    />
                    <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                      主题 {smartEmailResult.subject.length} 字 · 正文 {smartEmailResult.body.length} 字 · 生成目标正文约 650～4500 字
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pb-1 items-center">
                    <button
                      type="button"
                      disabled={!smartEmailCanSend || smartEmailSending}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-35 disabled:pointer-events-none ${
                        serverSendConfigured
                          ? 'bg-violet-600 hover:bg-violet-500 ring-2 ring-violet-400/35 shadow-lg shadow-violet-900/30'
                          : 'border border-violet-500/50 bg-violet-950/50 hover:bg-violet-900/60'
                      }`}
                      onClick={() => void handleSendSmartEmailServer()}
                      title="从服务端投递完整 HTML 邮件（需 RESEND + RECRUITMENT_SMART_EMAIL_FROM）；无 URL 截断"
                    >
                      {smartEmailSending ? '发送中…' : '一键发送（完整邮件）'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs"
                      onClick={() => void navigator.clipboard.writeText(smartEmailResult.subject)}
                    >
                      复制主题
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs"
                      onClick={() => void navigator.clipboard.writeText(smartEmailResult.body)}
                    >
                      复制正文
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-violet-600/80 hover:bg-violet-500/90 px-3 py-1.5 text-xs font-medium text-white"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `主题：${smartEmailResult.subject}\n\n${smartEmailResult.body}`,
                        )
                      }
                    >
                      复制全部
                    </button>
                    <button
                      type="button"
                      disabled={!smartEmailHasCandidateMail}
                      className="rounded-lg bg-emerald-700/90 hover:bg-emerald-600 disabled:opacity-35 disabled:pointer-events-none px-3 py-1.5 text-xs font-medium text-white"
                      onClick={() => openWebMailCompose('gmail')}
                      title={
                        smartEmailHasCandidateMail
                          ? '在浏览器新标签打开 Gmail 撰写（需已登录 Google 账号）'
                          : '请先在表格中填写候选人有效邮箱'
                      }
                    >
                      在 Gmail 中打开
                    </button>
                    <button
                      type="button"
                      disabled={!smartEmailHasCandidateMail}
                      className="rounded-lg bg-sky-800/90 hover:bg-sky-700 disabled:opacity-35 disabled:pointer-events-none px-3 py-1.5 text-xs font-medium text-white"
                      onClick={() => openWebMailCompose('outlook')}
                      title={
                        smartEmailHasCandidateMail
                          ? '在浏览器新标签打开 Outlook 网页版撰写（需已登录微软账号）'
                          : '请先在表格中填写候选人有效邮箱'
                      }
                    >
                      在 Outlook 网页中打开
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                      onClick={() => smartEmailCandidate && void loadSmartEmail(smartEmailCandidate)}
                      disabled={smartEmailLoading}
                    >
                      重新生成
                    </button>
                  </div>
                  {smartEmailResult && serverSendConfigured === false ? (
                    <p className="text-[10px] text-amber-400/90">
                      未检测到服务端发信配置（RESEND + RECRUITMENT_SMART_EMAIL_FROM），「一键发送」不可用；可复制全文或使用 Gmail / Outlook 网页。
                    </p>
                  ) : null}
                  {smartEmailComposeHint ? (
                    <p className="text-xs text-slate-300/95 leading-relaxed rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
                      {smartEmailComposeHint}
                    </p>
                  ) : null}
                  {smartEmailSendOk ? (
                    <p className="text-xs text-emerald-400/95">已通过服务器发送（候选人将收到邮件，回复会到您填写的联系邮箱）。</p>
                  ) : null}
                  {smartEmailSendErr ? (
                    <p className="text-xs text-amber-300/95 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1.5">
                      {smartEmailSendErr}
                      {smartEmailSendErr.includes('未配置') || smartEmailSendErr.includes('RECRUITMENT')
                        ? ' 可改用「在 Gmail 中打开」或「在 Outlook 网页中打开」。'
                        : ''}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </>
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
