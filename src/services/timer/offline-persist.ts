/**
 * Persist / restore the live timer snapshot in Electron main.
 */
import { getElectronAPI } from "@/services/electron";
import { useTimerStore } from "@/store/timer.store";

export function persistLocalTimer() {
  const api = getElectronAPI();
  if (!api?.sync?.saveLocalTimer) return;
  const state = useTimerStore.getState();
  const id = state.timer.id;
  void api.sync.saveLocalTimer({
    status: state.timer.status,
    localId: id,
    serverId: id && !id.startsWith("local-") ? id : null,
    projectId: state.timer.projectId,
    description: state.timer.description,
    startedAt: state.timer.startedAt,
    elapsedMs: state.timer.elapsedMs,
    baseElapsedMs: state.baseElapsedMs,
    segmentStartedAt: state.segmentStartedAt,
    isOffline: state.isOfflineSession,
    todayLoggedMs: state.todayLoggedMs,
    todayDate: state.todayDate,
  });
}

export async function enqueueTimerEvent(payload: {
  type: "start" | "pause" | "resume" | "stop";
  occurredAt: string;
  projectId?: string | null;
  description?: string | null;
}) {
  const api = getElectronAPI();
  if (!api?.sync?.enqueueTimerEvent) return;
  await api.sync.enqueueTimerEvent(payload);
  persistLocalTimer();
}
