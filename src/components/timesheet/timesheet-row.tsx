/**
 * Timesheet row — Figma list item.
 */
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TimesheetRowProps {
  title: string;
  projectLabel: string;
  duration: string;
  isActive?: boolean;
  unlinked?: boolean;
  onPlay?: () => void;
}

export function TimesheetRow({
  title,
  projectLabel,
  duration,
  isActive,
  unlinked,
  onPlay,
}: TimesheetRowProps) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-3 pl-3 pr-2 last:border-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <p className="truncate text-sm text-[#1e2939]">{title}</p>
          {isActive && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/figma/icon-dot.svg" alt="" className="size-3 shrink-0" width={12} height={12} />
          )}
        </div>

        <div
          className={cn(
            "flex max-w-[120px] shrink-0 items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-2 py-1",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={unlinked ? "/figma/icon-warning.svg" : "/figma/icon-project.svg"}
            alt=""
            className="size-4 shrink-0"
            width={16}
            height={16}
          />
          <span className="truncate text-xs text-[var(--text-subtle)]">{projectLabel}</span>
        </div>
      </div>

      <span className="w-[50px] shrink-0 px-2 text-xs tabular-nums text-[#1e2939]">{duration}</span>

      <Button
        size="icon"
        variant="outline"
        className="size-6 shrink-0 rounded-full border-[var(--border-subtle)] p-0"
        onClick={onPlay}
        aria-label={`Play ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/icon-play.svg" alt="" className="size-3" width={12} height={12} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="size-4 shrink-0 outline-none" aria-label="Row menu">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/figma/icon-more.svg" alt="" className="size-4" width={16} height={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => toast.message("Edit coming soon")}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.message("Delete coming soon")}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
