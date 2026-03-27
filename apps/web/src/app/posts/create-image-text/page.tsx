'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { FeedPostBodyEditor, type FeedPostBodyEditorHandle } from '@/components/FeedPostBodyEditor';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL } from '@/lib/api';
import { FEED_IMAGE_TEXT_MAX_CONTENT, FEED_POST_MAX_TITLE } from '@/lib/feed-post-markdown';

const MAX_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function CreateFeedImageTextPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inlineImageBusy, setInlineImageBusy] = useState(false);
  const [bodyEditorKey] = useState(0);

  const bodyEditorRef = useRef<FeedPostBodyEditorHandle>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const titleLen = title.length;
  const bodyLen = content.length;

  const titleCountLabel = useMemo(
    () => t('feedImagePost.titleCount').replace('{n}', String(titleLen)),
    [t, titleLen]
  );
  const bodyCountLabel = useMemo(
    () => t('feedImagePost.contentCount').replace('{n}', String(bodyLen)),
    [t, bodyLen]
  );

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
      router.push('/login?redirect=/posts/create-image-text');
      return;
    }
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
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '图片上传失败');
        return;
      }
      const url = typeof data.url === 'string' ? data.url : '';
      if (!url) { setError('上传失败'); return; }
      bodyEditorRef.current?.insertSnippet(`\n![图片](${url})\n`);
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
    if (file.size > MAX_BYTES) { setError('单张图片不超过 5MB'); return; }
    setError('');
    try {
      setCoverDataUrl(await readFileAsDataUrl(file));
    } catch {
      setError('读取图片失败');
    }
  };

  const submit = useCallback(async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login?redirect=/posts/create-image-text'); return; }
    if (!title.trim()) { setError('请填写标题'); return; }
    if (title.length > FEED_POST_MAX_TITLE) { setError('标题过长'); return; }
    if (!content.trim()) { setError(t('feedImagePost.noBody')); return; }
    if (content.length > FEED_IMAGE_TEXT_MAX_CONTENT) { setError('正文超出字数'); return; }
    if (!coverDataUrl) { setError('请上传封面图片'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feed-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'imageText',
          title: title.trim(),
          content: content.trim(),
          images: [coverDataUrl],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : '发布失败'); return; }
      if (data.id) router.push(`/posts/${data.id}`);
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  }, [title, content, coverDataUrl, router, t]);

  return (
    <MainLayout>
      <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-lobster">
          ← {t('back')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('feedImagePost.pageTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('feedImagePost.pageSubtitle')}</p>

        <div className="mt-8 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {/* 标题 */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">{t('feedImagePost.titleLabel')}</label>
              <span className="text-xs tabular-nums text-gray-400">{titleCountLabel}</span>
            </div>
            <input
              type="text"
              value={title}
              maxLength={FEED_POST_MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
              placeholder={t('feedImagePost.titleLabel')}
            />
            <p className="mt-1 text-xs text-gray-500">{titleCountLabel}</p>
          </div>

          {/* 插入图片按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inlineImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => void onPickInlineImage(e)}
            />
            <button
              type="button"
              disabled={inlineImageBusy}
              onClick={() => inlineImageInputRef.current?.click()}
              className="rounded-full border border-lobster/40 bg-rose-50 px-3 py-1 text-xs font-medium text-lobster transition hover:bg-rose-100 disabled:opacity-50"
            >
              {inlineImageBusy ? '上传中…' : '📷 在光标处插入图片'}
            </button>
            <span className="text-xs text-gray-400">图片将插入到光标所在位置</span>
          </div>

          {/* 正文编辑器 */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">{t('feedImagePost.contentLabel')}</label>
              <span className={`text-xs tabular-nums ${bodyLen > FEED_IMAGE_TEXT_MAX_CONTENT ? 'text-red-600' : 'text-gray-400'}`}>
                {bodyCountLabel}
              </span>
            </div>
            <FeedPostBodyEditor
              key={bodyEditorKey}
              ref={bodyEditorRef}
              initialContent={content}
              onChange={(v) => setContent(v.slice(0, FEED_IMAGE_TEXT_MAX_CONTENT))}
              maxLength={FEED_IMAGE_TEXT_MAX_CONTENT}
              minRows={10}
              placeholder={t('feedImagePost.contentLabel')}
            />
          </div>

          {/* 封面图 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              封面图片
              <span className="ml-1 text-red-500" aria-hidden>*</span>
              <span className="ml-1 text-xs font-normal text-gray-400">（用于列表缩略图）</span>
            </label>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => void onPickCoverFile(e)}
            />
            <button
              type="button"
              onClick={() => coverFileInputRef.current?.click()}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              {coverDataUrl ? '更换封面' : '选择封面图'}
            </button>
            {coverDataUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setCoverDataUrl(null)}
                  className="ml-3 text-sm text-gray-500 underline hover:text-gray-800"
                >
                  移除
                </button>
                <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                  <img
                    src={coverDataUrl}
                    alt=""
                    className="mx-auto block max-h-[min(70vh,400px)] w-full max-w-md object-contain"
                  />
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={submitting || bodyLen > FEED_IMAGE_TEXT_MAX_CONTENT}
            onClick={() => void submit()}
            className="rounded-full bg-lobster px-8 py-3 font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {submitting ? t('feedImagePost.submitting') : t('feedImagePost.submit')}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
