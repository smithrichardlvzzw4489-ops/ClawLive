'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

// 多 STUN + TURN 提升跨网/移动端连接成功率
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // freeTURN 公共 TURN，NAT 严格时兜底（带宽有限）
  { urls: 'turn:freeturn.net:3478', username: 'free', credential: 'free' },
  { urls: 'turn:freeturn.net:5349?transport=tcp', username: 'free', credential: 'free' },
];

interface UseVideoStreamOptions {
  roomId: string;
  socket: Socket | null;
  isHost: boolean;
  isLive: boolean;
}

export function useVideoStream({ roomId, socket, isHost, isLive }: UseVideoStreamOptions) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  // 主播：开始摄像头直播（电脑/手机摄像头）
  const startCameraStream = useCallback(async () => {
    if (!socket || !isHost) return;
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      localStreamRef.current = mediaStream;
      setStream(mediaStream);
      setIsSharing(true);
      socket.emit('webrtc-register-host', { roomId });

      mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopCameraStream();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取摄像头失败，请确保已授权相机权限';
      setError(msg);
      console.error('getUserMedia error:', err);
    }
  }, [socket, isHost, roomId]);

  // 主播：停止摄像头直播
  const stopCameraStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setStream(null);
    setIsSharing(false);
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    socket?.emit('webrtc-unregister-host', { roomId });
  }, [socket, roomId]);

  const startScreenShare = startCameraStream;
  const stopScreenShare = stopCameraStream;

  // 观众：请求流（加入时 + host 就绪时）
  const requestStream = useCallback(() => {
    if (socket && !isHost) socket.emit('webrtc-viewer-request', { roomId });
  }, [socket, isHost, roomId]);

  useEffect(() => {
    if (!socket || isHost || !isLive) return;
    const t = setTimeout(requestStream, 300);
    return () => clearTimeout(t);
  }, [socket, isHost, isLive, roomId, requestStream]);

  useEffect(() => {
    if (!socket || isHost) return;
    socket.on('webrtc-host-ready', requestStream);
    return () => {
      socket.off('webrtc-host-ready', requestStream);
    };
  }, [socket, isHost, requestStream]);

  // 观众：无画面时每隔 2 秒重试请求（晚加入或连接失败时自动恢复）
  useEffect(() => {
    if (!socket || isHost || !isLive || stream) return;
    const interval = setInterval(requestStream, 2000);
    return () => clearInterval(interval);
  }, [socket, isHost, isLive, stream, requestStream]);

  // 主播：处理观众请求，创建 PeerConnection 并发送 offer
  // 必须依赖 isSharing，否则主播点击摄像头后 effect 不会重新跑，handler 不会注册
  useEffect(() => {
    if (!socket || !isHost) return;

    const handleViewerRequest = async ({ viewerId }: { viewerId: string }) => {
      if (!localStreamRef.current) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-ice', { roomId, toId: viewerId, candidate: e.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(viewerId);
        }
      };

      peersRef.current.set(viewerId, pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { roomId, toViewerId: viewerId, sdp: offer });
    };

    socket.on('webrtc-viewer-request', handleViewerRequest);
    return () => {
      socket.off('webrtc-viewer-request', handleViewerRequest);
    };
  }, [socket, isHost, roomId, isSharing]);

  // 观众：处理 offer、answer、ice
  const hostIdRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!socket || isHost) return;

    const handleOffer = async ({ sdp, fromHostId }: { sdp: RTCSessionDescriptionInit; fromHostId: string }) => {
      hostIdRef.current = fromHostId;
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (e.streams[0]) setStream(e.streams[0]);
      };
      const handleConnectionFailed = () => {
        setStream(null);
        hostIdRef.current = null;
        pcRef.current = null;
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') handleConnectionFailed();
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') handleConnectionFailed();
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && hostIdRef.current) {
          socket.emit('webrtc-ice', { roomId, toId: hostIdRef.current, candidate: e.candidate });
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { roomId, toHostId: fromHostId, sdp: answer });
    };

    const handleIce = ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    };

    const handleStreamEnded = () => {
      pcRef.current?.close();
      pcRef.current = null;
      hostIdRef.current = null;
      setStream(null);
    };

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-ice', handleIce);
    socket.on('webrtc-stream-ended', handleStreamEnded);

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-ice', handleIce);
      socket.off('webrtc-stream-ended', handleStreamEnded);
      pcRef.current?.close();
    };
  }, [socket, isHost, roomId]);

  // 主播：处理 answer 和 ice
  useEffect(() => {
    if (!socket || !isHost) return;

    const handleAnswer = async ({ sdp, fromViewerId }: { sdp: RTCSessionDescriptionInit; fromViewerId: string }) => {
      const pc = peersRef.current.get(fromViewerId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    };

    const handleIce = ({ candidate, fromId }: { candidate: RTCIceCandidateInit; fromId: string }) => {
      const pc = peersRef.current.get(fromId);
      pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    };

    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice', handleIce);

    return () => {
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice', handleIce);
    };
  }, [socket, isHost]);

  // 问题：观众收到 offer 时，answer 要发回给 host，但观众不知道 host 的 socket.id
  // 解决：在 webrtc-offer 事件里附带 fromHostId，观众存下来，发 answer 时用
  // 需要改服务端，在转发 offer 时带上 fromHostId
  return {
    stream,
    error,
    isSharing,
    isReconnecting: false,
    isRoomConnected: false,
    startScreenShare,
    stopScreenShare,
    requestStream: isHost ? undefined : requestStream,
  };
}
