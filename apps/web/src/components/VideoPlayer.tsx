'use client';

import { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  stream: MediaStream;
  muted?: boolean;
  className?: string;
}

export function VideoPlayer({ stream, muted = true, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

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
