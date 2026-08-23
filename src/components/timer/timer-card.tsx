/**
 * Timer card — Figma layout with backend-synced Start / Pause / Stop.
 */
"use client";

import { useEffect, useState } from "react";
import { dayjs } from "@/lib/dayjs";
import { useTimer } from "@/hooks/useTimer";
import { projectsApi, type ApiProject } from "@/services/api/projects.api";
import { useAuthStore } from "@/store/auth.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NO_PROJECT: ApiProject = {
  id: "",
  name: "No project",
  color: "#94a3b8",
};

export function TimerCard() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const {
    timer,
    display,
    todayLoggedMs,
    isRunning,
    isPaused,
    isIdle,
    isSyncing,
    start,
    stop,
    pause,
    resume,
    setProject,
  } = useTimer();

  const [projects, setProjects] = useState<ApiProject[]>([NO_PROJECT]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void projectsApi
      .listMine()
      .then((list) => {
        if (cancelled) return;
        setProjects([NO_PROJECT, ...list]);
      })
      .catch(() => {
        if (!cancelled) setProjects([NO_PROJECT]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const project =
    projects.find((p) => p.id === (timer.projectId ?? "")) ??
    (timer.projectId
      ? { id: timer.projectId, name: "Project", color: "#94a3b8" }
      : NO_PROJECT);

  const dateLabel = dayjs().format("dddd");
  const dateShort = dayjs().format("MMM D");

  const sessionBadge = display;

  return (
    <section className="surface-card relative w-full overflow-hidden p-3">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-[#1e2939] outline-none"
              disabled={isRunning || isPaused}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/icon-project.svg" alt="" className="size-4" width={16} height={16} />
              <span>{project.name}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/icon-chevron.svg" alt="" className="size-3 opacity-60" width={12} height={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id || "none"}
                onClick={() => setProject(p.id || null)}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {(isRunning || isPaused || todayLoggedMs > 0 || timer.elapsedMs > 0) && (
          <div className="flex items-center gap-0.5 rounded-md bg-[var(--surface-elevated)] py-0 pl-0.5 pr-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/figma/icon-dot.svg" alt="" className="size-3" width={12} height={12} />
            <span className="text-xs tabular-nums text-[#1e2939]">{sessionBadge}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="font-medium text-[#1e2939]">{dateLabel},</span>
          <span className="text-[var(--text-subtle)]">{dateShort}</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4 pb-2">
        <p className="text-[32px] font-medium leading-[34px] tracking-wide text-black tabular-nums">
          {display}
        </p>
        {isIdle && todayLoggedMs > 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">Today&apos;s total</p>
        )}

        {isIdle && (
          <Button
            className="h-9 gap-1 rounded-lg bg-[var(--brand)] px-5 text-sm font-medium text-white hover:bg-[#1a6aef]"
            disabled={isSyncing}
            onClick={() => void start(timer.projectId)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/figma/icon-play.svg" alt="" className="size-4 brightness-0 invert" width={16} height={16} />
            {isSyncing ? "Starting…" : "Start"}
          </Button>
        )}

        {isRunning && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-lg px-4"
              disabled={isSyncing}
              onClick={() => void pause()}
            >
              Pause
            </Button>
            <Button
              className="h-9 rounded-lg bg-red-500 px-4 text-white hover:bg-red-600"
              disabled={isSyncing}
              onClick={() => void stop()}
            >
              Stop
            </Button>
          </div>
        )}

        {isPaused && (
          <div className="flex gap-2">
            <Button
              className={cn(
                "h-9 gap-1 rounded-lg bg-[var(--brand)] px-5 text-sm font-medium text-white hover:bg-[#1a6aef]",
              )}
              disabled={isSyncing}
              onClick={() => void resume()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/icon-play.svg" alt="" className="size-4 brightness-0 invert" width={16} height={16} />
              Resume
            </Button>
            <Button
              className="h-9 rounded-lg bg-red-500 px-4 text-white hover:bg-red-600"
              disabled={isSyncing}
              onClick={() => void stop()}
            >
              Stop
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
