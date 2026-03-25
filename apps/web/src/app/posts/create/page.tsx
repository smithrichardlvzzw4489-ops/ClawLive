'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { MarkdownBody } from '@/components/MarkdownBody';
import { FeedPostBodyEditor, type FeedPostBodyEditorHandle } from '@/components/FeedPostBodyEditor';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL } from '@/lib/api';
import {
  FEED_POST_MAX_CONTENT,
  FEED_POST_MAX_TITLE,
  oneClickLayoutMarkdown,
} from '@/lib/feed-post-markdown';

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
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftBanner, setDraftBanner] = useState(false);
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const [layoutToast, setLayoutToast] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [inlineImageBusy, setInlineImageBusy] = useState(false);
  const [bodyEditorKey, setBodyEditorKey] = useState(0);
  const bodyEditorRef = useRef<FeedPostBodyEditorHandle>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = loadDraftFromStorage();
    if (d && (d.title.trim() || d.content.trim())) {
      setTitle(d.title);
      setContent(d.content);
      setDraftBanner(true);
      setBodyEditorKey((k) => k + 1);
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
    setTitle('');
    setContent('');
    setBodyEditorKey((k) => k + 1);
  }, []);

  const handleOneClickLayout = useCallback(() => {
    setContent((c) => oneClickLayoutMarkdown(c));
    setBodyEditorKey((k) => k + 1);
    setLayoutToast(t('feedPost.layoutApplied'));
    window.setTimeout(() => setLayoutToast(null), 2200);
  }, [t]);

  const insertMarkdownAtCursor = useCallback((snippet: string) => {
    bodyEditorRef.current?.insertSnippet(snippet);
  }, []);

  const onPickInlineImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_BYTES) {
      setError('单张图片不超过 5MB');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/posts/create');
      return;
    }
    setInlineImageBusy(true);
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch(`${API_BASE_URL}/api/feed-posts/inline-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '图片上传失败');
        return;
      }
      const url = typeof data.url === 'string' ? data.url : '';
      if (!url) {
        setError('上传失败');
        return;
      }
      insertMarkdownAtCursor(`\n\n![图片](${url})\n\n`);
    } catch {
      setError('网络错误');
    } finally {
      setInlineImageBusy(false);
    }
  };

  const onPickCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_BYTES) {
      setError('单张图片不超过 5MB');
      return;
    }
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCoverDataUrl(dataUrl);
    } catch {
      setError('读取图片失败');
    }
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
    if (!coverDataUrl) {
      setError(t('feedPost.coverRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const images = [coverDataUrl];
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
            <input
              ref={inlineImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={onPickInlineImage}
            />
            <button
              type="button"
              disabled={inlineImageBusy}
              onClick={() => inlineImageInputRef.current?.click()}
              className="rounded-full border border-lobster/40 bg-rose-50 px-3 py-1 text-xs font-medium text-lobster transition hover:bg-rose-100 disabled:opacity-50"
              title={t('feedPost.insertBodyImageHint')}
            >
              {inlineImageBusy ? t('feedPost.insertBodyImageUploading') : t('feedPost.insertBodyImage')}
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
            <FeedPostBodyEditor
              key={bodyEditorKey}
              ref={bodyEditorRef}
              initialContent={content}
              onChange={(v) => setContent(v.slice(0, FEED_POST_MAX_CONTENT))}
              maxLength={FEED_POST_MAX_CONTENT}
              minRows={18}
              placeholder="支持 Markdown（# 标题、列表、**粗体**、链接、插入正文图片等）…"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('feedPost.coverImageLabel')}
              <span className="ml-1 text-red-500" aria-hidden>
                *
              </span>
              <span className="ml-1 text-xs font-normal text-gray-400">{t('feedPost.coverImageRequiredBadge')}</span>
            </label>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={onPickCoverFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                {coverDataUrl ? t('feedPost.coverImageReplace') : t('feedPost.coverImageChoose')}
              </button>
              {coverDataUrl && (
                <button
                  type="button"
                  onClick={() => setCoverDataUrl(null)}
                  className="text-sm text-gray-500 underline hover:text-gray-800"
                >
                  {t('feedPost.coverImageRemove')}
                </button>
              )}
            </div>
            {coverDataUrl && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                <img
                  src={coverDataUrl}
                  alt=""
                  className="mx-auto block max-h-[min(70vh,520px)] w-full max-w-md object-contain"
                />
              </div>
            )}
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
              {coverDataUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100">
                  <img
                    src={coverDataUrl}
                    alt=""
                    className="mx-auto block max-h-[min(70vh,560px)] w-full object-contain"
                  />
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
