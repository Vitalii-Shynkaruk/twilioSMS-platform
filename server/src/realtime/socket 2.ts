import { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}
