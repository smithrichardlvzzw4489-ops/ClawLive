'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = getSocket();
    setSocket(socketInstance);

    connectSocket();

    socketInstance.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    return () => {
      disconnectSocket();
    };
  }, []);

  return { socket, isConnected };
}
