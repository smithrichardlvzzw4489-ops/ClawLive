'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { API_BASE_URL } from '@/lib/api';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

export function useLiveKit({
  roomId,
  isHost,
  isLive,
  participantName,
  liveMode = 'video',
}: {
  roomId: string;
  isHost: boolean;
  isLive: boolean;
  participantName: string;
  liveMode?: 'video' | 'audio';
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isRoomConnected, setIsRoomConnected] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const speakerStreamRef = useRef<MediaStream | null>(null);

  const fetchToken = useCallback(
    async (asHost: boolean) => {
      const authToken = localStorage.getItem('token');
      const endpoint = asHost ? '/api/livekit/token' : '/api/livekit/token-viewer';
      const body = asHost
        ? { roomId, participantName: participantName || `host-${Date.now()}`, isHost: true }
        : { roomId };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
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

  const fetchSpeakerToken = useCallback(async () => {
    const authToken = localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/livekit/token-speaker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ roomId, participantName: participantName || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '获取连麦令牌失败');
    if (!data.token || !data.url) throw new Error(data.error || '获取令牌失败');
    return data;
  }, [roomId, participantName]);

  const startMediaStream = useCallback(
    async (withVideo: boolean) => {
      if (!LIVEKIT_URL || !isHost) return;
      setError(null);
      try {
        const { token, url } = await fetchToken(true);
        const room = new Room();
        roomRef.current = room;

        await room.connect(url, token, { autoSubscribe: true });

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
          audio: true,
        });

        if (withVideo && mediaStream.getVideoTracks()[0]) {
          await room.localParticipant.publishTrack(mediaStream.getVideoTracks()[0], {
            name: 'camera',
            source: Track.Source.Camera,
          });
          mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
            roomRef.current?.disconnect();
            roomRef.current = null;
            mediaStream.getTracks().forEach((t) => t.stop());
            setStream(null);
            setIsSharing(false);
          });
        }
        if (mediaStream.getAudioTracks()[0]) {
          await room.localParticipant.publishTrack(mediaStream.getAudioTracks()[0], {
            name: 'microphone',
            source: Track.Source.Microphone,
          });
        }

        setStream(mediaStream);
        setIsSharing(true);
      } catch (err: any) {
        const msg = err.message || (withVideo ? '获取摄像头失败，请确保已授权' : '获取麦克风失败，请确保已授权');
        setError(msg);
        console.error('[LiveKit] startMediaStream:', err);
      }
    },
    [isHost, fetchToken]
  );

  const stopMediaStream = useCallback(() => {
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

  const startSpeaker = useCallback(async () => {
    if (!LIVEKIT_URL || isHost) return;
    setError(null);
    try {
      const { token, url } = await fetchSpeakerToken();
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      setStream(null);
      // 短暂延迟，确保设备被释放后再请求（避免 NotReadableError: Device in use）
      await new Promise((r) => setTimeout(r, 300));
      const room = new Room();
      roomRef.current = room;
      await room.connect(url, token, { autoSubscribe: true });

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: liveMode === 'video',
        audio: true,
      });
      if (mediaStream.getAudioTracks()[0]) {
        await room.localParticipant.publishTrack(mediaStream.getAudioTracks()[0], {
          name: 'microphone',
          source: Track.Source.Microphone,
        });
      }
      if (liveMode === 'video' && mediaStream.getVideoTracks()[0]) {
        await room.localParticipant.publishTrack(mediaStream.getVideoTracks()[0], {
          name: 'camera',
          source: Track.Source.Camera,
        });
      }
      speakerStreamRef.current = mediaStream;
      mediaStream.getTracks().forEach((t) => t.addEventListener('ended', () => stopSpeaker()));

      setIsSpeaker(true);
      setIsRoomConnected(true);

      const updateStreamFromRoom = () => {
        const allTracks: MediaStreamTrack[] = [];
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track?.mediaStreamTrack) allTracks.push(pub.track.mediaStreamTrack);
          });
        });
        if (allTracks.length > 0) setStream(new MediaStream(allTracks));
      };

      room.on(RoomEvent.TrackSubscribed, updateStreamFromRoom);
      room.on(RoomEvent.Disconnected, () => {
        setIsSpeaker(false);
        setIsRoomConnected(false);
        setStream(null);
        roomRef.current = null;
      });
      updateStreamFromRoom();
    } catch (err: any) {
      const msg =
        err?.name === 'NotReadableError' || err?.message?.includes('Device in use')
          ? '麦克风正在被其他应用使用，请关闭其他标签页或应用后重试'
          : err.message || '连麦失败';
      setError(msg);
      console.error('[LiveKit] startSpeaker:', err);
    }
  }, [LIVEKIT_URL, isHost, liveMode, fetchSpeakerToken]);

  const stopSpeaker = useCallback(() => {
    if (speakerStreamRef.current) {
      speakerStreamRef.current.getTracks().forEach((t) => t.stop());
      speakerStreamRef.current = null;
    }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setStream(null);
    setIsSpeaker(false);
    setReconnectKey((k) => k + 1);
  }, []);

  const requestStream = useCallback(() => {
    if (!LIVEKIT_URL || isHost) return;
    setError(null);
    setIsReconnecting(true);
    setIsRoomConnected(false);
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setStream(null);
    setReconnectKey((k) => k + 1);
  }, [LIVEKIT_URL, isHost]);

  const updateStreamFromAllParticipants = useCallback((r: Room) => {
    const allTracks: MediaStreamTrack[] = [];
    r.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        if (pub.track?.mediaStreamTrack) allTracks.push(pub.track.mediaStreamTrack);
      });
    });
    setStream(allTracks.length > 0 ? new MediaStream(allTracks) : null);
  }, []);

  // 观众：连接并订阅（不连麦时）
  useEffect(() => {
    if (!LIVEKIT_URL || isHost || !isLive || isSpeaker) return;

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

        setIsRoomConnected(true);

        room.on(RoomEvent.TrackSubscribed, () => updateStreamFromAllParticipants(room!));
        room.on(RoomEvent.TrackUnsubscribed, () => updateStreamFromAllParticipants(room!));
        room.on(RoomEvent.Disconnected, () => {
          setIsRoomConnected(false);
          setStream(null);
          roomRef.current = null;
        });

        updateStreamFromAllParticipants(room);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '连接失败');
          setStream(null);
        }
      } finally {
        if (!cancelled) setIsReconnecting(false);
      }
    };

    connect();

    return () => {
      cancelled = true;
      setIsRoomConnected(false);
      if (room) room.disconnect();
      roomRef.current = null;
      setStream(null);
    };
  }, [LIVEKIT_URL, isHost, isLive, isSpeaker, roomId, fetchToken, reconnectKey, updateStreamFromAllParticipants]);

  return {
    stream,
    error,
    isSharing,
    isSpeaker,
    isReconnecting,
    isRoomConnected,
    noHostRegistered: false,
    startScreenShare: (withVideo?: boolean) => startMediaStream(withVideo ?? liveMode === 'video'),
    stopScreenShare: stopMediaStream,
    requestStream,
    startSpeaker,
    stopSpeaker,
  };
}
