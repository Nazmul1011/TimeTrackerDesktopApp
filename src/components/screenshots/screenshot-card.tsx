/**
 * Screenshot card — real image preview + delete request.
 */
"use client";

import { useEffect, useState } from "react";
import { CloudOff, CloudUpload, ImageOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatActivityPercent } from "@/lib/activity-percent";
import { DARK_INK_INVERT } from "@/components/icons/figma-glyph";

export type ScreenshotItem = {
  id: string;
  timeLabel: string;
  capturedAt: string;
  imageUrl?: string | null;
  appName?: string | null;
  deleteRequested?: boolean;
  /** Saved on this PC and not uploaded yet. */
  pendingUpload?: boolean;
  activityPercent?: number | null;
};

/** Shown when the image cannot load: the server copy while offline, or a missing image. */
function PreviewPlaceholder({ offline }: { offline: boolean }) {
  const Icon = offline ? CloudOff : ImageOff;
  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-1.5 overflow-hidden bg-[#f4f6f9] px-3 text-center dark:bg-[#131c2e]">
      {/* Faint dot grid so the empty box still reads as an image area. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle,rgba(100,116,139,0.18)_1px,transparent_1px)] [background-size:12px_12px] dark:opacity-40"
      />
      <span className="relative flex size-8 items-center justify-center rounded-full bg-white text-[#64748b] shadow-sm ring-1 ring-black/5 dark:bg-white/[0.06] dark:text-[#94a3b8] dark:ring-white/10">
        <Icon className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <span className="relative flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold leading-3 text-[#334155] dark:text-[#cbd5e1]">
          {offline ? "Preview offline" : "No preview"}
        </span>
        <span className="text-[9px] leading-3 text-[#64748b] dark:text-[#64748b]">
          {offline ? "Shows when you're back online" : "The image is not available"}
        </span>
      </span>
    </div>
  );
}

interface ScreenshotCardProps {
  item: ScreenshotItem;
  onRequestDelete?: (id: string) => void | Promise<void>;
  /** Server unreachable: deletion requests wait, server images may not load. */
  offline?: boolean;
}

export function ScreenshotCard({ item, onRequestDelete, offline = false }: ScreenshotCardProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Back online: try the server image again instead of keeping the placeholder.
  useEffect(() => {
    if (!offline) setImgFailed(false);
  }, [offline]);

  const activityLabel =
    typeof item.activityPercent === "number" ? formatActivityPercent(item.activityPercent) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1 dark:bg-card">
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
          <PreviewPlaceholder offline={offline} />
        )}

        {item.pendingUpload ? (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 shadow-sm dark:bg-black/60 dark:text-amber-300">
            <CloudUpload className="size-2.5" aria-hidden />
            Waiting to upload
          </span>
        ) : null}

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
              className="h-8 border-red-400 bg-white text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:border-red-500/60 dark:bg-card dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
              disabled={item.deleteRequested || offline || item.pendingUpload}
              onClick={() => {
                if (item.deleteRequested || offline || item.pendingUpload) return;
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
              {item.deleteRequested
                ? "Request pending"
                : offline
                  ? "Available when you're online"
                  : "Request to delete"}
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
        {item.pendingUpload ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="outline-none" aria-label="Screenshot menu">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/figma/icon-more.svg"
                  alt=""
                  className={`size-4 ${DARK_INK_INVERT}`}
                  width={16}
                  height={16}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={item.deleteRequested || offline}
                onClick={() => setShowDelete(true)}
              >
                {item.deleteRequested
                  ? "Deletion pending"
                  : offline
                    ? "Request to delete (when online)"
                    : "Request to delete"}
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
        )}
      </div>
    </div>
  );
}
