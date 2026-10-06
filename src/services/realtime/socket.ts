/**
 * Socket.IO realtime client for timer events (web ↔ desktop).
 * Listens to both `timer:event` and `timer-event` names.
 */
import { io, type Socket } from "socket.io-client";
import { STORAGE_KEYS } from "@/constants/storage";
import { getFreshAccessToken } from "@/services/api/client";
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
  return payload.entries?.reduce((sum, entry) => sum + (entry.duration ?? 0), 0) ?? 0;
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

/**
 * socket.io never auto-reconnects after the server itself closes the socket,
 * which is what the gateway does with an expired token. Reconnect by hand with
 * backoff; the `auth` callback supplies a refreshed token. Stops if the user
 * is signed out (no token can be obtained).
 */
function scheduleReconnect(active: Socket) {
  if (reconnectTimer) return;
  const delay = Math.min(30_000, 2_000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (active !== socket || active.connected) return;
    void getFreshAccessToken().then((fresh) => {
      if (active !== socket || active.connected || !fresh) return;
      active.connect();
    });
  }, delay);
}

function bind(active: Socket, names: string[], handler: (payload: TimerEventPayload) => void) {
  for (const name of names) {
    active.on(name, handler);
  }
}

export function connectRealtime(options?: {
  token?: string | null;
  organizationId?: string | null;
}): Socket | null {
  if (typeof window === "undefined") return null;

  const token = options?.token ?? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  const organizationId =
    options?.organizationId ?? localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID);

  if (!token || !organizationId) {
    return null;
  }

  if (socket?.connected) {
    disconnectRealtime();
  }

  // `auth` as a function runs on every (re)connect attempt. A fixed object
  // would replay the token from first connect, which the server rejects once
  // the 15-minute JWT expires — after any sleep or network blip.
  socket = io(`${getSocketUrl()}/realtime`, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    auth: (cb) => {
      void getFreshAccessToken().then((fresh) => {
        cb({
          token: fresh ?? token,
          organizationId: localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID) ?? organizationId,
        });
      });
    },
  });

  socket.on("connect", () => {
    const active = socket;
    // Only forget the backoff once the connection has survived a while, so a
    // server that accepts and immediately drops us can't cause a tight loop.
    setTimeout(() => {
      if (active && active === socket && active.connected) reconnectAttempts = 0;
    }, 10_000);
  });
  socket.on("disconnect", (reason) => {
    if (socket && reason === "io server disconnect") scheduleReconnect(socket);
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
      useTimerStore.getState().setTodayLoggedSeconds(previous / 1000 + saved);
    }
    dispatchTimerStopped({
      totalDurationSeconds: saved,
      entryCount: payload.count ?? payload.entries?.length ?? 0,
    });
  });

  return socket;
}

export function disconnectRealtime() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function getRealtimeSocket() {
  return socket;
}
