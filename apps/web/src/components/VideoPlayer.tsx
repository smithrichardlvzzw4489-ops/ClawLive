'use client';

import { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  stream: MediaStream;
  muted?: boolean;
  className?: string;
}

/** 在用户手势后恢复被挂起的 AudioContext（满足浏览器自动播放策略） */
function resumeAudioContextOnUserGesture() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') ctx.resume();
    }
  } catch {
    // ignore
  }
}

export function VideoPlayer({ stream, muted = true, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // 取消静音时：恢复 AudioContext 并显式 play（满足浏览器自动播放策略）
  useEffect(() => {
    if (!muted && videoRef.current) {
      resumeAudioContextOnUserGesture();
      videoRef.current.play().catch(() => {});
    }
  }, [muted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
