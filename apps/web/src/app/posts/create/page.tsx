'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { MarkdownBody } from '@/components/MarkdownBody';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL } from '@/lib/api';
import {
  FEED_POST_MAX_CONTENT,
  FEED_POST_MAX_TITLE,
  oneClickLayoutMarkdown,
} from '@/lib/feed-post-markdown';

const MAX_IMAGES = 9;
const MAX_BYTES = 5 * 1024 * 1024;
const DRAFT_KEY = 'clawlive:feed-post-draft-v1';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

type DraftPayload = { title: string; content: string; savedAt: string };

function loadDraftFromStorage(): DraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftPayload;
    if (typeof d.title !== 'string' || typeof d.content !== 'string') return null;
    return d;
  } catch {
    return null;
  }
}

function saveDraftToStorage(title: string, content: string) {
  const payload: DraftPayload = {
    title,
    content,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

function clearDraftStorage() {
  localStorage.removeItem(DRAFT_KEY);
}

export default function CreateFeedPostPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftBanner, setDraftBanner] = useState(false);
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const [layoutToast, setLayoutToast] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [splitPreview, setSplitPreview] = useState(false);

  useEffect(() => {
    const d = loadDraftFromStorage();
    if (d && (d.title.trim() || d.content.trim())) {
      setTitle(d.title);
      setContent(d.content);
      setDraftBanner(true);
    }
  }, []);

  useEffect(() => {
    const tid = window.setTimeout(() => {
      if (!title.trim() && !content.trim()) return;
      saveDraftToStorage(title, content);
    }, 1500);
    return () => window.clearTimeout(tid);
  }, [title, content]);

  const bodyChars = content.length;
  const titleLen = title.length;

  const handleSaveDraft = useCallback(() => {
    saveDraftToStorage(title, content);
    setDraftToast(t('feedPost.draftSaved'));
    window.setTimeout(() => setDraftToast(null), 2200);
  }, [title, content, t]);

  const handleDiscardDraft = useCallback(() => {
    clearDraftStorage();
    setDraftBanner(false);
    setDraftToast(null);
  }, []);

  const handleOneClickLayout = useCallback(() => {
    setContent((c) => oneClickLayoutMarkdown(c));
    setLayoutToast(t('feedPost.layoutApplied'));
    window.setTimeout(() => setLayoutToast(null), 2200);
  }, [t]);

  const onPickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + previews.length > MAX_IMAGES) {
      setError(`最多 ${MAX_IMAGES} 张图`);
      return;
    }
    const next: { file: File; url: string }[] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_BYTES) {
        setError('单张图片不超过 5MB');
        return;
      }
      const url = await readFileAsDataUrl(f);
      next.push({ file: f, url });
    }
    setPreviews((p) => [...p, ...next]);
    setError('');
    e.target.value = '';
  };

  const removePreview = (index: number) => {
    setPreviews((p) => p.filter((_, i) => i !== index));
  };

  const submit = async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/posts/create');
      return;
    }
    if (!title.trim() || !content.trim()) {
      setError('请填写标题和正文');
      return;
    }
    if (title.length > FEED_POST_MAX_TITLE || content.length > FEED_POST_MAX_CONTENT) {
      setError('标题或正文超出字数限制');
      return;
    }

    setSubmitting(true);
    try {
      const images = previews.map((p) => p.url);
      const res = await fetch(`${API_BASE_URL}/api/feed-posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          images,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '发布失败');
        return;
      }
      clearDraftStorage();
      if (data.id) router.push(`/posts/${data.id}`);
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const titleCountLabel = useMemo(() => t('feedPost.titleCount').replace('{n}', String(titleLen)), [t, titleLen]);
  const bodyCountLabel = useMemo(() => t('feedPost.bodyCharCount').replace('{n}', String(bodyChars)), [t, bodyChars]);

  return (
    <MainLayout>
      <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-lobster">
          ← {t('back')}
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('feedPost.createTitle')}</h1>

        {draftBanner && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{t('feedPost.draftBanner')}</span>
            <button type="button" onClick={handleDiscardDraft} className="font-medium text-amber-800 underline hover:text-amber-950">
              {t('feedPost.discardDraft')}
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">{t('feedPost.titleLabel')}</label>
              <span className="text-xs tabular-nums text-gray-400">{titleCountLabel}</span>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, FEED_POST_MAX_TITLE))}
              maxLength={FEED_POST_MAX_TITLE}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-lobster focus:ring-2 focus:ring-lobster/30"
              placeholder="标题"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">{t('feedPost.markdownHint')}</span>
            <button
              type="button"
              onClick={() => setSplitPreview((s) => !s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                splitPreview ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {splitPreview ? t('feedPost.editTab') : t('feedPost.previewTab')}
            </button>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">{t('feedPost.contentLabel')}</label>
              <span
                className={`text-xs tabular-nums ${bodyChars > FEED_POST_MAX_CONTENT ? 'text-red-600' : 'text-gray-400'}`}
              >
                {bodyCountLabel}
              </span>
            </div>
            <div className={splitPreview ? 'grid gap-4 md:grid-cols-2' : ''}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, FEED_POST_MAX_CONTENT))}
                rows={splitPreview ? 18 : 14}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm leading-relaxed focus:border-lobster focus:ring-2 focus:ring-lobster/30"
                placeholder="支持 Markdown（# 标题、列表、**粗体**、链接等）…"
              />
              {splitPreview && (
                <div className="max-h-[min(32rem,70vh)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-inner">
                  <MarkdownBody content={content} />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('feedPost.imagesLabel')}</label>
            <p className="mb-2 text-xs text-gray-500">{t('feedPost.imagesHint')}</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={onPickImages}
              className="block w-full text-sm text-gray-600"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg border">
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePreview(i)}
                    className="absolute right-1 top-1 h-6 w-6 rounded bg-black/60 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              {t('feedPost.saveDraft')}
            </button>
            <button
              type="button"
              onClick={handleOneClickLayout}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              {t('feedPost.oneClickLayout')}
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              {t('feedPost.preview')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || bodyChars > FEED_POST_MAX_CONTENT}
              className="ml-auto w-full min-w-[8rem] rounded-xl bg-lobster px-6 py-2.5 font-semibold text-white hover:bg-lobster-dark disabled:opacity-50 sm:w-auto"
            >
              {submitting ? t('feedPost.submitting') : t('feedPost.submit')}
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl sm:max-w-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">{t('feedPost.previewModalTitle')}</h2>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                {t('feedPost.closePreview')}
              </button>
            </div>
            <div className="max-h-[calc(90vh-3.5rem)] overflow-y-auto px-4 py-4">
              <h3 className="text-xl font-bold text-gray-900">{title || '（无标题）'}</h3>
              {previews.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {previews.map((p, i) => (
                    <img key={i} src={p.url} alt="" className="w-full rounded-lg object-cover" />
                  ))}
                </div>
              )}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <MarkdownBody content={content} />
              </div>
            </div>
          </div>
        </div>
      )}

      {draftToast && (
        <div className="fixed bottom-6 left-1/2 z-40 max-w-sm -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm text-white shadow-lg">
          {draftToast}
        </div>
      )}
      {layoutToast && (
        <div className="fixed bottom-6 left-1/2 z-40 max-w-sm -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm text-white shadow-lg">
          {layoutToast}
        </div>
      )}
    </MainLayout>
  );
}
