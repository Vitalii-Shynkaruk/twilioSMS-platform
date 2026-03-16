import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

interface WebSocketState {
  socket: Socket | null;
  connected: boolean;
  connect: (token: string) => void;
  disconnect: () => void;
}

/**
 * Global WebSocket store — single connection shared across all pages.
 * Emits events that any page can listen to via useWebSocketEvent().
 */
export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  socket: null,
  connected: false,

  connect: (token: string) => {
    const existing = get().socket;
    if (existing?.connected) return; // Already connected

    const socket = io(window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      set({ connected: true });
      // Auto-join inbox channel
      socket.emit('join:inbox');
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('connect_error', () => {
      set({ connected: false });
    });

    set({ socket, connected: false });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },
}));

/**
 * Hook: subscribe to a WebSocket event. Automatically cleans up on unmount.
 */
export function useWebSocketEvent(event: string, handler: (...args: any[]) => void) {
  const socket = useWebSocketStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler);
    return () => { socket.off(event, handler); };
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
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
