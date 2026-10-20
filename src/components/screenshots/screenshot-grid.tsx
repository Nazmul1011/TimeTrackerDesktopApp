/**
 * Screenshot grid — today's captures from the backend.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dayjs } from "@/lib/dayjs";
import { SCREENSHOT_CAPTURED_EVENT } from "@/hooks/useTrackingAgent";
import { emitNotificationsChanged } from "@/hooks/useNotifications";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { screenshotApi, resolveScreenshotUrl } from "@/services/api/screenshot.api";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { useScreenshotStatusStore } from "@/store/screenshot-status.store";
import { useTimerStore } from "@/store/timer.store";
import { ScreenshotCard, type ScreenshotItem } from "@/components/screenshots/screenshot-card";

function mapApiToItem(item: {
  id: string;
  imageUrl?: string | null;
  url?: string | null;
  capturedAt: string;
  appName?: string | null;
  activityPercent?: number | null;
  deleteRequested?: boolean;
}): ScreenshotItem {
  return {
    id: item.id,
    imageUrl: resolveScreenshotUrl(item.imageUrl ?? item.url) ?? item.imageUrl,
    capturedAt: item.capturedAt,
    appName: item.appName,
    timeLabel: dayjs(item.capturedAt).format("hh:mm A"),
    activityPercent: typeof item.activityPercent === "number" ? item.activityPercent : null,
    deleteRequested: Boolean(item.deleteRequested),
  };
}

export function ScreenshotGrid() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const timerStatus = useTimerStore((s) => s.timer.status);
  // Arrives with the org list, after the first render on a cold start.
  const orgTimezone = useOrgTimezone();
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const failure = useScreenshotStatusStore((s) => s.failure);
  const clearFailure = useScreenshotStatusStore((s) => s.clearFailure);
  const captureBlocked = failure?.kind === "permission";
  const uploadFailure = failure?.kind === "upload" ? failure.message : null;
  const [resettingPermission, setResettingPermission] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const loadedOnceRef = useRef(false);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!organizationId) {
        setItems([]);
        setLoading(false);
        return;
      }
      // A reply for the org we just left must never overwrite the current one.
      const requestedOrg = organizationId;
      const isStale = () => useAuthStore.getState().organizationId !== requestedOrg;

      if (!opts?.silent && !loadedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        const rows = await screenshotApi.listToday(100, orgTimezone);
        if (isStale()) return;
        setItems(rows.map(mapApiToItem));
        loadedOnceRef.current = true;
      } catch {
        if (isStale()) return;
        if (!loadedOnceRef.current) {
          setError("Could not load screenshots");
          setItems([]);
        }
      } finally {
        if (!isStale()) setLoading(false);
      }
    },
    [organizationId, orgTimezone],
  );

  // Each org starts fresh: clear the previous org's shots and let the
  // loading/error states apply again for the new one.
  useEffect(() => {
    loadedOnceRef.current = false;
    setItems([]);
    setError(null);
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onCaptured = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id?: string;
          url?: string;
          activityPercent?: number;
        }>
      ).detail;
      if (detail?.id && detail?.url) {
        const imageUrl = resolveScreenshotUrl(detail.url) ?? detail.url;
        setItems((prev) => {
          if (prev.some((row) => row.id === detail.id)) return prev;
          return [
            {
              id: detail.id!,
              imageUrl,
              capturedAt: new Date().toISOString(),
              appName: null,
              timeLabel: dayjs().format("hh:mm A"),
              activityPercent:
                typeof detail.activityPercent === "number" ? detail.activityPercent : null,
            },
            ...prev,
          ];
        });
      }
      void reload({ silent: true });
    };
    window.addEventListener(SCREENSHOT_CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(SCREENSHOT_CAPTURED_EVENT, onCaptured);
  }, [reload]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void reload({ silent: true });
    }, 8_000);
    return () => window.clearInterval(id);
  }, [reload]);

  const retryScreenshots = () => {
    clearFailure();
    void getElectronAPI()?.tracking.retryScreenshots?.();
  };

  const handleResetPermission = async () => {
    setResettingPermission(true);
    setResetError(null);
    const result = await getElectronAPI()?.tracking.resetScreenRecording?.();
    if (!result?.ok) {
      setResettingPermission(false);
      setResetError(result?.message || "Could not reset permission");
    }
  };

  const uploadFailureNotice = uploadFailure ? (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-xs text-red-600">
      <p>Screenshot could not be uploaded: {uploadFailure}</p>
      <p className="mt-1 text-[var(--text-muted)]">
        The app keeps trying on the next interval. Check your internet connection.
      </p>
      {isElectron() ? (
        <button
          type="button"
          className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-subtle)]"
          onClick={retryScreenshots}
        >
          Try again
        </button>
      ) : null}
    </div>
  ) : null;

  const handleRequestDelete = async (id: string) => {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, deleteRequested: true } : s)));
    try {
      await screenshotApi.requestDeletion(id);
      emitNotificationsChanged();
    } catch {
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, deleteRequested: false } : s)));
      throw new Error("delete-request-failed");
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
        Loading screenshots…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-red-500">
        {error}
      </div>
    );
  }

  const permissionNotice = captureBlocked ? (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
      <p>
        Turn on <span className="font-medium text-[var(--text-subtle)]">Gr8r Time Tracker</span> in
        Screen Recording (both rows if you see two), then quit from the menu-bar{" "}
        <span className="font-medium text-[var(--text-subtle)]">g</span> and open the app again. The
        system dialog should appear only once.
      </p>
      {isElectron() ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => {
              void getElectronAPI()?.tracking.openScreenRecording?.();
            }}
          >
            Open Screen Recording settings
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-subtle)]"
            onClick={retryScreenshots}
          >
            Try again
          </button>
        </div>
      ) : null}
      {isElectron() ? (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p>
            Already turned it on and still seeing this? Click{" "}
            <span className="font-medium text-[var(--text-subtle)]">Fix permission</span>. The app
            restarts, then click <span className="font-medium">Allow</span> when macOS asks and
            start the timer again.
          </p>
          <button
            type="button"
            disabled={resettingPermission}
            className="mt-2 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            onClick={() => void handleResetPermission()}
          >
            {resettingPermission ? "Restarting…" : "Fix permission"}
          </button>
          {resetError ? <p className="mt-2 text-red-500">{resetError}</p> : null}
        </div>
      ) : null}
    </div>
  ) : null;

  if (!items.length) {
    if (permissionNotice) return permissionNotice;
    if (uploadFailureNotice) return uploadFailureNotice;
    if (timerStatus === "running") {
      return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
          Timer is running. The first screenshot should appear in a few seconds.
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
        No screenshots yet. Start the timer — captures begin after a few seconds.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {permissionNotice}
      {uploadFailureNotice}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <ScreenshotCard key={item.id} item={item} onRequestDelete={handleRequestDelete} />
        ))}
      </div>
    </div>
  );
}
