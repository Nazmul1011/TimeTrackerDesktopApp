/**
 * Socket.IO realtime client for timer events (web ↔ desktop).
 * Listens to both `timer:event` and `timer-event` names.
 */
import { io, type Socket } from "socket.io-client";
import { STORAGE_KEYS } from "@/constants/storage";
import type { ApiTimer } from "@/services/api/types";
import { dispatchTimerStopped } from "@/lib/timer-events";
import { useTimerStore } from "@/store/timer.store";
import { useAuthStore } from "@/store/auth.store";

type TimerEventPayload = {
  userId?: string;
  timer?: ApiTimer;
  entries?: Array<{ duration?: number | null }>;
  count?: number;
  totalDurationSeconds?: number;
};

let socket: Socket | null = null;

function getSocketUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:3001";
  return base.replace(/\/$/, "");
}

function isOwnEvent(payload: TimerEventPayload): boolean {
  const myId = useAuthStore.getState().user?.id;
  if (!payload.userId || !myId) return true;
  return payload.userId === myId;
}

function applyTimerPayload(payload: TimerEventPayload | null | undefined) {
  if (payload && !isOwnEvent(payload)) return;
  const store = useTimerStore.getState();
  if (!payload?.timer) {
    store.setIdle();
    return;
  }
  store.hydrateFromApi(payload.timer);
}

function savedSeconds(payload: TimerEventPayload): number {
  if (payload.totalDurationSeconds != null) {
    return payload.totalDurationSeconds;
  }
  return (
    payload.entries?.reduce((sum, entry) => sum + (entry.duration ?? 0), 0) ?? 0
  );
}

function bind(
  active: Socket,
  names: string[],
  handler: (payload: TimerEventPayload) => void,
) {
  for (const name of names) {
    active.on(name, handler);
  }
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

  bind(socket, ["timer:started", "timer-started"], (payload) => {
    applyTimerPayload(payload);
  });
  bind(socket, ["timer:paused", "timer-paused"], (payload) => {
    applyTimerPayload(payload);
  });
  bind(socket, ["timer:resumed", "timer-resumed"], (payload) => {
    applyTimerPayload(payload);
  });
  bind(socket, ["timer:synced", "timer-synced"], (payload) => {
    applyTimerPayload(payload);
  });
  bind(socket, ["timer:stopped", "timer-stopped"], (payload) => {
    if (!isOwnEvent(payload)) return;
    const saved = savedSeconds(payload);
    const previous = useTimerStore.getState().todayLoggedMs;
    useTimerStore.getState().setIdle();
    if (saved > 0) {
      useTimerStore
        .getState()
        .setTodayLoggedSeconds(previous / 1000 + saved);
    }
    dispatchTimerStopped({
      totalDurationSeconds: saved,
      entryCount: payload.count ?? payload.entries?.length ?? 0,
    });
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
