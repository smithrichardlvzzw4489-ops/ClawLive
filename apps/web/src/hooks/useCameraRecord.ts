'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * 摄像头录制 Hook - 用于创作时录制视频并上传到作品
 */
export function useCameraRecord() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      setStream(mediaStream);
      return mediaStream;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取摄像头失败，请确保已授权相机权限';
      setError(msg);
      console.error('getUserMedia error:', err);
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [stream]);

  const startRecording = useCallback(() => {
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (chunksRef.current.length > 0) {
        setRecordedBlob(new Blob(chunksRef.current, { type: mimeType }));
      }
    };
    recorder.start();
    setIsRecording(true);
  }, [stream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const clearRecorded = useCallback(() => {
    setRecordedBlob(null);
  }, []);

  const stopAll = useCallback(() => {
    stopRecording();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setRecordedBlob(null);
  }, [stream, stopRecording]);

  return {
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
  };
}
