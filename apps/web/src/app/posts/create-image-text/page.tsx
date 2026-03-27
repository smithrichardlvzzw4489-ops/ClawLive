'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL } from '@/lib/api';
import { compressImage } from '@/lib/image-compress';
import { FEED_IMAGE_TEXT_MAX_CONTENT, FEED_IMAGE_TEXT_MAX_TITLE } from '@/lib/feed-post-markdown';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 9;
const DRAFT_KEY = 'clawlive:feed-image-text-draft-v1';

type DraftPayload = { title: string; content: string; savedAt: string };

function loadDraft(): DraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftPayload;
    if (typeof d.title !== 'string' || typeof d.content !== 'string') return null;
    return d;
  } catch { return null; }
}
function saveDraft(title: string, content: string) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, savedAt: new Date().toISOString() }));
  } catch { /* storage full */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}


export default function CreateFeedImageTextPage() {
  const { t } = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  // coverIdx: 用户手动选定的封面下标，null = 尚未选择
  const [coverIdx, setCoverIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftBanner, setDraftBanner] = useState(false);
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 挂载时恢复草稿
  useEffect(() => {
    const d = loadDraft();
    if (d && (d.title.trim() || d.content.trim())) {
      setTitle(d.title);
      setContent(d.content);
      setDraftBanner(true);
    }
  }, []);

  // 防抖自动存草稿（仅存文字，图片不存）
  useEffect(() => {
    const tid = window.setTimeout(() => {
      if (!title.trim() && !content.trim()) return;
      saveDraft(title, content);
    }, 1500);
    return () => window.clearTimeout(tid);
  }, [title, content]);

  const titleLen = title.length;
  const bodyLen = content.length;
  const titleCountLabel = useMemo(() => `${titleLen}/${FEED_IMAGE_TEXT_MAX_TITLE}`, [titleLen]);
  const bodyCountLabel = useMemo(() => `${bodyLen}/${FEED_IMAGE_TEXT_MAX_CONTENT}`, [bodyLen]);

  /* ── 选图 ── */
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    // Array.from 先把 FileList 固定下来，再重置 input，避免部分浏览器清空 FileList
    const fileArray = Array.from(input.files ?? []);
    input.value = '';
    if (!fileArray.length) return;
    setError('');

    const toAdd: string[] = [];
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_BYTES) {
        setError('单张图片不超过 5MB');
        return;
      }
      try {
        toAdd.push(await compressImage(file, { maxWidth: 1920, maxHeight: 1920, quality: 0.85 }));
      } catch {
        setError('读取图片失败');
        return;
      }
    }
    if (toAdd.length === 0) return;
    setImages((prev) => {
      const next = [...prev];
      for (const d of toAdd) {
        if (next.length >= MAX_IMAGES) break;
        next.push(d);
      }
      return next;
    });
  };

  /* ── 删除 ── */
  const removeAt = (i: number) => {
    setImages((prev) => prev.filter((_, j) => j !== i));
    setCoverIdx((prev) => {
      if (prev === null) return null;
      if (prev === i) return null;          // 删的就是封面，取消封面
      if (prev > i) return prev - 1;        // 封面下标需要前移
      return prev;
    });
  };

  /* ── 上移/下移 ── */
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    setImages((prev) => {
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    // 跟随交换更新 coverIdx
    setCoverIdx((prev) => {
      if (prev === i) return j;
      if (prev === j) return i;
      return prev;
    });
  };

  /* ── 发布 ── */
  const submit = async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login?redirect=/posts/create-image-text'); return; }
    if (!title.trim()) { setError('请填写标题'); return; }
    if (title.length > FEED_IMAGE_TEXT_MAX_TITLE) { setError(`标题不超过 ${FEED_IMAGE_TEXT_MAX_TITLE} 字`); return; }
    if (images.length < 1) { setError('请至少上传一张图片'); return; }
    if (coverIdx === null) { setError('请选择一张图片作为封面'); return; }
    if (!content.trim()) { setError('请填写正文'); return; }
    if (content.length > FEED_IMAGE_TEXT_MAX_CONTENT) { setError(`正文不超过 ${FEED_IMAGE_TEXT_MAX_CONTENT} 字`); return; }

    // 封面排到第一位，其余保持顺序
    const orderedImages = [
      images[coverIdx],
      ...images.filter((_, i) => i !== coverIdx),
    ];

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feed-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'imageText',
          title: title.trim(),
          content: content.trim(),
          images: orderedImages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('token');
        router.push('/login?redirect=/posts/create-image-text');
        return;
      }
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : '发布失败'); return; }
      if (data.id) {
        clearDraft();
        router.push(`/posts/${data.id}`);
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    saveDraft(title, content);
    setDraftToast('草稿已保存（仅文字）');
    window.setTimeout(() => setDraftToast(null), 2200);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftBanner(false);
    setTitle('');
    setContent('');
  };

  return (
    <MainLayout>
      <div className="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-lobster">
          ← {t('back')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('feedImagePost.pageTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('feedImagePost.pageSubtitle')}</p>

        {draftBanner && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>已恢复上次草稿（图片不在草稿中）</span>
            <button type="button" onClick={handleDiscardDraft} className="font-medium text-amber-800 underline hover:text-amber-950">
              丢弃草稿
            </button>
          </div>
        )}

        {error && (
          /登录/.test(error) ? (
            <Link href="/login?redirect=/posts/create-image-text" className="mt-4 block rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 underline hover:bg-red-100">
              {error} →
            </Link>
          ) : (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )
        )}

        <div className="mt-8 space-y-8">

          {/* 标题 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">标题</label>
              <span className={`text-xs tabular-nums ${titleLen >= FEED_IMAGE_TEXT_MAX_TITLE ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {titleCountLabel}
              </span>
            </div>
            <input
              type="text"
              value={title}
              maxLength={FEED_IMAGE_TEXT_MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 text-gray-900 shadow-sm focus:outline-none focus:ring-2 ${
                titleLen >= FEED_IMAGE_TEXT_MAX_TITLE
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                  : 'border-gray-200 focus:border-lobster/40 focus:ring-lobster/20'
              }`}
              placeholder="输入标题（最多20字）"
            />
            {titleLen >= FEED_IMAGE_TEXT_MAX_TITLE && (
              <p className="mt-1 text-xs text-red-600">已达到标题字数上限（{FEED_IMAGE_TEXT_MAX_TITLE} 字），无法继续输入</p>
            )}
          </div>

          {/* 图片区 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">图片</label>
              <span className="text-xs text-gray-400">
                {images.length}/{MAX_IMAGES} 张
                {coverIdx !== null
                  ? <span className="ml-2 text-lobster font-medium">· 已选第 {coverIdx + 1} 张为封面</span>
                  : <span className="ml-2 text-amber-500">· 请点击「设为封面」</span>
                }
              </span>
            </div>

            {/* 隐藏的 file input，由按钮触发 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void onPickFiles(e)}
            />
            {/* 上传按钮 */}
            <button
              type="button"
              disabled={images.length >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] min-w-[9rem] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ＋ 添加图片
            </button>

            {/* 图片列表 */}
            {images.length > 0 && (
              <ul className="mt-4 space-y-3">
                {images.map((src, i) => {
                  const isCover = coverIdx === i;
                  return (
                    <li
                      key={`${i}-${src.slice(0, 20)}`}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition
                        ${isCover ? 'border-lobster/40 ring-1 ring-lobster/20' : 'border-gray-100'}`}
                    >
                      {/* 预览 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />

                      {/* 封面标记 */}
                      <div className="min-w-0 flex-1">
                        {isCover ? (
                          <span className="inline-block rounded-full bg-lobster px-2 py-0.5 text-xs font-semibold text-white">封面</span>
                        ) : (
                          <span className="text-xs text-gray-400">第 {i + 1} 张</span>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex flex-wrap gap-2">
                        {!isCover && (
                          <button
                            type="button"
                            onClick={() => setCoverIdx(i)}
                            className="rounded-lg border border-lobster/40 px-2 py-1 text-xs text-lobster hover:bg-lobster/5"
                          >
                            设为封面
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          disabled={i === images.length - 1}
                          onClick={() => move(i, 1)}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                        >
                          下移
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAt(i)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 正文 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">正文</label>
              <span className={`text-xs tabular-nums ${bodyLen >= FEED_IMAGE_TEXT_MAX_CONTENT ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {bodyCountLabel}
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={FEED_IMAGE_TEXT_MAX_CONTENT}
              rows={10}
              className={`w-full resize-y rounded-xl border px-4 py-3 text-gray-900 shadow-sm focus:outline-none focus:ring-2 ${
                bodyLen >= FEED_IMAGE_TEXT_MAX_CONTENT
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-200'
                  : 'border-gray-200 focus:border-lobster/40 focus:ring-lobster/20'
              }`}
              placeholder="写下你的图文正文…"
            />
            {bodyLen >= FEED_IMAGE_TEXT_MAX_CONTENT && (
              <p className="mt-1 text-xs text-red-600">已达到正文字数上限（{FEED_IMAGE_TEXT_MAX_CONTENT} 字），无法继续输入</p>
            )}
          </div>

          {/* 操作栏 */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              保存草稿
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="rounded-full bg-lobster px-10 py-2.5 font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {submitting ? '发布中…' : '发布'}
            </button>
          </div>

        </div>
      </div>

      {draftToast && (
        <div className="fixed bottom-6 left-1/2 z-40 max-w-sm -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm text-white shadow-lg">
          {draftToast}
        </div>
      )}
    </MainLayout>
  );
}
