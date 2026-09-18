/**
 * Timer card — Figma App / Timesheet (17623:47835 + create 17632:25682).
 * Create project is inline in the project menu (no modal).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatElapsed } from "@/lib/dayjs";
import {
  monthDayLabelInZone,
  shiftDays,
  todayInZone,
  weekdayLabelInZone,
  weekEndYmd,
  ymdToUtc,
} from "@/lib/org-date";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import {
  codeFromProjectName,
  formatProjectTriggerTime,
  projectMenuIcon,
} from "@/lib/project-icons";
import { GENERAL_PROJECT, GENERAL_TIME_KEY, isValidProjectId } from "@/lib/project";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { useTimer } from "@/hooks/useTimer";
import { projectsApi, type ApiProject } from "@/services/api/projects.api";
import { timesheetApi } from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FigmaGlyph } from "@/components/icons/figma-glyph";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string }; status?: number } })
      .response;
    if (response?.status === 403) {
      return "You don’t have permission to create projects.";
    }
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const fieldClass =
  "h-8 w-full rounded-lg border border-[#e6e6e6] bg-white px-3 text-xs leading-4 text-[#1e2939] outline-none placeholder:text-[#99a1af] focus:border-[#cfcfcf]";

export function TimerCard() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const orgTimezone = useOrgTimezone();
  const {
    timer,
    selectedProjectId,
    isRunning,
    isPaused,
    isIdle,
    isSyncing,
    display,
    displayMs,
    start,
    stop,
    pause,
    resume,
    resetDay,
    selectProject,
    setProject,
  } = useTimer();

  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [secondsByProject, setSecondsByProject] = useState<Record<string, number>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await resetDay();
      setResetConfirmOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const loadProjects = useCallback(async () => {
    if (!organizationId) return;
    try {
      const list = await projectsApi.listMine();
      setProjects(list);
    } catch {
      setProjects([]);
    }
  }, [organizationId]);

  const loadTodayByProject = useCallback(async () => {
    if (!organizationId) return;
    try {
      const rows = await timesheetApi.listToday(orgTimezone);
      const next: Record<string, number> = {};
      for (const row of rows) {
        const key = row.projectId ?? GENERAL_TIME_KEY;
        next[key] = (next[key] ?? 0) + (row.duration ?? 0);
      }
      setSecondsByProject(next);
    } catch {
      setSecondsByProject({});
    }
  }, [organizationId, orgTimezone]);

  const todayDate = useTimerStore((s) => s.todayDate);

  const [weekDailyTotals, setWeekDailyTotals] = useState<Record<string, number>>({});
  const stripRef = useRef<HTMLDivElement | null>(null);
  const todayCardRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  // Past 21 days (3 weeks) through the end of the current week (Sunday)
  const dateRange = useMemo(() => {
    const currentTodayYmd = todayDate || todayInZone(orgTimezone);
    const start = shiftDays(currentTodayYmd, -21);
    const end = weekEndYmd(orgTimezone);
    return { start, end };
  }, [orgTimezone, todayDate]);

  const weekDays = useMemo(() => {
    const days: Array<{
      ymd: string;
      weekday: string;
      monthDay: string;
      isToday: boolean;
    }> = [];
    const currentTodayYmd = todayDate || todayInZone(orgTimezone);
    const startMs = ymdToUtc(dateRange.start).getTime();
    const endMs = ymdToUtc(dateRange.end).getTime();
    const totalDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1);

    for (let i = 0; i < totalDays; i++) {
      const ymd = shiftDays(dateRange.start, i);
      const date = ymdToUtc(ymd);
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "short",
      }).format(date);
      const monthDay = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }).format(date);
      days.push({
        ymd,
        weekday,
        monthDay,
        isToday: ymd === currentTodayYmd,
      });
    }
    return days;
  }, [dateRange, orgTimezone, todayDate]);

  const loadWeekTotals = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { start, end } = dateRange;
      const entries = await timesheetApi.listRange(start, end);
      const totals: Record<string, number> = {};
      for (const entry of entries) {
        const entryYmd = entry.date
          ? entry.date.slice(0, 10)
          : entry.startTime
            ? entry.startTime.slice(0, 10)
            : "";
        if (entryYmd) {
          totals[entryYmd] = (totals[entryYmd] ?? 0) + (entry.duration ?? 0);
        }
      }
      setWeekDailyTotals(totals);
    } catch {
      setWeekDailyTotals({});
    }
  }, [organizationId, dateRange]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startXRef.current = e.pageX - (stripRef.current?.offsetLeft ?? 0);
    scrollLeftRef.current = stripRef.current?.scrollLeft ?? 0;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !stripRef.current) return;
    e.preventDefault();
    const x = e.pageX - stripRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.2;
    stripRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setSecondsByProject({});
    void loadTodayByProject();
    void loadWeekTotals();
  }, [todayDate, loadTodayByProject, loadWeekTotals]);

  useEffect(() => {
    void loadWeekTotals();
  }, [loadWeekTotals]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!isValidProjectId(selectedProjectId)) {
      setProject(null);
      return;
    }
    if (projects.length && !projects.some((p) => p.id === selectedProjectId)) {
      setProject(null);
    }
  }, [projects, selectedProjectId, setProject]);

  useEffect(() => {
    const handler = () => {
      void loadTodayByProject();
      void loadWeekTotals();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, handler);
    return () => window.removeEventListener(TIMER_STOPPED_EVENT, handler);
  }, [loadTodayByProject, loadWeekTotals]);

  useEffect(() => {
    if (todayCardRef.current && stripRef.current) {
      const container = stripRef.current;
      const card = todayCardRef.current;
      const scrollTarget = card.offsetLeft - container.offsetWidth / 2 + card.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollTarget), behavior: "smooth" });
    }
  }, [dateRange, todayDate]);

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of projects) {
      const name = p.clientName?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const isGeneral = selectedProjectId == null;
  const selectedProject = isGeneral
    ? null
    : (projects.find((p) => p.id === selectedProjectId) ??
      (isValidProjectId(selectedProjectId)
        ? { id: selectedProjectId!, name: "Project", color: "#94a3b8" }
        : null));

  const displayName = isGeneral
    ? GENERAL_PROJECT.name
    : (selectedProject?.name ?? GENERAL_PROJECT.name);
  const triggerIcon = isGeneral
    ? projectMenuIcon(0)
    : projectMenuIcon(
        Math.max(
          0,
          projects.findIndex((p) => p.id === selectedProject?.id),
        ) + 1,
      );

  const projectSeconds = useMemo(() => {
    const bucketKey = isGeneral ? GENERAL_TIME_KEY : (selectedProject?.id ?? GENERAL_TIME_KEY);
    const saved = secondsByProject[bucketKey] ?? 0;
    const trackingSelected = isGeneral
      ? timer.projectId == null
      : selectedProject?.id === timer.projectId;
    const live =
      trackingSelected && (isRunning || isPaused) ? Math.floor(timer.elapsedMs / 1000) : 0;
    return saved + live;
  }, [
    isGeneral,
    isPaused,
    isRunning,
    secondsByProject,
    selectedProject?.id,
    timer.elapsedMs,
    timer.projectId,
  ]);

  // The day it is in the org's timezone — the day the data below covers.
  const dateLabel = weekdayLabelInZone(orgTimezone);
  const dateShort = monthDayLabelInZone(orgTimezone);
  const showProjectBadge = isRunning || isPaused || projectSeconds > 0;

  const resetCreateForm = () => {
    setCreateMode(false);
    setNewProjectName("");
    setClientName("");
    setClientPickerOpen(false);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) resetCreateForm();
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await projectsApi.create({
        name,
        code: codeFromProjectName(name),
        clientName: clientName.trim() || undefined,
      });
      setProjects((prev) => [created, ...prev]);
      await selectProject(created.id);
      resetCreateForm();
      setMenuOpen(false);
      toast.success("Project created");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not create project"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="surface-card relative w-full overflow-hidden p-3">
      <div className="flex items-center gap-2">
        <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 text-xs text-[#1e2939] outline-none"
              aria-label="Select project"
            >
              <FigmaGlyph src={triggerIcon} size={16} />
              <span className="flex items-center gap-px">
                <span className="truncate">{displayName}</span>
                <FigmaGlyph src="/figma/icon-chevron.svg" size={12} />
              </span>
              {showProjectBadge && (
                <span className="flex shrink-0 items-center rounded-md bg-[#f5f5f5] py-0 pl-px pr-1">
                  <FigmaGlyph src="/figma/icon-dot.svg" size={12} />
                  <span className="text-xs tabular-nums leading-4 text-[#1e2939]">
                    {formatProjectTriggerTime(projectSeconds)}
                  </span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="w-[250px] min-w-[250px] overflow-visible rounded-xl border border-[#e6e6e6] bg-white p-0 shadow-[0_1px_1px_rgba(0,0,0,0.03),0_4px_2px_rgba(0,0,0,0.03),0_9px_2.5px_rgba(0,0,0,0.02)]"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <div
              className={cn(
                "flex flex-col border-b border-[#ededed] px-2 pb-1 pt-2",
                createMode && "max-h-[132px] overflow-y-auto",
              )}
            >
              {(() => {
                const generalSelected = selectedProjectId == null;
                const generalSaved = secondsByProject[GENERAL_TIME_KEY] ?? 0;
                // Live time belongs to the running session's project, which
                // is not necessarily the one selected in the picker.
                const generalLive =
                  timer.projectId == null && (isRunning || isPaused)
                    ? Math.floor(timer.elapsedMs / 1000)
                    : 0;
                const generalTotal = generalSaved + generalLive;
                const generalShowDot = generalSelected && generalTotal > 0;
                return (
                  <DropdownMenuItem
                    onClick={() => {
                      void selectProject(null);
                      resetCreateForm();
                    }}
                    className={cn(
                      "min-h-8 cursor-pointer gap-2 rounded-md px-2 py-[5.5px] text-sm font-normal leading-5",
                      generalSelected
                        ? "bg-[#f5f5f5] text-[#1e2939] focus:bg-[#f5f5f5] focus:text-[#1e2939]"
                        : "text-[#4a5565] focus:bg-[#f5f5f5] focus:text-[#1e2939]",
                    )}
                  >
                    <FigmaGlyph src={projectMenuIcon(0)} size={16} />
                    <span className="min-w-0 flex-1 truncate">{GENERAL_PROJECT.name}</span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center rounded-md text-xs tabular-nums leading-4 text-[#1e2939]",
                        generalSelected && generalShowDot
                          ? "bg-white py-0 pl-px pr-1"
                          : "bg-[#f5f5f5] px-1 py-0",
                      )}
                    >
                      {generalShowDot && <FigmaGlyph src="/figma/icon-dot.svg" size={12} />}
                      {formatElapsed(generalTotal * 1000)}
                    </span>
                  </DropdownMenuItem>
                );
              })()}
              {projects.length === 0 && !createMode && (
                <p className="px-2 py-2 text-sm text-[#99a1af]">No projects yet</p>
              )}
              {projects.map((p, index) => {
                const selected = p.id === selectedProjectId;
                const saved = secondsByProject[p.id] ?? 0;
                // Live time belongs to the running session's project, which
                // is not necessarily the one selected in the picker.
                const live =
                  p.id === timer.projectId && (isRunning || isPaused)
                    ? Math.floor(timer.elapsedMs / 1000)
                    : 0;
                const total = saved + live;
                const showDot = selected && total > 0;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => {
                      void selectProject(p.id);
                      resetCreateForm();
                    }}
                    className={cn(
                      "min-h-8 cursor-pointer gap-2 rounded-md px-2 py-[5.5px] text-sm font-normal leading-5",
                      selected
                        ? "bg-[#f5f5f5] text-[#1e2939] focus:bg-[#f5f5f5] focus:text-[#1e2939]"
                        : "text-[#4a5565] focus:bg-[#f5f5f5] focus:text-[#1e2939]",
                    )}
                  >
                    <FigmaGlyph src={projectMenuIcon(index + 1)} size={16} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center rounded-md text-xs tabular-nums leading-4 text-[#1e2939]",
                        selected && showDot ? "bg-white py-0 pl-px pr-1" : "bg-[#f5f5f5] px-1 py-0",
                      )}
                    >
                      {showDot && <FigmaGlyph src="/figma/icon-dot.svg" size={12} />}
                      {formatElapsed(total * 1000)}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </div>

            {createMode ? (
              <div
                className="flex w-full flex-col gap-2 p-2"
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <p className="text-xs leading-4 text-[#99a1af]">Create project</p>

                <div className="flex w-full flex-col gap-[5px]">
                  <input
                    autoFocus
                    className={fieldClass}
                    placeholder="Project Name"
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleCreateProject();
                    }}
                  />

                  {/* Inline expand — keeps Cancel/Create below options (no overlay) */}
                  <div className="w-full overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 w-full items-center justify-between gap-2 px-3 text-left text-xs leading-4 outline-none",
                        clientName ? "text-[#1e2939]" : "text-[#99a1af]",
                      )}
                      onClick={() => setClientPickerOpen((open) => !open)}
                      aria-expanded={clientPickerOpen}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {clientName || "Select project"}
                      </span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 transition-transform duration-150",
                          clientPickerOpen && "rotate-180",
                        )}
                      >
                        <FigmaGlyph src="/figma/icon-chevron.svg" size={16} />
                      </span>
                    </button>

                    {clientPickerOpen && (
                      <div className="border-t border-[#ededed]">
                        <div className="max-h-[104px] overflow-y-auto py-1">
                          <button
                            type="button"
                            className={cn(
                              "flex w-full px-3 py-1.5 text-left text-xs hover:bg-[#f5f5f5]",
                              !clientName ? "bg-[#f5f5f5] text-[#1e2939]" : "text-[#99a1af]",
                            )}
                            onClick={() => {
                              setClientName("");
                              setClientPickerOpen(false);
                            }}
                          >
                            None
                          </button>
                          {clientOptions.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className={cn(
                                "flex w-full px-3 py-1.5 text-left text-xs text-[#1e2939] hover:bg-[#f5f5f5]",
                                clientName === name && "bg-[#f5f5f5]",
                              )}
                              onClick={() => {
                                setClientName(name);
                                setClientPickerOpen(false);
                              }}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-[#ededed] p-1.5">
                          <input
                            className="h-7 w-full rounded-md border border-[#e6e6e6] bg-white px-2 text-xs text-[#1e2939] outline-none placeholder:text-[#99a1af] focus:border-[#cfcfcf]"
                            placeholder="Or type a client name"
                            value={clientName}
                            onChange={(event) => setClientName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                setClientPickerOpen(false);
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    className="flex h-8 items-center justify-center rounded-lg border border-[#e6e6e6] bg-white px-3 text-xs font-medium leading-4 text-[#1e2939] hover:bg-[#fafafa]"
                    onClick={resetCreateForm}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex h-8 items-center justify-center rounded-lg bg-[#2b7fff] px-3 text-xs font-medium leading-4 text-white hover:bg-[#1a6aef] disabled:opacity-50"
                    disabled={creating || !newProjectName.trim()}
                    onClick={() => void handleCreateProject()}
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-2 pb-2 pt-1">
                <DropdownMenuItem
                  className="min-h-8 cursor-pointer gap-2 rounded-md px-2 py-[5.5px] text-sm font-normal leading-5 text-[#1e2939] focus:bg-[#f5f5f5] focus:text-[#1e2939]"
                  onSelect={(event) => {
                    event.preventDefault();
                    setCreateMode(true);
                  }}
                >
                  <FigmaGlyph src="/figma/icon-add.svg" size={16} />
                  <span>Add new project</span>
                </DropdownMenuItem>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex shrink-0 items-center gap-1 text-xs leading-4">
          <span>
            <span className="font-medium text-[#1e2939]">{dateLabel}</span>
            <span className="text-[#4a5565]">,</span>
          </span>
          <span className="text-[#4a5565]">{dateShort}</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4 pb-2">
        <div className="relative flex items-center justify-center">
          {(displayMs > 0 || isRunning || isPaused) && (
            <button
              type="button"
              aria-label="Reset today's time"
              title="Reset today's time to 00:00:00"
              disabled={isSyncing || isResetting}
              className="absolute -right-12 flex size-7 shrink-0 items-center justify-center rounded-full text-[#18181b] outline-none transition-colors hover:bg-[#f5f5f5] hover:text-black focus-visible:ring-2 focus-visible:ring-[#2b7fff]/35 disabled:opacity-40 dark:text-white dark:hover:bg-[#334155]"
              onClick={() => setResetConfirmOpen(true)}
            >
              <RotateCcw className="size-4" strokeWidth={2} />
            </button>
          )}
          <p className="text-[32px] font-medium tabular-nums leading-[34px] tracking-wide text-black dark:text-white">
            {display}
          </p>
        </div>
        {isIdle && displayMs > 0 && <p className="text-[11px] text-[#99a1af]">Today</p>}

        {isIdle && (
          <Button
            className="h-9 gap-1.5 rounded-lg bg-[#2b7fff] px-5 text-sm font-medium leading-5 text-white shadow-none hover:bg-[#1a6aef]"
            disabled={isSyncing}
            onClick={() => void start(selectedProjectId)}
          >
            <FigmaGlyph src="/figma/icon-play.svg" size={16} />
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
              className="h-9 gap-1.5 rounded-lg bg-[#f4323c] px-5 text-sm font-medium text-white hover:bg-[#e12d36]"
              disabled={isSyncing}
              onClick={() => void stop()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/icon-play.svg"
                alt=""
                className="size-3.5 brightness-0 invert"
                width={14}
                height={14}
              />
              Stop
            </Button>
          </div>
        )}

        {isPaused && (
          <div className="flex gap-2">
            <Button
              className="h-9 gap-1 rounded-lg bg-[#2b7fff] px-5 text-sm font-medium text-white hover:bg-[#1a6aef]"
              disabled={isSyncing}
              onClick={() => void resume()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/icon-play.svg"
                alt=""
                className="size-4 brightness-0 invert"
                width={16}
                height={16}
              />
              Resume
            </Button>
            <Button
              className="h-9 gap-1.5 rounded-lg bg-[#f4323c] px-5 text-sm font-medium text-white hover:bg-[#e12d36]"
              disabled={isSyncing}
              onClick={() => void stop()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/icon-play.svg"
                alt=""
                className="size-3.5 brightness-0 invert"
                width={14}
                height={14}
              />
              Stop
            </Button>
          </div>
        )}
      </div>

      {/* Week days strip */}
      <div
        ref={stripRef}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className="scrollbar-hide -mx-1 mt-3 flex cursor-grab select-none items-center gap-2 overflow-x-auto px-1 pb-1 pt-0.5 active:cursor-grabbing"
      >
        {weekDays.map((day) => {
          const live =
            day.isToday && (isRunning || isPaused) ? Math.floor(timer.elapsedMs / 1000) : 0;
          const daySeconds = (weekDailyTotals[day.ymd] ?? 0) + live;
          return (
            <div
              key={day.ymd}
              ref={day.isToday ? todayCardRef : undefined}
              className={cn(
                "flex min-w-[102px] shrink-0 flex-col items-start gap-1.5 rounded-2xl border bg-white px-3 py-2 transition-colors dark:bg-[#1e293b]",
                day.isToday
                  ? "border-[#ededed] shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-[#334155]"
                  : "border-[#ededed] dark:border-[#334155]",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs leading-4">
                <span className="font-semibold text-[#1e2939] dark:text-[#f1f5f9]">
                  {day.weekday}
                </span>
                <span className="font-normal text-[#6a7282] dark:text-[#94a3b8]">
                  {day.monthDay}
                </span>
              </div>
              <div className="rounded-md bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium tabular-nums text-[#1e2939] dark:bg-[#334155] dark:text-[#f1f5f9]">
                {formatElapsed(daySeconds * 1000)}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-[340px] rounded-2xl p-5">
          <DialogHeader className="gap-1.5 text-left">
            <DialogTitle className="text-base font-semibold text-[#1e2939] dark:text-[#f1f5f9]">
              Reset today&apos;s time?
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-[#6a7282] dark:text-[#94a3b8]">
              This will discard any active timer and reset all tracked time for today to 00:00:00.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-3 flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs"
              disabled={isResetting}
              onClick={() => setResetConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-lg bg-[#f4323c] px-3 text-xs font-medium text-white hover:bg-[#e12d36]"
              disabled={isResetting}
              onClick={() => void handleConfirmReset()}
            >
              {isResetting ? "Resetting…" : "Reset Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
