/**
 * Timesheet row — Figma list item (17623:47865 / 17623:48056 / 17623:48009).
 */
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FigmaGlyph } from "@/components/icons/figma-glyph";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TimesheetRowProps {
  title: string;
  projectLabel: string;
  duration: string;
  isActive?: boolean;
  unlinked?: boolean;
  showMenu?: boolean;
  compact?: boolean;
  onPlay?: () => void;
}

export function TimesheetRow({
  title,
  projectLabel,
  duration,
  isActive,
  unlinked,
  showMenu = true,
  compact,
  onPlay,
}: TimesheetRowProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 border-b border-[#ededed] pl-3 pr-2 last:border-b-0",
        compact ? "py-2" : "py-3",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <p className="truncate text-sm leading-5 text-[#1e2939]">{title}</p>
          {isActive && <FigmaGlyph src="/figma/icon-dot.svg" size={12} />}
        </div>

        <div
          className={cn(
            "flex max-w-[120px] min-w-0 shrink-0 items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-2 py-1",
            unlinked && "flex-1",
          )}
        >
          <FigmaGlyph
            src={unlinked ? "/figma/icon-warning.svg" : "/figma/icon-project.svg"}
            size={16}
          />
          <span className="truncate text-xs leading-4 text-[#4a5565]">
            {unlinked ? "Unlinked" : projectLabel}
          </span>
        </div>
      </div>

      <span className="w-[50px] shrink-0 px-2 py-1 text-right text-xs tabular-nums leading-4 text-[#1e2939]">
        {duration}
      </span>

      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#ededed] bg-white p-1.5 outline-none transition-colors hover:bg-[#f5f5f5]"
        onClick={onPlay}
        aria-label={`Play ${title}`}
      >
        <FigmaGlyph src="/figma/icon-play-blue.svg" size={12} />
      </button>

      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="size-4 shrink-0 outline-none"
              aria-label="Row menu"
            >
              <FigmaGlyph src="/figma/icon-more.svg" size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => toast.message("Edit coming soon")}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.message("Delete coming soon")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
    </div>
  );
}
