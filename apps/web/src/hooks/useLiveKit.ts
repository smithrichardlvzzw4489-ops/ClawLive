'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

export function useLiveKit({
  roomId,
  isHost,
  isLive,
  participantName,
}: {
  roomId: string;
  isHost: boolean;
  isLive: boolean;
  participantName: string;
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const roomRef = useRef<Room | null>(null);

  const fetchToken = useCallback(
    async (asHost: boolean) => {
      const authToken = localStorage.getItem('token');
      const endpoint = asHost ? '/api/livekit/token' : '/api/livekit/token-viewer';
      const body = asHost
        ? { roomId, participantName: participantName || `host-${Date.now()}`, isHost: true }
        : { roomId };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      if (!apiUrl) throw new Error('未配置 API 地址，请设置 NEXT_PUBLIC_API_URL');

      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && asHost ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
      });

      let data: { token?: string; url?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(res.status === 503 ? 'LiveKit 未配置，请联系管理员' : `请求失败 (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
      if (!data.token || !data.url) throw new Error(data.error || '获取令牌失败');
      return { token: data.token, url: data.url };
    },
    [roomId, participantName]
  );

  const startCameraStream = useCallback(async () => {
    if (!LIVEKIT_URL || !isHost) return;
    setError(null);
    try {
      const { token, url } = await fetchToken(true);
      const room = new Room();
      roomRef.current = room;

      await room.connect(url, token, {
        autoSubscribe: true,
      });

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });

      await room.localParticipant.publishTrack(mediaStream.getVideoTracks()[0], {
        name: 'camera',
        source: Track.Source.Camera,
      });
      await room.localParticipant.publishTrack(mediaStream.getAudioTracks()[0], {
        name: 'microphone',
        source: Track.Source.Microphone,
      });

      setStream(mediaStream);
      setIsSharing(true);

      mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopCameraStream();
      });
    } catch (err: any) {
      const msg = err.message || '获取摄像头失败，请确保已授权';
      setError(msg);
      console.error('[LiveKit] startCameraStream:', err);
    }
  }, [isHost, fetchToken]);

  const stopCameraStream = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setStream(null);
    setIsSharing(false);
  }, [stream]);

  const requestStream = useCallback(() => {
    if (!LIVEKIT_URL || isHost) return;
    setError(null);
    setReconnectKey((k) => k + 1);
  }, [LIVEKIT_URL, isHost]);

  // 观众：连接并订阅主播画面
  useEffect(() => {
    if (!LIVEKIT_URL || isHost || !isLive) return;

    let room: Room | null = null;
    let cancelled = false;

    const connect = async () => {
      if (cancelled) return;
      try {
        const { token, url } = await fetchToken(false);
        if (cancelled) return;
        room = new Room();
        roomRef.current = room;

        await room.connect(url, token, { autoSubscribe: true });

        if (cancelled) {
          room.disconnect();
          return;
        }

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
            setStream(new MediaStream([track.mediaStreamTrack]));
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, () => setStream(null));
        room.on(RoomEvent.Disconnected, () => {
          setStream(null);
          roomRef.current = null;
        });

        // 若已有主播在房间，直接订阅
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.kind === Track.Kind.Video && pub.source === Track.Source.Camera) {
              setStream(new MediaStream([pub.track.mediaStreamTrack]));
            }
          });
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '连接失败');
          setStream(null);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (room) room.disconnect();
      roomRef.current = null;
      setStream(null);
    };
  }, [LIVEKIT_URL, isHost, isLive, roomId, fetchToken, reconnectKey]);

  return {
    stream,
    error,
    isSharing,
    startScreenShare: startCameraStream,
    stopScreenShare: stopCameraStream,
    requestStream,
  };
}
