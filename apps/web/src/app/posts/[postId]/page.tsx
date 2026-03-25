'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { ShareButton } from '@/components/ShareButton';
import { WorkCommentsSection } from '@/components/WorkCommentsSection';
import { MarkdownBody } from '@/components/MarkdownBody';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, resolveMediaUrl } from '@/lib/api';
import { excerptPlainText } from '@/lib/feed-post-markdown';

interface PostDetail {
  id: string;
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  createdAt: string;
  likedByMe?: boolean;
  favoritedByMe?: boolean;
  author: { id: string; username: string; avatarUrl?: string | null };
}

const layoutPost = {
  hideHeader: true as const,
  flatBackground: true,
  showSidebar: false as const,
  hideLeftNav: true as const,
};

/** 与微信公众号正文类似的窄列阅读宽度，左右留白更大 */
const articleContainerClass =
  'mx-auto w-full max-w-[680px] px-4 pb-8 pt-6 sm:px-5 lg:px-6';
const articleMainClass = 'mx-auto w-full max-w-[680px] px-4 pb-32 pt-6 sm:px-5 lg:px-6';
const bottomBarInnerClass =
  'mx-auto flex w-full max-w-[680px] flex-wrap items-center gap-4 px-4 py-3 sm:px-5 lg:px-6';

export default function FeedPostDetailPage() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useParams();
  const postId = params.postId as string;

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [followChecking, setFollowChecking] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followToggling, setFollowToggling] = useState(false);
  const [followToast, setFollowToast] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE_URL}/api/feed-posts/${postId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error('load failed');
      const data = (await res.json()) as PostDetail;
      setPost({
        ...data,
        favoriteCount: typeof data.favoriteCount === 'number' ? data.favoriteCount : 0,
        likedByMe: Boolean(data.likedByMe),
        favoritedByMe: Boolean(data.favoritedByMe),
      });
      setCommentCount(typeof data.commentCount === 'number' ? data.commentCount : 0);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  useEffect(() => {
    if (!post) return;
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
        if (String(me.id) === String(post.author.id)) {
          setFollowChecking(false);
          return;
        }
        const fr = await fetch(
          `${API_BASE_URL}/api/user-follows/check/${encodeURIComponent(String(post.author.id))}`,
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
  }, [post?.author.id, post?.id]);

  const handleFollowClick = async () => {
    if (!post) return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.alert(t('workDetail.followNeedLogin'));
      router.push(`/login?redirect=/posts/${encodeURIComponent(postId)}`);
      return;
    }
    if (String(currentUserId) === String(post.author.id)) {
      window.alert(t('workDetail.followIsSelf'));
      return;
    }
    if (followToggling || followChecking) return;
    setFollowToggling(true);
    setFollowToast(null);
    try {
      const method = following ? 'DELETE' : 'POST';
      const hostSeg = encodeURIComponent(String(post.author.id));
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
        window.alert(t('workDetail.followSessionExpired'));
        router.push(`/login?redirect=/posts/${encodeURIComponent(postId)}`);
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

  const scrollToComments = () => {
    const el = document.getElementById('feed-post-comments');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleLike = async () => {
    if (!post || likeBusy) return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.alert(t('workDetail.followNeedLogin'));
      router.push(`/login?redirect=/posts/${encodeURIComponent(postId)}`);
      return;
    }
    setLikeBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feed-posts/${encodeURIComponent(postId)}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { liked?: boolean; likeCount?: number; error?: string };
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.alert(t('workDetail.followSessionExpired'));
        router.push(`/login?redirect=/posts/${encodeURIComponent(postId)}`);
        return;
      }
      if (!res.ok) {
        window.alert(typeof data.error === 'string' ? data.error : '操作失败');
        return;
      }
      setPost((prev) =>
        prev
          ? {
              ...prev,
              likedByMe: Boolean(data.liked),
              likeCount: typeof data.likeCount === 'number' ? data.likeCount : prev.likeCount,
            }
          : null
      );
    } catch {
      window.alert(t('workDetail.followFailed'));
    } finally {
      setLikeBusy(false);
    }
  };

  const toggleFavorite = async () => {
    if (!post || favoriteBusy) return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.alert(t('workDetail.followNeedLogin'));
      router.push(`/login?redirect=/posts/${encodeURIComponent(postId)}`);
      return;
    }
    setFavoriteBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feed-posts/${encodeURIComponent(postId)}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { favorited?: boolean; favoriteCount?: number; error?: string };
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.alert(t('workDetail.followSessionExpired'));
        router.push(`/login?redirect=/posts/${encodeURIComponent(postId)}`);
        return;
      }
      if (!res.ok) {
        window.alert(typeof data.error === 'string' ? data.error : '操作失败');
        return;
      }
      setPost((prev) =>
        prev
          ? {
              ...prev,
              favoritedByMe: Boolean(data.favorited),
              favoriteCount: typeof data.favoriteCount === 'number' ? data.favoriteCount : prev.favoriteCount,
            }
          : null
      );
    } catch {
      window.alert(t('workDetail.followFailed'));
    } finally {
      setFavoriteBusy(false);
    }
  };

  const interactionStatsRow = post ? (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-gray-800 sm:gap-4 md:gap-6">
      <button
        type="button"
        onClick={() => void toggleLike()}
        disabled={likeBusy}
        title={t('workDetail.interactionLike')}
        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[15px] tabular-nums transition active:scale-95 disabled:opacity-50 ${
          post.likedByMe ? 'bg-amber-50 ring-2 ring-amber-200/80' : 'hover:bg-gray-100'
        }`}
      >
        <span className="text-xl" aria-hidden>
          👍
        </span>
        {post.likeCount}
      </button>
      <ShareButton
        variant="stat"
        url={`/posts/${postId}`}
        title={post.title}
        text={excerptPlainText(post.content, 120)}
        statCount={0}
      />
      <button
        type="button"
        onClick={() => void toggleFavorite()}
        disabled={favoriteBusy}
        title={t('workDetail.interactionCollect')}
        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[15px] tabular-nums text-gray-800 transition active:scale-95 disabled:opacity-50 ${
          post.favoritedByMe ? 'bg-rose-50 ring-2 ring-rose-200/80' : 'hover:bg-gray-100'
        }`}
      >
        <span className="text-xl" aria-hidden>
          ❤️
        </span>
        {post.favoriteCount}
      </button>
      <button
        type="button"
        onClick={scrollToComments}
        title={t('workDetail.commentsTitle')}
        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[15px] tabular-nums transition hover:bg-gray-100 active:scale-95"
      >
        <span className="text-xl" aria-hidden>
          💬
        </span>
        {commentCount}
      </button>
    </div>
  ) : null;

  if (loading) {
    return (
      <MainLayout {...layoutPost}>
        <div className={articleContainerClass}>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-lobster">
            ← {t('feedPost.backHome')}
          </Link>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster"></div>
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (notFound || !post) {
    return (
      <MainLayout {...layoutPost}>
        <div className={articleContainerClass}>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-lobster">
            ← {t('feedPost.backHome')}
          </Link>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="mb-4 text-red-600">{t('feedPost.notFound')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const publishedAt = post.createdAt ? new Date(post.createdAt) : null;

  return (
    <MainLayout {...layoutPost}>
      <>
        <div className={articleMainClass}>
          <div>
            <article className="min-w-0">
              <div className="mb-5">
                <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-lobster">
                  ← {t('feedPost.backHome')}
                </Link>
              </div>
              <h1 className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">{post.title}</h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                <Link href={`/host/${post.author.id}`} className="flex items-center gap-1.5 hover:text-lobster">
                  {post.author.avatarUrl ? (
                    <img src={resolveMediaUrl(post.author.avatarUrl)} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-lobster text-xs text-white">
                      {post.author.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium text-gray-800">{post.author.username}</span>
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
                <span className="text-gray-500 tabular-nums">👁️ {post.viewCount}</span>
              </div>

              {post.imageUrls?.[0] && (
                <div className="mt-8 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  <img
                    src={resolveMediaUrl(post.imageUrls[0])}
                    alt=""
                    className="mx-auto block h-auto w-full max-w-full object-contain"
                  />
                </div>
              )}

              <div className="mt-10 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b bg-gray-50 px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-900">{t('feedPost.bodySectionTitle')}</h2>
                </div>
                <div className="px-4 py-4">
                  <MarkdownBody content={post.content} />
                </div>
              </div>

              <WorkCommentsSection
                scope="feedPost"
                postId={postId}
                anchorId="feed-post-comments"
                onCountChange={setCommentCount}
              />
            </article>
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
          <div className={bottomBarInnerClass}>
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-3">
              <Link
                href={`/host/${post.author.id}`}
                className="flex min-w-0 max-w-[60vw] items-center gap-2 rounded-lg outline-none ring-offset-2 hover:bg-gray-50/80 focus-visible:ring-2 focus-visible:ring-lobster/30 sm:max-w-none"
              >
                {post.author.avatarUrl ? (
                  <img
                    src={resolveMediaUrl(post.author.avatarUrl)}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lobster text-sm text-white">
                    {post.author.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate font-medium text-gray-900">{post.author.username}</span>
              </Link>
              {String(currentUserId) === String(post.author.id) ? (
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
