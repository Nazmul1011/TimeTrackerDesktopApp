/**
 * Screenshot grid — today's captures from the backend.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { dayjs } from "@/lib/dayjs";
import { SCREENSHOT_CAPTURED_EVENT } from "@/hooks/useTrackingAgent";
import { screenshotApi } from "@/services/api/screenshot.api";
import { useAuthStore } from "@/store/auth.store";
import {
  ScreenshotCard,
  type ScreenshotItem,
} from "@/components/screenshots/screenshot-card";

function mapApiToItem(item: {
  id: string;
  imageUrl?: string | null;
  capturedAt: string;
  appName?: string | null;
}): ScreenshotItem {
  return {
    id: item.id,
    imageUrl: item.imageUrl,
    capturedAt: item.capturedAt,
    appName: item.appName,
    timeLabel: dayjs(item.capturedAt).format("hh:mm A"),
  };
}

export function ScreenshotGrid() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!organizationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await screenshotApi.listToday();
      setItems(rows.map(mapApiToItem));
    } catch {
      setError("Could not load screenshots");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onCaptured = () => {
      void reload();
    };
    window.addEventListener(SCREENSHOT_CAPTURED_EVENT, onCaptured);
    return () => window.removeEventListener(SCREENSHOT_CAPTURED_EVENT, onCaptured);
  }, [reload]);

  const handleRequestDelete = (id: string) => {
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, deleteRequested: true } : s)),
    );
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
        <ScreenshotCard
          key={item.id}
          item={item}
          onRequestDelete={handleRequestDelete}
        />
      ))}
    </div>
  );
}
