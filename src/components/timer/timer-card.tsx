/**
 * Timer card — Figma App / Timesheet (17623:47835 + create 17632:25682).
 * Create project is inline in the project menu (no modal).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dayjs } from "@/lib/dayjs";
import {
  codeFromProjectName,
  formatProjectHhMm,
  formatProjectTriggerTime,
  projectMenuIcon,
} from "@/lib/project-icons";
import {
  GENERAL_PROJECT,
  GENERAL_TIME_KEY,
  isValidProjectId,
} from "@/lib/project";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { useTimer } from "@/hooks/useTimer";
import { projectsApi, type ApiProject } from "@/services/api/projects.api";
import { timesheetApi } from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FigmaGlyph } from "@/components/icons/figma-glyph";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [secondsByProject, setSecondsByProject] = useState<Record<string, number>>(
    {},
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
      const rows = await timesheetApi.listToday();
      const next: Record<string, number> = {};
      for (const row of rows) {
        const key = row.projectId ?? GENERAL_TIME_KEY;
        next[key] = (next[key] ?? 0) + (row.duration ?? 0);
      }
      setSecondsByProject(next);
    } catch {
      setSecondsByProject({});
    }
  }, [organizationId]);

  useEffect(() => {
    void loadProjects();
    void loadTodayByProject();
  }, [loadProjects, loadTodayByProject]);

  useEffect(() => {
    if (!timer.projectId) return;
    if (!isValidProjectId(timer.projectId)) {
      setProject(null);
      return;
    }
    if (projects.length && !projects.some((p) => p.id === timer.projectId)) {
      setProject(null);
    }
  }, [projects, setProject, timer.projectId]);

  useEffect(() => {
    const handler = () => {
      void loadTodayByProject();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, handler);
    return () => window.removeEventListener(TIMER_STOPPED_EVENT, handler);
  }, [loadTodayByProject]);

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of projects) {
      const name = p.clientName?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const isGeneral = timer.projectId == null;
  const selectedProject = isGeneral
    ? null
    : (projects.find((p) => p.id === timer.projectId) ??
      (isValidProjectId(timer.projectId)
        ? { id: timer.projectId!, name: "Project", color: "#94a3b8" }
        : null));

  const displayName = isGeneral
    ? GENERAL_PROJECT.name
    : (selectedProject?.name ?? GENERAL_PROJECT.name);
  const triggerIcon = isGeneral
    ? projectMenuIcon(0)
    : projectMenuIcon(
        Math.max(0, projects.findIndex((p) => p.id === selectedProject?.id)) + 1,
      );

  const projectSeconds = useMemo(() => {
    const bucketKey = isGeneral
      ? GENERAL_TIME_KEY
      : (selectedProject?.id ?? GENERAL_TIME_KEY);
    const saved = secondsByProject[bucketKey] ?? 0;
    const trackingSelected =
      isGeneral ? timer.projectId == null : selectedProject?.id === timer.projectId;
    const live =
      trackingSelected && (isRunning || isPaused)
        ? Math.floor(timer.elapsedMs / 1000)
        : 0;
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

  const dateLabel = dayjs().format("dddd");
  const dateShort = dayjs().format("MMM D");
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
      setProject(created.id);
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
                const generalSelected = timer.projectId == null;
                const generalSaved = secondsByProject[GENERAL_TIME_KEY] ?? 0;
                const generalLive =
                  generalSelected && (isRunning || isPaused)
                    ? Math.floor(timer.elapsedMs / 1000)
                    : 0;
                const generalTotal = generalSaved + generalLive;
                const generalShowDot = generalSelected && generalTotal > 0;
                return (
                  <DropdownMenuItem
                    onClick={() => {
                      setProject(null);
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
                      {generalShowDot && (
                        <FigmaGlyph src="/figma/icon-dot.svg" size={12} />
                      )}
                      {formatProjectHhMm(generalTotal)}
                    </span>
                  </DropdownMenuItem>
                );
              })()}
              {projects.length === 0 && !createMode && (
                <p className="px-2 py-2 text-sm text-[#99a1af]">No projects yet</p>
              )}
              {projects.map((p, index) => {
                const selected = p.id === timer.projectId;
                const saved = secondsByProject[p.id] ?? 0;
                const live =
                  selected && (isRunning || isPaused)
                    ? Math.floor(timer.elapsedMs / 1000)
                    : 0;
                const total = saved + live;
                const showDot = selected && total > 0;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => {
                      setProject(p.id);
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
                        selected && showDot
                          ? "bg-white py-0 pl-px pr-1"
                          : "bg-[#f5f5f5] px-1 py-0",
                      )}
                    >
                      {showDot && <FigmaGlyph src="/figma/icon-dot.svg" size={12} />}
                      {formatProjectHhMm(total)}
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
        <p className="text-[32px] font-medium leading-[34px] tracking-wide text-black tabular-nums">
          {display}
        </p>
        {isIdle && todayLoggedMs > 0 && (
          <p className="text-[11px] text-[#99a1af]">Today&apos;s total</p>
        )}

        {isIdle && (
          <Button
            className="h-9 gap-1 rounded-lg bg-[#2b7fff] px-5 text-sm font-medium text-white hover:bg-[#1a6aef]"
            disabled={isSyncing}
            onClick={() => void start(timer.projectId)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/icon-play.svg"
              alt=""
              className="size-4 brightness-0 invert"
              width={16}
              height={16}
            />
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
              className="h-9 gap-1 rounded-lg bg-[#f4323c] px-5 text-sm font-medium text-white hover:bg-[#e12d36]"
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
              className="h-9 rounded-lg bg-[#f4323c] px-5 text-sm font-medium text-white hover:bg-[#e12d36]"
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
