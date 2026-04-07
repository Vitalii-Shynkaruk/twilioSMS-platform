import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

interface WebSocketState {
  socket: Socket | null;
  connected: boolean;
  connect: (token: string) => void;
  disconnect: () => void;
}

/**
 * Global WebSocket store — disabled on shared hosting.
 * The PHP proxy cannot reliably handle Socket.IO polling, causing 502 errors.
 * All data refreshing uses React Query polling instead.
 */
export const useWebSocketStore = create<WebSocketState>(() => ({
  socket: null,
  connected: false,
  connect: () => {},
  disconnect: () => {},
}));

/**
 * Hook: subscribe to a WebSocket event. Automatically cleans up on unmount.
 */
export function useWebSocketEvent(event: string, handler: (...args: any[]) => void) {
  const socket = useWebSocketStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler]);
}

/**
 * Hook: auto-invalidate react-query keys when WebSocket events arrive.
 * Use in AppLayout or any top-level component.
 */
export function useWebSocketQuerySync() {
  const queryClient = useQueryClient();
  const socket = useWebSocketStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;

    const handlers = {
      'new-message': () => {
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      },
      message: () => {
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      },
      'message-sent': () => {
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      },
      'message-status': () => {
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
      },
      'campaign-update': () => {
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      },
      'lead-update': () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, handler);
    }

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event, handler);
      }
    };
  }, [socket, queryClient]);
}
