/**
 * Demo / mock domain data for the desktop client UI.
 * Replace with API + IPC-backed data as features land.
 */

export const WORKSPACES = [
  { id: "ws-1", name: "Gr8r Studio", organizationId: "org-1", logoUrl: "/figma/workspace-avatar.svg" },
  { id: "ws-2", name: "Acme Corp", organizationId: "org-2", logoUrl: "/figma/workspace-avatar.svg" },
] as const;

export const PROJECTS = [
  { id: "p-general", name: "General", color: "#2B7FFF" },
  { id: "p-nexus", name: "Nexus Brand Refresh", color: "#6366F1" },
  { id: "p-unlinked", name: "Unlinked", color: "#F59E0B", unlinked: true },
] as const;

export type TimesheetEntry = {
  id: string;
  title: string;
  projectId: string;
  projectLabel: string;
  durationMs: number;
  isActive?: boolean;
  unlinked?: boolean;
};

export const INITIAL_TIMESHEET: TimesheetEntry[] = [
  {
    id: "ts-1",
    title: "General",
    projectId: "p-general",
    projectLabel: "General",
    durationMs: (3 * 3600 + 43 * 60 + 55) * 1000,
    isActive: true,
  },
  {
    id: "ts-2",
    title: "Gr8r time tracker",
    projectId: "p-nexus",
    projectLabel: "Nexus Brand Refresh",
    durationMs: (2 * 3600 + 10 * 60) * 1000,
  },
  {
    id: "ts-3",
    title: "Pet translator",
    projectId: "p-unlinked",
    projectLabel: "Unlinked",
    durationMs: 44 * 60 * 1000,
    unlinked: true,
  },
];

export const SUMMARY = {
  monthHours: 84,
  monthGoal: 160,
  monthExpected: 85,
  weekHours: 30,
  weekGoal: 40,
  weekExpected: 32,
};

export const TOP_APPS = [
  { id: "figma", name: "Figma", percent: 60, icon: "/figma/icon-figma.svg" },
  { id: "chrome", name: "Chrome", percent: 20, icon: "/figma/icon-chrome.svg" },
  { id: "code", name: "VS Code", percent: 10, icon: "/figma/icon-project.svg" },
  { id: "whatsapp", name: "WhatsApp", percent: 5, icon: "/figma/icon-bell.svg" },
  { id: "youtube", name: "YouTube", percent: 3, icon: "/figma/icon-play.svg" },
  { id: "discord", name: "Discord", percent: 2, icon: "/figma/icon-dot.svg" },
];

export type ScreenshotItem = {
  id: string;
  timeLabel: string;
  capturedAt: string;
  /** CSS gradient placeholder until real captures exist */
  gradient: string;
  deleteRequested?: boolean;
};

export const INITIAL_SCREENSHOTS: ScreenshotItem[] = [
  {
    id: "ss-1",
    timeLabel: "09:20 AM",
    capturedAt: new Date().toISOString(),
    gradient: "linear-gradient(135deg, #dbeafe 0%, #93c5fd 50%, #3b82f6 100%)",
  },
  {
    id: "ss-2",
    timeLabel: "09:30 AM",
    capturedAt: new Date().toISOString(),
    gradient: "linear-gradient(135deg, #fce7f3 0%, #f9a8d4 50%, #ec4899 100%)",
  },
  {
    id: "ss-3",
    timeLabel: "09:40 AM",
    capturedAt: new Date().toISOString(),
    gradient: "linear-gradient(135deg, #dcfce7 0%, #86efac 50%, #22c55e 100%)",
  },
  {
    id: "ss-4",
    timeLabel: "09:50 AM",
    capturedAt: new Date().toISOString(),
    gradient: "linear-gradient(135deg, #fef3c7 0%, #fcd34d 50%, #f59e0b 100%)",
  },
];
