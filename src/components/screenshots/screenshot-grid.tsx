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
import { useAuthStore } from "@/store/auth.store";
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
  // Arrives with the org list, after the first render on a cold start.
  const orgTimezone = useOrgTimezone();
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  if (!items.length) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
        No screenshots yet. Start the timer — captures begin after a few seconds.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <ScreenshotCard key={item.id} item={item} onRequestDelete={handleRequestDelete} />
      ))}
    </div>
  );
}
