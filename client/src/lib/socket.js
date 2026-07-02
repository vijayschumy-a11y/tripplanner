import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  const token = localStorage.getItem('tp_token');
  if (!socket) {
    socket = io('/', { auth: { token }, autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
