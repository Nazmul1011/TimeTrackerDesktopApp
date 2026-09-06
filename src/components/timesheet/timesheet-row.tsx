/**
 * Timesheet row — inline edit in menu (like create project), delete modal.
 */
"use client";

import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { FigmaGlyph } from "@/components/icons/figma-glyph";
import { GENERAL_PROJECT } from "@/lib/project";
import { projectMenuIcon } from "@/lib/project-icons";
import { cn } from "@/lib/utils";
import { projectsApi, type ApiProject } from "@/services/api/projects.api";
import type { ApiTimeEntry } from "@/services/api/timesheet.api";

const fieldClass =
  "h-8 w-full rounded-lg border border-[#e6e6e6] bg-white px-3 text-xs leading-4 text-[#1e2939] outline-none placeholder:text-[#99a1af] focus:border-[#cfcfcf]";

const menuPanelClass =
  "w-[250px] min-w-[250px] max-h-[min(320px,calc(100vh-100px))] overflow-y-auto rounded-xl border border-[#e6e6e6] bg-white p-0 shadow-[0_1px_1px_rgba(0,0,0,0.03),0_4px_2px_rgba(0,0,0,0.03),0_9px_2.5px_rgba(0,0,0,0.02)]";

interface TimesheetRowProps {
  entry: ApiTimeEntry;
  title: string;
  projectLabel: string;
  duration: string;
  isActive?: boolean;
  /** running = pause icon. paused/idle = play icon. */
  playState?: "running" | "paused";
  playEnabled?: boolean;
  unlinked?: boolean;
  showMenu?: boolean;
  compact?: boolean;
  onPlay?: () => void;
  onSave: (payload: { description: string; projectId: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function TimesheetRow({
  entry,
  title,
  projectLabel,
  duration,
  isActive,
  playState = "paused",
  playEnabled = false,
  unlinked,
  showMenu = true,
  compact,
  onPlay,
  onSave,
  onDelete,
}: TimesheetRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const resetEdit = () => {
    setEditMode(false);
    setProjectPickerOpen(false);
    setDescription(entry.description?.trim() ?? "");
    setProjectId(entry.projectId ?? null);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      resetEdit();
      return;
    }
    setDescription(entry.description?.trim() ?? "");
    setProjectId(entry.projectId ?? null);
  };

  useEffect(() => {
    if (!menuOpen || !editMode) return;
    void projectsApi
      .listMine()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [editMode, menuOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        description: description.trim(),
        projectId,
      });
      setMenuOpen(false);
      resetEdit();
    } catch {
      // Parent shows error toast
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch {
      // Parent shows error toast
    } finally {
      setDeleting(false);
    }
  };

  const selectedProjectName =
    projectId == null
      ? GENERAL_PROJECT.name
      : (projects.find((p) => p.id === projectId)?.name ?? projectLabel);

  return (
    <>
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
              "flex min-w-0 max-w-[120px] shrink-0 items-center gap-1 rounded-lg border border-[#e6e6e6] bg-white px-2 py-1",
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

        <span className="w-[64px] shrink-0 px-1 py-1 text-right text-xs tabular-nums leading-4 text-[#1e2939]">
          {duration}
        </span>

        <button
          type="button"
          disabled={!playEnabled}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border border-[#ededed] bg-white p-1.5 outline-none",
            playEnabled ? "transition-colors hover:bg-[#f5f5f5]" : "cursor-not-allowed opacity-40",
          )}
          onClick={playEnabled ? onPlay : undefined}
          aria-label={
            !playEnabled
              ? "Only the latest entry can be controlled"
              : playState === "running"
                ? `Pause ${title}`
                : `Play ${title}`
          }
        >
          <FigmaGlyph
            src={
              playState === "running" ? "/figma/icon-pause-blue.svg" : "/figma/icon-play-blue.svg"
            }
            size={12}
          />
        </button>

        {showMenu ? (
          <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="size-4 shrink-0 outline-none" aria-label="Row menu">
                <FigmaGlyph src="/figma/icon-more.svg" size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={4}
              className={menuPanelClass}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {editMode ? (
                <div
                  className="flex w-full flex-col gap-2 p-2"
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <p className="text-xs leading-4 text-[#99a1af]">Edit entry</p>

                  <div className="flex w-full flex-col gap-[5px]">
                    <input
                      autoFocus
                      className={fieldClass}
                      placeholder="Description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleSave();
                      }}
                    />

                    <div className="w-full overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
                      <button
                        type="button"
                        className={cn(
                          "flex h-8 w-full items-center justify-between gap-2 px-3 text-left text-xs leading-4 outline-none",
                          selectedProjectName ? "text-[#1e2939]" : "text-[#99a1af]",
                        )}
                        onClick={() => setProjectPickerOpen((open) => !open)}
                        aria-expanded={projectPickerOpen}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {selectedProjectName || "Select project"}
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 transition-transform duration-150",
                            projectPickerOpen && "rotate-180",
                          )}
                        >
                          <FigmaGlyph src="/figma/icon-chevron.svg" size={16} />
                        </span>
                      </button>

                      {projectPickerOpen && (
                        <div className="border-t border-[#ededed]">
                          <div className="max-h-[120px] overflow-y-auto py-1">
                            <button
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#f5f5f5]",
                                projectId == null
                                  ? "bg-[#f5f5f5] text-[#1e2939]"
                                  : "text-[#4a5565]",
                              )}
                              onClick={() => {
                                setProjectId(null);
                                setProjectPickerOpen(false);
                              }}
                            >
                              <FigmaGlyph src={projectMenuIcon(0)} size={16} />
                              {GENERAL_PROJECT.name}
                            </button>
                            {projects.map((project, index) => (
                              <button
                                key={project.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#f5f5f5]",
                                  projectId === project.id
                                    ? "bg-[#f5f5f5] text-[#1e2939]"
                                    : "text-[#4a5565]",
                                )}
                                onClick={() => {
                                  setProjectId(project.id);
                                  setProjectPickerOpen(false);
                                }}
                              >
                                <FigmaGlyph src={projectMenuIcon(index + 1)} size={16} />
                                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      className="flex h-8 items-center justify-center rounded-lg border border-[#e6e6e6] bg-white px-3 text-xs font-medium leading-4 text-[#1e2939] hover:bg-[#fafafa]"
                      onClick={resetEdit}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="flex h-8 items-center justify-center rounded-lg bg-[#2b7fff] px-3 text-xs font-medium leading-4 text-white hover:bg-[#1a6aef] disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void handleSave()}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <DropdownMenuItem
                    className="cursor-pointer rounded-md px-3 py-2 text-sm"
                    onSelect={(event) => {
                      event.preventDefault();
                      setEditMode(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer rounded-md px-3 py-2 text-sm text-red-600 focus:text-red-600"
                    onSelect={(event) => {
                      event.preventDefault();
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[320px] gap-3 p-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm">Delete time entry?</DialogTitle>
            <DialogDescription className="text-xs">
              This removes &ldquo;{title}&rdquo; ({duration}) from today&apos;s timesheet. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#f4323c] hover:bg-[#e12d36]"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
