import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket(): void {
  if (socket && socket.connected) {
    socket.disconnect();
  }
}
