/**
 * Keeps the connection store current, on every route:
 * - while offline, asks /health/live whether the server answers again
 *   (API replies already flip the state; this covers a quiet app);
 * - counts the work waiting in the upload queue, for the banner;
 * - when the connection comes back, sends the queue first and then fires
 *   CONNECTION_RESTORED_EVENT so screens swap their saved copy for live data.
 */
"use client";

import { useEffect } from "react";
import axios from "axios";
import { flushOfflineQueue } from "@/lib/offline-sync";
import { getApiBaseUrl } from "@/services/api/client";
import { getElectronAPI, isElectron } from "@/services/electron";
import {
  CONNECTION_RESTORED_EVENT,
  useConnectionStore,
  type PendingUploads,
} from "@/store/connection.store";

/** How often to ask the server while offline (network adapter says connected). */
const PROBE_MS = 10_000;
/** Same, while Windows/macOS reports no network at all: the "online" event usually comes first. */
const PROBE_NO_NETWORK_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const COUNT_BUSY_MS = 5_000;
const COUNT_IDLE_MS = 30_000;

async function serverAnswers(): Promise<boolean> {
  try {
    await axios.get(`${getApiBaseUrl().replace(/\/$/, "")}/health/live`, {
      timeout: PROBE_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    // Any HTTP answer, even an error, means the server is reachable.
    return (
      axios.isAxiosError(error) && Boolean(error.response) && (error.response?.status ?? 0) < 502
    );
  }
}

async function countQueued(): Promise<PendingUploads | null> {
  if (!isElectron()) return null;
  const sync = getElectronAPI()?.sync;
  if (!sync) return null;
  try {
    const [time, screenshots, activity] = await Promise.all([
      sync.list("timer"),
      sync.list("screenshot"),
      sync.list("activity"),
    ]);
    return {
      time: Array.isArray(time) ? time.length : 0,
      screenshots: Array.isArray(screenshots) ? screenshots.length : 0,
      activity: Array.isArray(activity) ? activity.length : 0,
    };
  } catch {
    return null;
  }
}

export function useConnectionMonitor() {
  const online = useConnectionStore((s) => s.online);
  const restoredAt = useConnectionStore((s) => s.restoredAt);

  // Network adapter events: "offline" is reliable, "online" only means a
  // network is back, not that the server answers, so check first.
  useEffect(() => {
    if (navigator.onLine === false) useConnectionStore.getState().markOffline();
    const onOffline = () => useConnectionStore.getState().markOffline();
    const onOnline = () => {
      void serverAnswers().then((ok) => {
        if (ok) useConnectionStore.getState().markOnline();
      });
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Ask the server again while offline.
  useEffect(() => {
    if (online) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const probe = async () => {
      if (stopped) return;
      if (await serverAnswers()) {
        if (!stopped) useConnectionStore.getState().markOnline();
        return;
      }
      if (stopped) return;
      timer = setTimeout(probe, navigator.onLine === false ? PROBE_NO_NETWORK_MS : PROBE_MS);
    };
    timer = setTimeout(probe, navigator.onLine === false ? PROBE_NO_NETWORK_MS : PROBE_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [online]);

  // Count queued work: often while something waits, rarely otherwise.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const counts = await countQueued();
      if (stopped) return;
      if (counts) useConnectionStore.getState().setPending(counts);
      const state = useConnectionStore.getState();
      const busy =
        !state.online ||
        state.pending.time + state.pending.screenshots + state.pending.activity > 0;
      timer = setTimeout(tick, busy ? COUNT_BUSY_MS : COUNT_IDLE_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [online]);

  // Back online: upload what waited, then let screens reload.
  useEffect(() => {
    if (!restoredAt) return;
    let cancelled = false;
    void (async () => {
      try {
        await flushOfflineQueue();
      } catch {
        // the regular flush loop retries
      }
      const counts = await countQueued();
      if (cancelled) return;
      if (counts) useConnectionStore.getState().setPending(counts);
      window.dispatchEvent(new Event(CONNECTION_RESTORED_EVENT));
    })();
    return () => {
      cancelled = true;
    };
  }, [restoredAt]);
}
