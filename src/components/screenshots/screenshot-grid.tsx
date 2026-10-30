/**
 * Screenshot grid — today's captures from the backend.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayjs } from "@/lib/dayjs";
import { SCREENSHOT_CAPTURED_EVENT } from "@/hooks/useTrackingAgent";
import { emitNotificationsChanged } from "@/hooks/useNotifications";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { isPageHidden, onPageVisible } from "@/lib/visibility";
import { screenshotApi, resolveScreenshotUrl } from "@/services/api/screenshot.api";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";
import { ScreenshotCard, type ScreenshotItem } from "@/components/screenshots/screenshot-card";

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captureBlocked, setCaptureBlocked] = useState(false);
  const loadedOnceRef = useRef(false);
  const requestIdRef = useRef(0);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!organizationId) {
        setItems([]);
        setLoading(false);
        return;
      }
      // A reply for the org we just left, or for a page the user already
      // moved away from, must never overwrite the current one.
      const requestedOrg = organizationId;
      const requestId = ++requestIdRef.current;
      const isStale = () =>
        useAuthStore.getState().organizationId !== requestedOrg ||
        requestIdRef.current !== requestId;

      if (!opts?.silent && !loadedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await screenshotApi.listToday(page, PAGE_SIZE, orgTimezone);
        if (isStale()) return;
        setTotal(result.total);
        setTotalPages(result.totalPages);
        // Deletions elsewhere can leave this page empty; fall back to the last one.
        if (page > result.totalPages) {
          setPage(Math.max(1, result.totalPages));
          return;
        }
        setItems(result.items.map(mapApiToItem));
        loadedOnceRef.current = true;
      } catch {
        if (isStale()) return;
        if (!loadedOnceRef.current) {
          setError("Could not load screenshots");
          setItems([]);
        }
      } finally {
        if (!isStale()) {
          setLoading(false);
          setPageLoading(false);
        }
      }
    },
    [organizationId, orgTimezone, page],
  );

  // Each org starts fresh: clear the previous org's shots and let the
  // loading/error states apply again for the new one.
  useEffect(() => {
    loadedOnceRef.current = false;
    setItems([]);
    setPage(1);
    setTotal(0);
    setTotalPages(1);
    setError(null);
  }, [organizationId]);

  const goToPage = (next: number) => {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target === page) return;
    setPageLoading(true);
    setPage(target);
  };

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
      // Newest first, so a new capture only belongs on the first page.
      if (detail?.id && detail?.url && page === 1) {
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
          ].slice(0, PAGE_SIZE);
        });
      }
      void reload({ silent: true });
    };
    window.addEventListener(SCREENSHOT_CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(SCREENSHOT_CAPTURED_EVENT, onCaptured);
  }, [page, reload]);

  useEffect(() => {
    // New captures arrive through SCREENSHOT_CAPTURED_EVENT; this only picks
    // up deletions and approvals made elsewhere.
    const id = window.setInterval(() => {
      if (isPageHidden()) return;
      void reload({ silent: true });
    }, 30_000);
    const unsubVisible = onPageVisible(() => void reload({ silent: true }));
    return () => {
      window.clearInterval(id);
      unsubVisible();
    };
  }, [reload]);

  useEffect(() => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    if (!api?.tracking?.onFailed) return;
    const unsub = api.tracking.onFailed((payload) => {
      const message = payload?.message || "";
      if (/screen recording/i.test(message)) {
        setCaptureBlocked(true);
      }
    });
    const unsubUploaded = api.tracking.onUploaded(() => {
      setCaptureBlocked(false);
    });
    return () => {
      unsub();
      unsubUploaded();
    };
  }, []);

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
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)] dark:bg-card">
        Loading screenshots…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-red-500 dark:bg-card">
        {error}
      </div>
    );
  }

  if (!items.length) {
    if (captureBlocked) {
      return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)] dark:bg-card">
          <p>
            Turn on <span className="font-medium text-[var(--text-subtle)]">Gr8r Time Tracker</span>{" "}
            in Screen Recording (both rows if you see two), then quit from the menu-bar{" "}
            <span className="font-medium text-[var(--text-subtle)]">g</span> and open the app again.
            The system dialog should appear only once.
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
                className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-subtle)] dark:bg-card"
                onClick={() => {
                  setCaptureBlocked(false);
                  void getElectronAPI()?.tracking.retryScreenshots?.();
                }}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      );
    }
    if (timerStatus === "running") {
      return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)] dark:bg-card">
          Timer is running. The first screenshot should appear in a few seconds.
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)] dark:bg-card">
        No screenshots yet. Start the timer — captures begin after a few seconds.
      </div>
    );
  }

  const pagerButtonClass =
    "flex h-8 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-white dark:bg-card px-3 text-xs font-medium text-[var(--text-subtle)] transition-colors hover:bg-[#f5f5f5] dark:hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`grid grid-cols-2 gap-2 transition-opacity ${pageLoading ? "opacity-50" : ""}`}
        aria-busy={pageLoading}
      >
        {items.map((item) => (
          <ScreenshotCard key={item.id} item={item} onRequestDelete={handleRequestDelete} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={pagerButtonClass}
            disabled={page <= 1 || pageLoading}
            onClick={() => goToPage(page - 1)}
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Previous
          </button>
          <p className="text-xs tabular-nums text-[var(--text-muted)]">
            Page {page} of {totalPages}
            <span className="ml-1">({total})</span>
          </p>
          <button
            type="button"
            className={pagerButtonClass}
            disabled={page >= totalPages || pageLoading}
            onClick={() => goToPage(page + 1)}
          >
            Next
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
