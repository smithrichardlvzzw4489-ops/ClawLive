'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { translations } from '@/lib/i18n/translations';
import { API_BASE_URL } from '@/lib/api';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function CreateVideoWorkPage() {
  const router = useRouter();
  const { t } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  const [workId, setWorkId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lobsterName, setLobsterName] = useState('小龙');
  const [videoFileName, setVideoFileName] = useState('');
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoUploadedUrl, setVideoUploadedUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverServerUrl, setCoverServerUrl] = useState<string | null>(null);
  const [initError, setInitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seekHint, setSeekHint] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [seekPos, setSeekPos] = useState(0);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      router.replace('/login?redirect=/works/create-video');
      return;
    }
    const sessionKey = 'clawlive-create-video-draft-id';
    let cancelled = false;
    (async () => {
      try {
        const existing = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(sessionKey) : null;
        if (existing) {
          setWorkId(existing);
          setTitle(translations.zh.createVideo.draftTitle);
          return;
        }
        const res = await fetch(`${API_BASE_URL}/api/works`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: translations.zh.createVideo.draftTitle,
            lobsterName: '小龙',
            contentKind: 'video',
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(typeof d.error === 'string' ? d.error : 'create failed');
        }
        const w = await res.json();
        if (!cancelled && w.id) {
          sessionStorage.setItem(sessionKey, w.id);
          setWorkId(w.id);
          setTitle(w.title || '');
        }
      } catch (e) {
        if (!cancelled) setInitError(e instanceof Error ? e.message : 'init failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  useEffect(() => {
    if (!error) return;
    errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    return () => {
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    };
  }, [videoObjectUrl]);

  const uploadVideoFile = useCallback(
    async (file: File) => {
      if (!workId || !token) return;
      setBusy(true);
      setError('');
      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch(`${API_BASE_URL}/api/works/${workId}/upload-video`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ video: dataUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'upload failed');
        }
        const url = data.url as string;
        setVideoUploadedUrl(url);
        setVideoFileName(file.name);
        const obj = URL.createObjectURL(file);
        setVideoObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return obj;
        });
        setCoverPreview(null);
        setCoverServerUrl(null);
        setSeekHint(t('createVideo.seekHint'));
        setVideoDuration(0);
        setSeekPos(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'upload failed');
      } finally {
        setBusy(false);
      }
    },
    [workId, token, t]
  );

  const uploadCoverDataUrl = useCallback(
    async (dataUrl: string) => {
      if (!workId || !token) return;
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/works/${workId}/upload-cover`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ image: dataUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'cover failed');
        }
        const savedUrl = typeof data.url === 'string' ? data.url : '';
        if (!savedUrl) {
          throw new Error(t('createVideo.coverUploadInvalid'));
        }
        setCoverServerUrl(savedUrl);
        setCoverPreview(dataUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'cover failed');
      } finally {
        setBusy(false);
      }
    },
    [workId, token, t]
  );

  const captureFrameFromVideo = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoObjectUrl) {
      setError(t('createVideo.needVideoFirst'));
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError(t('createVideo.videoNotReady'));
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paintAndUpload = () => {
      try {
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        void uploadCoverDataUrl(dataUrl);
      } catch {
        setError(t('createVideo.coverCaptureFailed'));
      }
    };

    if (video.seeking) {
      video.addEventListener('seeked', paintAndUpload, { once: true });
    } else {
      paintAndUpload();
    }
  }, [videoObjectUrl, uploadCoverDataUrl, t]);

  const onVideoSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !videoObjectUrl) return;
    const next = Number(e.target.value);
    const t = Number.isFinite(next) ? next : 0;
    setSeekPos(t);
    v.currentTime = t;
  };

  const onPickCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(f);
    void uploadCoverDataUrl(dataUrl);
  };

  const handlePublish = async () => {
    if (!workId || !token) {
      setError(t('createVideo.needLoginPublish'));
      return;
    }
    if (!title.trim()) {
      setError(t('createVideo.titleRequired'));
      return;
    }
    if (!videoUploadedUrl) {
      setError(t('createVideo.videoRequired'));
      return;
    }
    if (!coverServerUrl) {
      setError(t('createVideo.coverRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const putRes = await fetch(`${API_BASE_URL}/api/works/${workId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          lobsterName: lobsterName.trim() || '小龙',
          description: description.trim() || undefined,
          resultSummary: description.trim() || undefined,
          videoUrl: videoUploadedUrl,
          coverImage: coverServerUrl,
        }),
      });
      const putData = await putRes.json().catch(() => ({}));
      if (!putRes.ok) {
        throw new Error(typeof putData.error === 'string' ? putData.error : 'save failed');
      }
      const pub = await fetch(`${API_BASE_URL}/api/works/${workId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoUrl: videoUploadedUrl,
          resultSummary: description.trim() || undefined,
        }),
      });
      const pdata = await pub.json().catch(() => ({}));
      if (!pub.ok) {
        throw new Error(typeof pdata.error === 'string' ? pdata.error : 'publish failed');
      }
      try {
        sessionStorage.removeItem('clawlive-create-video-draft-id');
      } catch {
        // ignore
      }
      router.push(`/works/${workId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'publish failed');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return null;
  }

  if (initError) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-red-600">{initError}</p>
          <Link href="/" className="mt-4 inline-block text-lobster">
            {t('back')}
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (!workId) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-lobster" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-lobster">
          ← {t('back')}
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('createVideo.pageTitle')}</h1>
        <p className="mt-2 text-sm text-gray-600">{t('createVideo.pageSubtitle')}</p>

        <div className="mt-8 space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div
              ref={errorBannerRef}
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('createVideo.titleLabel')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-lobster focus:outline-none focus:ring-2 focus:ring-lobster/25"
              placeholder={t('createVideo.titlePlaceholder')}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('createVideo.descLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-lobster focus:outline-none focus:ring-2 focus:ring-lobster/25"
              placeholder={t('createVideo.descPlaceholder')}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('createVideo.lobsterLabel')}</label>
            <input
              type="text"
              value={lobsterName}
              onChange={(e) => setLobsterName(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-gray-300 px-4 py-2.5 focus:border-lobster focus:outline-none focus:ring-2 focus:ring-lobster/25"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('createVideo.videoLabel')}</label>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadVideoFile(f);
              }}
              className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-lobster file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            {videoFileName && (
              <p className="mt-2 text-xs text-gray-500">
                {t('createVideo.videoSelected')}: {videoFileName}
              </p>
            )}
          </div>

          {videoObjectUrl && (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-800">{t('createVideo.coverSection')}</p>
              <video
                ref={videoRef}
                src={videoObjectUrl}
                className="max-h-64 w-full rounded-lg bg-black object-contain"
                controls
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) {
                    setVideoDuration(d);
                    const t0 = Math.min(1, d / 3);
                    setSeekPos(t0);
                    e.currentTarget.currentTime = t0;
                  }
                }}
                onTimeUpdate={(e) => setSeekPos(e.currentTarget.currentTime)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-gray-600">{seekHint || t('createVideo.scrubLabel')}</label>
                <input
                  type="range"
                  min={0}
                  max={videoDuration > 0 ? videoDuration : 1}
                  step={0.05}
                  value={seekPos}
                  onChange={onVideoSeekInput}
                  className="min-w-[12rem] flex-1"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={captureFrameFromVideo}
                  className="rounded-lg border border-lobster bg-white px-3 py-1.5 text-sm font-medium text-lobster hover:bg-lobster/5"
                >
                  {t('createVideo.useFrame')}
                </button>
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onPickCoverFile} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => coverInputRef.current?.click()}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  {t('createVideo.uploadCover')}
                </button>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              {coverPreview && (
                <div className="mt-2">
                  <p className="mb-1 text-xs text-gray-500">{t('createVideo.coverPreview')}</p>
                  <img
                    src={coverPreview}
                    alt=""
                    className="max-h-40 rounded-lg border border-gray-200 object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {videoUploadedUrl && !coverServerUrl && (
            <p className="text-sm text-amber-800">{t('createVideo.coverHintBeforePublish')}</p>
          )}
          {coverServerUrl && (
            <p className="text-sm text-emerald-700">{t('createVideo.coverReady')}</p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePublish()}
              className="rounded-xl bg-lobster px-8 py-3 font-semibold text-white hover:bg-lobster-dark disabled:opacity-50"
            >
              {busy ? t('createVideo.publishing') : t('createVideo.publish')}
            </button>
            <Link
              href="/my-profile"
              className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('createVideo.cancel')}
            </Link>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
