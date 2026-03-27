'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { FeedPostBodyEditor, type FeedPostBodyEditorHandle } from '@/components/FeedPostBodyEditor';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, api } from '@/lib/api';
import {
  FEED_IMAGE_TEXT_MAX_CONTENT,
  FEED_POST_MAX_CONTENT,
  FEED_POST_MAX_TITLE,
} from '@/lib/feed-post-markdown';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 9;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

interface PostDetail {
  id: string;
  kind?: 'article' | 'imageText';
  title: string;
  content: string;
  imageUrls: string[];
  author: { id: string; username: string };
}

export default function EditFeedPostPage() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useParams();
  const postId = params.postId as string;

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // 共用
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState(false);

  // ── 文章专用 ──────────────────────────────────────────────
  const [bodyEditorKey, setBodyEditorKey] = useState(0);
  const bodyEditorRef = useRef<FeedPostBodyEditorHandle>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [coverExisting, setCoverExisting] = useState<string | null>(null); // 已有封面URL
  const [inlineImageBusy, setInlineImageBusy] = useState(false);

  // ── 图文专用 ──────────────────────────────────────────────
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]); // 已有URL 或 base64
  const [coverIdx, setCoverIdx] = useState<number | null>(null);

  // ── 加载帖子 ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem('token');
      if (!token) { router.push(`/login?redirect=/posts/edit/${postId}`); return; }
      try {
        const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        const me = await meRes.json().catch(() => ({})) as { id?: string };
        const res = await fetch(`${API_BASE_URL}/api/feed-posts/${postId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 404) { setForbidden(true); setLoading(false); return; }
        const data = await res.json() as PostDetail;
        if (String(me.id) !== String(data.author.id)) { setForbidden(true); setLoading(false); return; }

        setPost(data);
        setTitle(data.title);
        setContent(data.content);

        const kind = data.kind ?? 'article';
        if (kind === 'imageText') {
          setImages(data.imageUrls);
          setCoverIdx(0); // 第一张是封面
        } else {
          // 文章：封面是 imageUrls[0]，正文用 editor
          setCoverExisting(data.imageUrls[0] ?? null);
          setBodyEditorKey((k) => k + 1);
        }
      } catch {
        setForbidden(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [postId, router]);

  const kind = post?.kind ?? 'article';
  const titleLen = title.length;
  const bodyLen = content.length;
  const titleCountLabel = useMemo(() => `${titleLen}/${FEED_POST_MAX_TITLE}`, [titleLen]);
  const bodyCountLabel = useMemo(
    () => `${bodyLen}/${kind === 'imageText' ? FEED_IMAGE_TEXT_MAX_CONTENT : FEED_POST_MAX_CONTENT}`,
    [bodyLen, kind],
  );

  // ── 文章：插入行内图片 ─────────────────────────────────────
  const insertMarkdownAtCursor = useCallback((snippet: string) => {
    bodyEditorRef.current?.insertSnippet(snippet);
  }, []);

  const onPickInlineImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_BYTES) { setError('单张图片不超过 5MB'); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    setInlineImageBusy(true);
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch(`${API_BASE_URL}/api/feed-posts/inline-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || '图片上传失败'); return; }
      insertMarkdownAtCursor(`\n![图片](${String(data.url)})\n`);
    } catch { setError('网络错误'); }
    finally { setInlineImageBusy(false); }
  };

  const onPickCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_BYTES) { setError('单张图片不超过 5MB'); return; }
    try { setCoverDataUrl(await readFileAsDataUrl(file)); setCoverExisting(null); }
    catch { setError('读取图片失败'); }
  };

  // ── 图文：选图 ────────────────────────────────────────────
  const onPickImageFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileArray = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!fileArray.length) return;
    setError('');
    const toAdd: string[] = [];
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_BYTES) { setError('单张图片不超过 5MB'); return; }
      try { toAdd.push(await readFileAsDataUrl(file)); }
      catch { setError('读取图片失败'); return; }
    }
    if (!toAdd.length) return;
    setImages((prev) => {
      const next = [...prev];
      for (const d of toAdd) { if (next.length >= MAX_IMAGES) break; next.push(d); }
      return next;
    });
  };

  const removeImageAt = (i: number) => {
    setImages((prev) => prev.filter((_, j) => j !== i));
    setCoverIdx((prev) => {
      if (prev === null) return null;
      if (prev === i) return null;
      if (prev > i) return prev - 1;
      return prev;
    });
  };

  const moveImage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    setImages((prev) => {
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setCoverIdx((prev) => {
      if (prev === i) return j;
      if (prev === j) return i;
      return prev;
    });
  };

  // ── 提交 ──────────────────────────────────────────────────
  const submit = async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) { router.push(`/login?redirect=/posts/edit/${postId}`); return; }
    if (!title.trim()) { setError('请填写标题'); return; }
    if (title.length > FEED_POST_MAX_TITLE) { setError('标题过长'); return; }

    const body: Parameters<typeof api.feedPosts.update>[1] = {
      title: title.trim(),
      content: content.trim(),
    };

    if (kind === 'imageText') {
      if (!content.trim()) { setError('请填写正文'); return; }
      if (content.length > FEED_IMAGE_TEXT_MAX_CONTENT) { setError(`正文不超过 ${FEED_IMAGE_TEXT_MAX_CONTENT} 字`); return; }
      if (images.length < 1) { setError('请至少保留一张图片'); return; }
      if (coverIdx === null) { setError('请选择封面图片'); return; }
      body.images = images;
      body.coverIdx = coverIdx;
    } else {
      if (!content.trim()) { setError('请填写正文'); return; }
      if (content.length > FEED_POST_MAX_CONTENT) { setError('正文超出字数限制'); return; }
      // 封面：若有新图用新图，否则传已有URL
      const coverSrc = coverDataUrl ?? coverExisting;
      if (!coverSrc) { setError('请上传封面图片'); return; }
      body.images = [coverSrc];
    }

    setSubmitting(true);
    try {
      await api.feedPosts.update(postId, body);
      setSuccessToast(true);
      window.setTimeout(() => {
        setSuccessToast(false);
        router.push(`/posts/${postId}`);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-lobster" />
        </div>
      </MainLayout>
    );
  }

  if (forbidden || !post) {
    return (
      <MainLayout>
        <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-gray-600">帖子不存在或无权编辑</p>
          <Link href="/" className="mt-4 inline-block text-lobster hover:underline">← 返回首页</Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href={`/posts/${postId}`} className="mb-6 inline-block text-sm text-gray-500 hover:text-lobster">
          ← 返回帖子
        </Link>

        <h1 className="text-2xl font-bold text-gray-900">
          编辑{kind === 'imageText' ? '图文' : '文章'}
        </h1>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="mt-6 space-y-6">

          {/* 标题 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">标题</label>
              <span className="text-xs tabular-nums text-gray-400">{titleCountLabel}</span>
            </div>
            <input
              type="text"
              value={title}
              maxLength={FEED_POST_MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
            />
          </div>

          {/* ── 文章编辑器 ── */}
          {kind !== 'imageText' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={inlineImageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onPickInlineImage} />
                <button
                  type="button"
                  disabled={inlineImageBusy}
                  onMouseDown={() => bodyEditorRef.current?.captureSelectionNow()}
                  onClick={() => inlineImageInputRef.current?.click()}
                  className="rounded-full border border-lobster/40 bg-rose-50 px-3 py-1 text-xs font-medium text-lobster hover:bg-rose-100 disabled:opacity-50"
                >
                  {inlineImageBusy ? '上传中…' : '插入正文图片'}
                </button>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">正文</label>
                  <span className={`text-xs tabular-nums ${bodyLen > FEED_POST_MAX_CONTENT ? 'text-red-600' : 'text-gray-400'}`}>{bodyCountLabel}</span>
                </div>
                <FeedPostBodyEditor
                  key={bodyEditorKey}
                  ref={bodyEditorRef}
                  initialContent={content}
                  onChange={(v) => setContent(v.slice(0, FEED_POST_MAX_CONTENT))}
                  maxLength={FEED_POST_MAX_CONTENT}
                  minRows={12}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">封面图片</label>
                <input ref={coverFileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onPickCoverFile} />
                <button
                  type="button"
                  onClick={() => coverFileInputRef.current?.click()}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
                >
                  {coverDataUrl || coverExisting ? '更换封面' : '选择封面'}
                </button>
                {(coverDataUrl ?? coverExisting) && (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverDataUrl ?? `${API_BASE_URL}${coverExisting}`}
                      alt=""
                      className="mx-auto block max-h-64 w-full object-contain"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── 图文编辑器 ── */}
          {kind === 'imageText' && (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">图片</label>
                  <span className="text-xs text-gray-400">
                    {images.length}/{MAX_IMAGES} 张
                    {coverIdx !== null
                      ? <span className="ml-2 font-medium text-lobster">· 已选第 {coverIdx + 1} 张为封面</span>
                      : <span className="ml-2 text-amber-500">· 请点击「设为封面」</span>
                    }
                  </span>
                </div>
                <input ref={imageFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPickImageFiles(e)} />
                <button
                  type="button"
                  disabled={images.length >= MAX_IMAGES}
                  onClick={() => imageFileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] min-w-[9rem] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
                >
                  ＋ 添加图片
                </button>

                {images.length > 0 && (
                  <ul className="mt-4 space-y-3">
                    {images.map((src, i) => {
                      const isCover = coverIdx === i;
                      const displaySrc = src.startsWith('data:') ? src : `${API_BASE_URL}${src}`;
                      return (
                        <li key={`${i}-${src.slice(0, 20)}`}
                          className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${isCover ? 'border-lobster/40 ring-1 ring-lobster/20' : 'border-gray-100'}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={displaySrc} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                          <div className="min-w-0 flex-1">
                            {isCover
                              ? <span className="inline-block rounded-full bg-lobster px-2 py-0.5 text-xs font-semibold text-white">封面</span>
                              : <span className="text-xs text-gray-400">第 {i + 1} 张</span>
                            }
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!isCover && (
                              <button type="button" onClick={() => setCoverIdx(i)}
                                className="rounded-lg border border-lobster/40 px-2 py-1 text-xs text-lobster hover:bg-lobster/5">
                                设为封面
                              </button>
                            )}
                            <button type="button" disabled={i === 0} onClick={() => moveImage(i, -1)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30">上移</button>
                            <button type="button" disabled={i === images.length - 1} onClick={() => moveImage(i, 1)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30">下移</button>
                            <button type="button" onClick={() => removeImageAt(i)}
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">删除</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">正文</label>
                  <span className={`text-xs tabular-nums ${bodyLen > FEED_IMAGE_TEXT_MAX_CONTENT ? 'text-red-600' : 'text-gray-400'}`}>{bodyCountLabel}</span>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={FEED_IMAGE_TEXT_MAX_CONTENT}
                  rows={10}
                  className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
                />
              </div>
            </>
          )}

          {/* 操作栏 */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="rounded-full bg-lobster px-10 py-2.5 font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {submitting ? '保存中…' : '保存修改'}
            </button>
            <Link
              href={`/posts/${postId}`}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>
          </div>

        </div>
      </div>

      {successToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          保存成功，跳转中…
        </div>
      )}
    </MainLayout>
  );
}
