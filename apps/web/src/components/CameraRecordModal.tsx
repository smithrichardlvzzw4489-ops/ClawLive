'use client';

import { useEffect, useRef } from 'react';
import { useCameraRecord } from '@/hooks/useCameraRecord';

type VideoTarget = 'work' | 'message';

interface CameraRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoReady: (url: string, target: VideoTarget) => void;
  workId: string;
}

/**
 * 内联录制面板 - 不遮挡聊天，录制时可继续与 Agent 对话
 */
export function CameraRecordModal({ isOpen, onClose, onVideoReady, workId }: CameraRecordModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const {
    stream,
    error,
    isRecording,
    recordedBlob,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    clearRecorded,
    stopAll,
  } = useCameraRecord();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (playbackRef.current && recordedBlob) {
      playbackRef.current.src = URL.createObjectURL(recordedBlob);
      return () => {
        URL.revokeObjectURL(playbackRef.current?.src || '');
      };
    }
  }, [recordedBlob]);

  const handleOpenCamera = async () => {
    await startCamera();
  };

  const handleUseRecording = async (target: VideoTarget) => {
    if (!recordedBlob || !workId) return;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(recordedBlob);
      });

      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/works/${workId}/upload-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ video: base64 }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `上传失败 (${res.status})`);
      }
      const { url } = data;
      if (!url) throw new Error('服务器未返回视频地址');
      onVideoReady(url, target);
      stopAll();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '视频上传失败，请重试';
      console.error('Upload failed:', e);
      alert(msg);
    }
  };

  const handleClose = () => {
    stopAll();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="border-b bg-gray-50 p-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">🎬 录制视频（可同时与下方聊天）</h3>
        <button
          onClick={handleClose}
          className="px-2 py-1 text-sm text-gray-500 hover:bg-gray-200 rounded"
          aria-label="收起"
        >
          收起 ✕
        </button>
      </div>

      <div className="flex gap-4 items-start flex-wrap">
        {error && (
          <p className="text-red-600 text-sm w-full">{error}</p>
        )}

        {!stream && !recordedBlob && (
          <div className="flex items-center gap-3">
            <p className="text-gray-600 text-sm">
              打开摄像头录制，录制时可继续输入消息与 Agent 交流
            </p>
            <button
              onClick={handleOpenCamera}
              className="px-4 py-2 bg-lobster text-white rounded-lg text-sm font-medium hover:bg-lobster-dark shrink-0"
            >
              打开摄像头
            </button>
          </div>
        )}

        {stream && !recordedBlob && (
          <>
            <div className="w-48 aspect-video bg-gray-900 rounded-lg overflow-hidden shrink-0">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2 items-center">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="py-2 px-4 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
                >
                  ● 开始录制
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium animate-pulse"
                >
                  ■ 停止录制
                </button>
              )}
              <button
                onClick={stopCamera}
                className="py-2 px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
              >
                关闭摄像头
              </button>
            </div>
          </>
        )}

        {recordedBlob && (
          <>
            <div className="w-48 aspect-video bg-black rounded-lg overflow-hidden shrink-0">
              <video ref={playbackRef} controls playsInline className="w-full h-full" />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => handleUseRecording('work')}
                className="py-2 px-3 bg-lobster text-white rounded-lg text-sm font-medium hover:bg-lobster-dark"
              >
                设为作品主视频
              </button>
              <button
                onClick={() => handleUseRecording('message')}
                className="py-2 px-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
              >
                添加到消息
              </button>
              <button
                onClick={clearRecorded}
                className="py-2 px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
              >
                重新录制
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
