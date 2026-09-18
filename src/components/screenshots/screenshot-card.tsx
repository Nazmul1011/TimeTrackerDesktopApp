/**
 * Screenshot card — real image preview + delete request.
 */
"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatActivityPercent } from "@/lib/activity-percent";

export type ScreenshotItem = {
  id: string;
  timeLabel: string;
  capturedAt: string;
  imageUrl?: string | null;
  appName?: string | null;
  deleteRequested?: boolean;
  activityPercent?: number | null;
};

interface ScreenshotCardProps {
  item: ScreenshotItem;
  onRequestDelete?: (id: string) => void | Promise<void>;
}

export function ScreenshotCard({ item, onRequestDelete }: ScreenshotCardProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const activityLabel =
    typeof item.activityPercent === "number" ? formatActivityPercent(item.activityPercent) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1">
      <div
        role="button"
        tabIndex={0}
        className="group relative block aspect-[179/106] w-full cursor-pointer overflow-hidden rounded-lg bg-[var(--surface-elevated)]"
        onClick={() => setShowDelete((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDelete((v) => !v);
          }
        }}
        aria-label={
          activityLabel
            ? `Screenshot at ${item.timeLabel}, ${activityLabel}% activity`
            : `Screenshot at ${item.timeLabel}`
        }
      >
        {item.imageUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.appName || "Screenshot"}
            className="size-full bg-[var(--surface-elevated)] object-contain"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-[10px] text-slate-500">
            No preview
          </div>
        )}

        {item.deleteRequested ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-medium text-white">
            Pending deletion
          </span>
        ) : null}

        {typeof item.activityPercent === "number" && !showDelete ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            <div className="h-1 overflow-hidden rounded-full bg-white/30">
              <div
                className={`h-full rounded-full ${
                  item.activityPercent >= 60
                    ? "bg-emerald-400"
                    : item.activityPercent >= 25
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${item.activityPercent}%` }}
              />
            </div>
            <span className="text-[10px] font-medium leading-none text-white">
              {activityLabel}% activity
            </span>
          </div>
        ) : null}

        {showDelete && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 p-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="max-w-[90%] rounded-md bg-black px-2 py-1.5 text-center text-[10px] leading-tight text-white">
              Request deletion for personal content, admin reviews before removing permanently.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-red-400 bg-white text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
              disabled={item.deleteRequested}
              onClick={() => {
                if (item.deleteRequested) return;
                void (async () => {
                  try {
                    await onRequestDelete?.(item.id);
                    setShowDelete(false);
                    toast.success("Deletion request submitted for admin review");
                  } catch {
                    toast.error("Could not submit deletion request");
                  }
                })();
              }}
            >
              {item.deleteRequested ? "Request pending" : "Request to delete"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 py-1">
        <div className="min-w-0">
          <span className="text-xs text-[var(--text-subtle)]">{item.timeLabel}</span>
          {item.appName ? (
            <p className="truncate text-[10px] text-[var(--text-muted)]">{item.appName}</p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="outline-none" aria-label="Screenshot menu">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/icon-more.svg" alt="" className="size-4" width={16} height={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={item.deleteRequested} onClick={() => setShowDelete(true)}>
              {item.deleteRequested ? "Deletion pending" : "Request to delete"}
            </DropdownMenuItem>
            {item.imageUrl ? (
              <DropdownMenuItem
                onClick={() => window.open(item.imageUrl!, "_blank", "noopener,noreferrer")}
              >
                View
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
