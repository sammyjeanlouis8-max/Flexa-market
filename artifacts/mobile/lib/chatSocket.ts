/**
 * Socket.IO client for Flexa Chat — same path as website (/api/socket.io).
 * Falls back gracefully; chat screens also poll HTTP when disconnected.
 */
import { io, type Socket } from "socket.io-client";
import { getApiBase } from "./api";

let globalSocket: Socket | null = null;

function socketOrigin(): string {
  // getApiBase is https://flexamarket.com/api → origin https://flexamarket.com
  return getApiBase().replace(/\/api\/?$/, "") || "https://flexamarket.com";
}

export function getChatSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(socketOrigin(), {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5,
    });
  }
  return globalSocket;
}

export function presenceJoin(userId: number): void {
  getChatSocket().emit("presence:join", userId);
}

export function joinConversation(convId: number): void {
  getChatSocket().emit("join-conv", convId);
}

export function leaveConversation(convId: number): void {
  getChatSocket().emit("leave-conv", convId);
}

export function emitTyping(convId: number, userId: number): void {
  getChatSocket().emit("typing", { convId, userId });
}

export function emitStopTyping(convId: number, userId: number): void {
  getChatSocket().emit("stop-typing", { convId, userId });
}

export function onNewMessage(cb: (msg: any) => void): () => void {
  const s = getChatSocket();
  s.on("new-message", cb);
  return () => {
    s.off("new-message", cb);
  };
}

export function onConvUpdate(cb: (data: any) => void): () => void {
  const s = getChatSocket();
  s.on("conv-update", cb);
  return () => {
    s.off("conv-update", cb);
  };
}

export function onTyping(cb: (data: { convId: number; userId: number }) => void): () => void {
  const s = getChatSocket();
  s.on("typing", cb);
  return () => {
    s.off("typing", cb);
  };
}

export function onStopTyping(
  cb: (data: { convId: number; userId: number }) => void,
): () => void {
  const s = getChatSocket();
  s.on("stop-typing", cb);
  return () => {
    s.off("stop-typing", cb);
  };
}

export function isSocketConnected(): boolean {
  return !!globalSocket?.connected;
}
