'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL } from '@/lib/api';
import { FEED_IMAGE_TEXT_MAX_CONTENT, FEED_POST_MAX_TITLE } from '@/lib/feed-post-markdown';

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

export default function CreateFeedImageTextPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files?.length) return;
    setError('');
    const next = [...images];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_IMAGES) break;
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_BYTES) {
        setError('单张图片不超过 5MB');
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        next.push(dataUrl);
      } catch {
        setError('读取图片失败');
        return;
      }
    }
    setImages(next);
  };

  const removeAt = (i: number) => {
    setImages((prev) => prev.filter((_, j) => j !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    setImages((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const t = copy[i];
      copy[i] = copy[j];
      copy[j] = t;
      return copy;
    });
  };

  const submit = async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/posts/create-image-text');
      return;
    }
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    if (title.length > FEED_POST_MAX_TITLE) {
      setError('标题过长');
      return;
    }
    if (images.length < 1) {
      setError(t('feedImagePost.noImages'));
      return;
    }
    if (!content.trim()) {
      setError(t('feedImagePost.noBody'));
      return;
    }
    if (content.length > FEED_IMAGE_TEXT_MAX_CONTENT) {
      setError('正文超出字数');
      return;
    }
    if (/\!\[/.test(content)) {
      setError(t('feedImagePost.invalidBody'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feed-posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind: 'imageText',
          title: title.trim(),
          content: content.trim(),
          images,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '发布失败');
        return;
      }
      if (data.id) router.push(`/posts/${data.id}`);
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

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

          <div>
            <label className="text-sm font-medium text-gray-700">{t('feedImagePost.titleLabel')}</label>
            <input
              type="text"
              value={title}
              maxLength={FEED_POST_MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
              placeholder={t('feedImagePost.titleLabel')}
            />
            <p className="mt-1 text-xs text-gray-500">{titleCountLabel}</p>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">{t('feedImagePost.imagesLabel')}</label>
              <span className="text-xs text-gray-500">{t('feedImagePost.imagesHint')}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void onPickFiles(e)}
            />
            <button
              type="button"
              disabled={images.length >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('feedImagePost.addImage')} ({images.length}/{MAX_IMAGES})
            </button>

            {images.length > 0 && (
              <ul className="mt-4 space-y-3">
                {images.map((src, i) => (
                  <li
                    key={`${i}-${src.slice(0, 24)}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-lobster">
                        {i === 0 ? t('feedImagePost.coverBadge') : `· ${i + 1}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {t('feedImagePost.moveUp')}
                      </button>
                      <button
                        type="button"
                        disabled={i === images.length - 1}
                        onClick={() => move(i, 1)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {t('feedImagePost.moveDown')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {t('feedImagePost.remove')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">{t('feedImagePost.contentLabel')}</label>
              <span className="text-xs text-gray-500">{t('feedImagePost.contentHint')}</span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={FEED_IMAGE_TEXT_MAX_CONTENT}
              rows={10}
              className="mt-2 w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-gray-900 shadow-sm focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/20"
              placeholder={t('feedImagePost.contentLabel')}
            />
            <p className="mt-1 text-xs text-gray-500">{bodyCountLabel}</p>
          </div>

          <button
            type="button"
            disabled={submitting}
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
