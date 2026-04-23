import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

interface WebSocketState {
  socket: Socket | null;
  connected: boolean;
  connect: (token: string) => void;
  disconnect: () => void;
}

const SOCKET_PATH = '/api/socket.io/';

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  socket: null,
  connected: false,
  connect: (token: string) => {
    if (!token) return;
    const existing = get().socket;

    // Already connected with current token
    if (existing?.connected && (existing.auth as any)?.token === token) {
      return;
    }

    // Tear down stale socket before creating a new one
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    const socket = io(window.location.origin, {
      path: SOCKET_PATH,
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      // Subscribe to per-user inbox stream used by backend emits.
      socket.emit('join:inbox');
      set({ connected: true });
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('connect_error', () => {
      // Keep polling fallback active if socket can't connect.
      set({ connected: false });
    });

    set({ socket, connected: false });
  },
  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({ socket: null, connected: false });
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
        queryClient.invalidateQueries({ queryKey: ['inbox-unread-summary'] });
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      },
      message: () => {
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['inbox-unread-summary'] });
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      },
      'message-sent': () => {
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['inbox-unread-summary'] });
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
