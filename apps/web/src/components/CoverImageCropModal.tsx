'use client';

import { useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { FEED_POST_COVER_ASPECT, getCroppedImageDataUrl } from '@/lib/crop-image';

export function CoverImageCropModal({
  imageSrc,
  onCancel,
  onDone,
}: {
  imageSrc: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const { t } = useLocale();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      const dataUrl = await getCroppedImageDataUrl(imageSrc, croppedAreaPixels);
      onDone(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-900">{t('feedPost.cropCoverTitle')}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{t('feedPost.cropCoverDesc')}</p>
        </div>
        <div className="relative h-[min(55vh,22rem)] w-full bg-gray-900 sm:h-[26rem]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={FEED_POST_COVER_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
          />
        </div>
        <div className="border-b border-gray-100 px-4 py-3">
          <label className="mb-1 block text-xs text-gray-500">{t('feedPost.cropZoom')}</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-lobster"
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('feedPost.cropCancel')}
          </button>
          <button
            type="button"
            disabled={busy || !croppedAreaPixels}
            onClick={() => void handleConfirm()}
            className="rounded-xl bg-lobster px-4 py-2 text-sm font-semibold text-white hover:bg-lobster-dark disabled:opacity-50"
          >
            {busy ? t('feedPost.cropConfirming') : t('feedPost.cropConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
