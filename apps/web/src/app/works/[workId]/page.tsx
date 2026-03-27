'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { ShareButton } from '@/components/ShareButton';
import { VideoUrlPlayer } from '@/components/VideoUrlPlayer';
import { WorkCommentsSection } from '@/components/WorkCommentsSection';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL } from '@/lib/api';
import { SHOW_LIVE_FEATURES } from '@/lib/feature-flags';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  videoUrl?: string;
  timestamp: Date;
}

interface Work {
  id: string;
  title: string;
  description?: string;
  resultSummary?: string;
  skillMarkdown?: string;
  lobsterName: string;
  tags?: string[];
  coverImage?: string;
  videoUrl?: string;
  /** 纯视频投稿（无工作室对话时间线） */
  contentKind?: 'video';
  viewCount: number;
  likeCount: number;
  shareCount?: number;
  commentCount?: number;
  publishedAt: Date;
  messages: Message[];
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  authorLiveRoom?: {
    id: string;
    title: string;
    lobsterName: string;
    viewerCount: number;
  } | null;
}

function extractSkillFromMessages(messages: Message[]): string | null {
  const blocks: string[] = [];
  const seen = new Set<string>();

  const addIfSkill = (raw: string) => {
    if (!raw.startsWith('---') || !raw.includes('name:')) return;
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    blocks.push(raw.trim());
  };

  for (const msg of messages) {
    if (msg.sender !== 'agent' || !msg.content) continue;
    const blockRe = /```(?:md|yaml|skill)?\s*\n([\s\S]*?)```/g;
    let m;
    while ((m = blockRe.exec(msg.content)) !== null) {
      addIfSkill(m[1].trim());
    }
    const bareRe = /```\s*\n([\s\S]*?)```/g;
    while ((m = bareRe.exec(msg.content)) !== null) {
      addIfSkill(m[1].trim());
    }
  }

  if (blocks.length === 0) return null;
  return blocks.join('\n\n');
}

const layoutWork = { hideHeader: true as const, flatBackground: true, showSidebar: false as const, hideLeftNav: true as const };

export default function WorkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const { t } = useLocale();

  const [work, setWork] = useState<Work | null>(null);
  const [linkedSkillId, setLinkedSkillId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedSkill, setCopiedSkill] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [followChecking, setFollowChecking] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followToggling, setFollowToggling] = useState(false);
  const [followToast, setFollowToast] = useState<string | null>(null);

  const getSkillContent = useCallback((): string | null => {
    if (!work) return null;
    if (work.skillMarkdown?.trim()) return work.skillMarkdown.trim();
    return extractSkillFromMessages(work.messages);
  }, [work]);

  const copySkillMd = useCallback(async () => {
    const content = getSkillContent();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSkill(true);
      setTimeout(() => setCopiedSkill(false), 2000);
    } catch {
      // ignore
    }
  }, [getSkillContent]);

  useEffect(() => {
    loadWork();
  }, [workId]);

  useEffect(() => {
    if (!work) return;
    let cancelled = false;
    const checkFollow = async () => {
      setFollowChecking(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setCurrentUserId(null);
        setFollowing(false);
        setFollowChecking(false);
        return;
      }
      try {
        const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok || cancelled) {
          setFollowChecking(false);
          return;
        }
        const me = await meRes.json();
        if (cancelled) return;
        setCurrentUserId(me.id);
        if (String(me.id) === String(work.author.id)) {
          setFollowChecking(false);
          return;
        }
        const fr = await fetch(
          `${API_BASE_URL}/api/user-follows/check/${encodeURIComponent(String(work.author.id))}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (fr.ok && !cancelled) {
          const { following: f } = await fr.json();
          setFollowing(Boolean(f));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setFollowChecking(false);
      }
    };
    void checkFollow();
    return () => {
      cancelled = true;
    };
  }, [work?.author.id, work?.id]);

  const loadWork = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/api/works/${workId}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to load work');
      }

      const workData = await response.json();
      setWork(workData);
      setCommentCount(typeof workData.commentCount === 'number' ? workData.commentCount : 0);
      const skillRes = await fetch(`${API_BASE_URL}/api/skills?sourceWorkId=${workId}`);
      if (skillRes.ok) {
        const skillData = await skillRes.json();
        const skills = skillData.skills || [];
        if (skills.length > 0) setLinkedSkillId(skills[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const recordShareUrl = `${API_BASE_URL.replace(/\/$/, '')}/api/works/${workId}/share`;

  if (loading) {
    return (
      <MainLayout {...layoutWork}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster"></div>
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !work) {
    return (
      <MainLayout {...layoutWork}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="mb-4 text-red-600">{error || t('workDetail.notFound')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const skillText = getSkillContent();
  const hasSkillPanel = Boolean(skillText || linkedSkillId);
  const hasSummary = Boolean(work.resultSummary || work.description);
  const showRightColumn = hasSkillPanel || hasSummary;
  const isVideoOnly = work.contentKind === 'video';
  const publishedAt = work.publishedAt ? new Date(work.publishedAt) : null;
  const shareCount = typeof work.shareCount === 'number' ? work.shareCount : 0;

  /** 截图1：赞 / 分享 / 心 / 评论 — 放在底栏右侧红框内（截图2） */
  const handleFollowClick = async () => {
    if (!work) return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.alert(t('workDetail.followNeedLogin'));
      router.push(`/login?redirect=/works/${encodeURIComponent(workId)}`);
      return;
    }
    if (String(currentUserId) === String(work.author.id)) {
      window.alert(t('workDetail.followIsSelf'));
      return;
    }
    if (followToggling || followChecking) return;
    setFollowToggling(true);
    setFollowToast(null);
    try {
      const method = following ? 'DELETE' : 'POST';
      const hostSeg = encodeURIComponent(String(work.author.id));
      const res = await fetch(`${API_BASE_URL}/api/user-follows/${hostSeg}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const next = !following;
        setFollowing(next);
        setFollowToast(next ? t('workDetail.followSuccess') : t('workDetail.unfollowSuccess'));
        window.setTimeout(() => setFollowToast(null), 2800);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.status === 401) {
        localStorage.removeItem('token');
        router.push(`/login?redirect=/works/${encodeURIComponent(workId)}`);
        return;
      }
      if (res.status === 400 && body.code === 'SELF_FOLLOW') {
        window.alert(t('workDetail.followIsSelf'));
        return;
      }
      window.alert(typeof body.error === 'string' ? body.error : t('workDetail.followFailed'));
    } catch {
      window.alert(t('workDetail.followFailed'));
    } finally {
      setFollowToggling(false);
    }
  };

  const interactionStatsRow = (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-4 text-gray-800 sm:gap-6 md:gap-8">
      <span className="flex items-center gap-1.5 text-[15px] tabular-nums">
        <span className="text-xl" aria-hidden>
          👍
        </span>
        {work.likeCount}
      </span>
      <ShareButton
        variant="stat"
        url={`/works/${workId}`}
        title={work.title}
        text={work.resultSummary || work.description || `${work.lobsterName} 的作品 - ${work.title}`}
        statCount={shareCount}
        recordShareUrl={recordShareUrl}
      />
      <span
        className="flex items-center gap-1.5 text-[15px] tabular-nums text-gray-800"
        title={t('workDetail.interactionCollect')}
      >
        <span className="text-xl" aria-hidden>
          ❤️
        </span>
        {work.likeCount}
      </span>
      <span className="flex items-center gap-1.5 text-[15px] tabular-nums">
        <span className="text-xl" aria-hidden>
          💬
        </span>
        {commentCount}
      </span>
    </div>
  );

  return (
    <MainLayout {...layoutWork}>
      <>
        <div className="mx-auto max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
          <div
            className={
              showRightColumn
                ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_320px]'
                : ''
            }
          >
            <article className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">{work.title}</h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                <Link href={`/host/${work.author.id}`} className="flex items-center gap-1.5 hover:text-lobster">
                  {work.author.avatarUrl ? (
                    <img src={work.author.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-lobster text-xs text-white">
                      {work.author.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium text-gray-800">{work.author.username}</span>
                </Link>
                {publishedAt && (
                  <time dateTime={publishedAt.toISOString()} className="text-gray-500">
                    {publishedAt.toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                )}
                {SHOW_LIVE_FEATURES && work.authorLiveRoom && (
                  <Link
                    href={`/rooms/${work.authorLiveRoom.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/25"
                  >
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    {t('workDetail.authorLive')}
                  </Link>
                )}
              </div>

              {work.tags && work.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {work.tags.map((tag, index) => (
                    <span key={index} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {isVideoOnly && (work.description || work.resultSummary) && (
                <div className="mt-6 max-w-3xl text-base leading-relaxed text-gray-700">
                  <p className="whitespace-pre-wrap">{work.resultSummary || work.description}</p>
                </div>
              )}

              {work.videoUrl && (
                <div className="mt-8">
                  <VideoUrlPlayer url={work.videoUrl} className="w-full" />
                </div>
              )}

              {!isVideoOnly && (
                <div className="mt-10 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="border-b bg-gray-50 px-4 py-3">
                    <h2 className="text-base font-semibold text-gray-900">{t('workDetail.creativeProcess')}</h2>
                    <p className="mt-0.5 text-xs leading-snug text-gray-600">
                      {t('workDetail.processDesc', { name: work.lobsterName })}
                    </p>
                  </div>
                  <div className="space-y-1 px-2 py-3">
                    {work.messages.length === 0 ? (
                      <div className="py-8 text-center text-sm text-gray-500">{t('workDetail.noMessages')}</div>
                    ) : (
                      work.messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[min(98%,40rem)] rounded-lg px-2.5 py-1.5 ${
                              msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-purple-100 text-gray-900'
                            }`}
                          >
                            <div className="mb-0.5 flex flex-wrap items-baseline gap-1 leading-none">
                              <span className="max-w-[10rem] truncate text-[10px] font-semibold opacity-90">
                                {msg.sender === 'user' ? work.author.username : work.lobsterName}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums opacity-70">
                                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            {msg.videoUrl && (
                              <div className="mb-1 max-w-sm overflow-hidden rounded">
                                <VideoUrlPlayer url={msg.videoUrl} />
                              </div>
                            )}
                            {msg.content ? (
                              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{msg.content}</p>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <WorkCommentsSection scope="work" workId={workId} onCountChange={setCommentCount} />
            </article>

            {showRightColumn && (
              <aside className="mt-10 min-w-0 lg:mt-0">
                <div className="space-y-4 lg:sticky lg:top-4">
                  {hasSkillPanel && (
                    <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm">
                      <h2 className="text-base font-bold text-gray-900">{t('workDetail.skillSidebarTitle')}</h2>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('workDetail.skillSidebarDesc')}</p>
                      {linkedSkillId && (
                        <p className="mt-2 text-xs font-medium text-lobster">{t('workDetail.linkedSkillHint')}</p>
                      )}
                      {skillText ? (
                        <>
                          <pre className="mt-3 max-h-[min(50vh,28rem)] overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-3 text-[11px] leading-snug text-gray-800">
                            {skillText.length > 8000 ? `${skillText.slice(0, 8000)}…` : skillText}
                          </pre>
                          <button
                            type="button"
                            onClick={() => void copySkillMd()}
                            className="mt-3 w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                          >
                            {copiedSkill ? t('workDetail.copied') : t('workDetail.copySkillMd')}
                          </button>
                        </>
                      ) : linkedSkillId ? (
                        <p className="mt-3 text-sm text-gray-600">{t('workDetail.noSkillToCopy')}</p>
                      ) : null}
                    </div>
                  )}

                  {hasSummary && (
                    <section className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm">
                      <h2 className="text-base font-bold text-gray-900">{t('workDetail.aiSummary')}</h2>
                      <div
                        className={`mt-3 rounded-xl p-4 ${
                          work.resultSummary ? 'border border-red-300/80 bg-rose-50/90' : 'border border-gray-200 bg-gray-50'
                        }`}
                      >
                        <p
                          className={
                            work.resultSummary
                              ? 'text-sm font-medium leading-relaxed text-gray-800'
                              : 'text-sm text-gray-600'
                          }
                        >
                          {work.resultSummary || work.description}
                        </p>
                      </div>
                    </section>
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>

        {followToast && (
          <div
            role="status"
            className="fixed bottom-[5.5rem] left-1/2 z-40 max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm text-white shadow-lg"
          >
            {followToast}
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200/80 bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-3">
              <Link
                href={`/host/${work.author.id}`}
                className="flex min-w-0 max-w-[60vw] items-center gap-2 rounded-lg outline-none ring-offset-2 hover:bg-gray-50/80 focus-visible:ring-2 focus-visible:ring-lobster/30 sm:max-w-none"
              >
                {work.author.avatarUrl ? (
                  <img src={work.author.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lobster text-sm text-white">
                    {work.author.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate font-medium text-gray-900">{work.author.username}</span>
              </Link>
              {String(currentUserId) === String(work.author.id) ? (
                <span className="shrink-0 text-xs text-gray-400">{t('workDetail.followIsSelf')}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleFollowClick()}
                  disabled={followToggling || followChecking}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition disabled:opacity-50 ${
                    following
                      ? 'border border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}
                >
                  {followToggling ? '…' : following ? t('workDetail.followingLabel') : t('workDetail.followAuthor')}
                </button>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center sm:pl-2">
              <div className="w-fit max-w-full">{interactionStatsRow}</div>
            </div>
          </div>
        </div>
      </>
    </MainLayout>
  );
}
