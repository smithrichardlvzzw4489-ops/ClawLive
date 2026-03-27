'use client';

import { useMemo, useRef, useState } from 'react';
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
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [editorKey] = useState(0);

  const editorRef = useRef<FeedPostBodyEditorHandle>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const titleLen = title.length;
  const bodyLen = content.length;
  const titleCountLabel = useMemo(() => `${titleLen}/${FEED_POST_MAX_TITLE}`, [titleLen]);
  const bodyCountLabel = useMemo(() => `${bodyLen}/${FEED_IMAGE_TEXT_MAX_CONTENT}`, [bodyLen]);

  /* ── 内联图片上传 ── */
  const handleInsertImage = () => {
    // 让用户先把光标定位到编辑器，再弹出文件选择
    inlineImageInputRef.current?.click();
  };

  const onInlineImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('单张图片不超过 5MB');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/posts/create-image-text');
      return;
    }

    setUploadStatus('uploading');
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : `上传失败 (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      const url = typeof data.url === 'string' ? data.url : '';
      if (!url) throw new Error('服务器未返回图片地址');

      // 插入到光标位置
      editorRef.current?.insertSnippet(`\n![图片](${url})\n`);
      setUploadStatus('done');
      setTimeout(() => setUploadStatus('idle'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片上传失败');
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 2000);
    }
  };

  /* ── 封面图 ── */
  const onCoverSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return; }
    if (file.size > MAX_BYTES) { setError('封面图片不超过 5MB'); return; }
    setError('');
    try {
      setCoverDataUrl(await readFileAsDataUrl(file));
    } catch {
      setError('读取图片失败');
    }
  };

  /* ── 发布 ── */
  const submit = async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login?redirect=/posts/create-image-text'); return; }
    if (!title.trim()) { setError('请填写标题'); return; }
    if (title.length > FEED_POST_MAX_TITLE) { setError('标题过长'); return; }
    if (!content.trim()) { setError('请填写正文'); return; }
    if (content.length > FEED_IMAGE_TEXT_MAX_CONTENT) { setError('正文超出字数限制'); return; }
    if (!coverDataUrl) { setError('请上传封面图片'); return; }

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
          images: [coverDataUrl],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : '发布失败'); return; }
      if (data.id) router.push(`/posts/${data.id}`);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const uploadButtonLabel =
    uploadStatus === 'uploading' ? '上传中…'
    : uploadStatus === 'done' ? '✓ 已插入'
    : uploadStatus === 'error' ? '上传失败'
    : '📷 插入图片到光标处';

  return (
    <MainLayout>
      <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-lobster">
          ← {t('back')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('feedImagePost.pageTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('feedImagePost.pageSubtitle')}</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-8 space-y-6">

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
              placeholder="输入标题"
            />
          </div>

          {/* 正文编辑区 + 插图工具栏 */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">正文</label>
              <span className={`text-xs tabular-nums ${bodyLen > FEED_IMAGE_TEXT_MAX_CONTENT ? 'text-red-600' : 'text-gray-400'}`}>
                {bodyCountLabel}
              </span>
            </div>

            {/* 操作说明 */}
            <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              💡 <strong>如何插入图片：</strong>先在下方编辑框中点击你想插入图片的位置（定位光标），再点击「插入图片到光标处」按钮选择图片。
            </div>

            {/* 插图按钮 */}
            <div className="mb-2">
              <input
                ref={inlineImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => void onInlineImageSelected(e)}
              />
              <button
                type="button"
                disabled={uploadStatus === 'uploading'}
                onClick={handleInsertImage}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition
                  ${uploadStatus === 'done'
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : uploadStatus === 'error'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-lobster/40 bg-rose-50 text-lobster hover:bg-rose-100'}
                  disabled:opacity-50`}
              >
                {uploadButtonLabel}
              </button>
            </div>

            <FeedPostBodyEditor
              key={editorKey}
              ref={editorRef}
              initialContent={content}
              onChange={(v) => setContent(v.slice(0, FEED_IMAGE_TEXT_MAX_CONTENT))}
              maxLength={FEED_IMAGE_TEXT_MAX_CONTENT}
              minRows={12}
              placeholder="在这里写正文，在想插入图片的位置点一下，再点上方「插入图片」按钮…"
            />
          </div>

          {/* 封面图 */}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">
                封面图片
                <span className="ml-1 text-red-500" aria-hidden>*</span>
              </label>
              <span className="text-xs text-gray-400">显示在列表缩略图，不影响正文排版</span>
            </div>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => void onCoverSelected(e)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                {coverDataUrl ? '更换封面' : '选择封面图'}
              </button>
              {coverDataUrl && (
                <button
                  type="button"
                  onClick={() => setCoverDataUrl(null)}
                  className="text-sm text-gray-400 underline hover:text-gray-600"
                >
                  移除
                </button>
              )}
            </div>
            {coverDataUrl && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                <img
                  src={coverDataUrl}
                  alt="封面预览"
                  className="mx-auto block max-h-64 w-full max-w-sm object-contain"
                />
              </div>
            )}
          </div>

          {/* 发布按钮 */}
          <button
            type="button"
            disabled={submitting || bodyLen > FEED_IMAGE_TEXT_MAX_CONTENT}
            onClick={() => void submit()}
            className="w-full rounded-full bg-lobster py-3 font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 sm:w-auto sm:px-10"
          >
            {submitting ? '发布中…' : '发布'}
          </button>

        </div>
      </div>
    </MainLayout>
  );
}
