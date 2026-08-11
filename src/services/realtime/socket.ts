/**
 * Socket.IO realtime client for timer events.
 */
import { io, type Socket } from "socket.io-client";
import { STORAGE_KEYS } from "@/constants/storage";
import type { ApiTimer } from "@/services/api/types";
import { useTimerStore } from "@/store/timer.store";

type TimerEventPayload = {
  timer?: ApiTimer;
  entries?: unknown[];
  count?: number;
};

let socket: Socket | null = null;

function getSocketUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:3001";
  return base.replace(/\/$/, "");
}

function applyTimerPayload(payload: TimerEventPayload | null | undefined) {
  const store = useTimerStore.getState();
  if (!payload?.timer) {
    store.setIdle(0);
    return;
  }
  store.hydrateFromApi(payload.timer);
}

export function connectRealtime(options?: {
  token?: string | null;
  organizationId?: string | null;
}): Socket | null {
  if (typeof window === "undefined") return null;

  const token =
    options?.token ?? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  const organizationId =
    options?.organizationId ??
    localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID);

  if (!token || !organizationId) {
    return null;
  }

  if (socket?.connected) {
    disconnectRealtime();
  }

  socket = io(`${getSocketUrl()}/realtime`, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    auth: {
      token,
      organizationId,
    },
  });

  socket.on("timer:started", (payload: TimerEventPayload) => {
    applyTimerPayload(payload);
  });
  socket.on("timer:paused", (payload: TimerEventPayload) => {
    applyTimerPayload(payload);
  });
  socket.on("timer:resumed", (payload: TimerEventPayload) => {
    applyTimerPayload(payload);
  });
  socket.on("timer:synced", (payload: TimerEventPayload) => {
    applyTimerPayload(payload);
  });
  socket.on("timer:stopped", () => {
    useTimerStore.getState().setIdle(0);
  });

  return socket;
}

export function disconnectRealtime() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function getRealtimeSocket() {
  return socket;
}
