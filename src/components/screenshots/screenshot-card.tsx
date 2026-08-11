/**
 * Screenshot card — gradient preview + delete request.
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
import type { ScreenshotItem } from "@/constants/demo-data";

interface ScreenshotCardProps {
  item: ScreenshotItem;
  onRequestDelete?: (id: string) => void;
}

export function ScreenshotCard({ item, onRequestDelete }: ScreenshotCardProps) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1">
      <button
        type="button"
        className="relative block aspect-[179/106] w-full overflow-hidden rounded-lg"
        style={{ background: item.gradient }}
        onClick={() => setShowDelete((v) => !v)}
        aria-label={`Screenshot at ${item.timeLabel}`}
      >
        {showDelete && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20 p-2">
            <div className="max-w-[90%] rounded-md bg-black px-2 py-1.5 text-center text-[10px] leading-tight text-white">
              Request deletion for personal content, admin reviews before removing permanently.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-red-400 bg-white text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete?.(item.id);
                setShowDelete(false);
                toast.success("Deletion request submitted for admin review");
              }}
            >
              Request to delete
            </Button>
          </div>
        )}
      </button>

      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs text-[var(--text-subtle)]">{item.timeLabel}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="outline-none" aria-label="Screenshot menu">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/icon-more.svg" alt="" className="size-4" width={16} height={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowDelete(true)}>Request to delete</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.message("Open fullscreen coming soon")}>
              View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
