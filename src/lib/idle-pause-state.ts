/**
 * Remembers whether the current pause came from idle (auto-resume on input)
 * rather than from the user (needs Resume).
 *
 * Server syncs can flip the window's timer status for a moment. This flag
 * survives those flips, so the window can turn the main-process watcher back
 * on when the timer is shown as paused again. Only user actions, a finished
 * auto-resume, or a timer that has kept running for a while clear it.
 */
let idlePaused = false;

export function markIdlePaused(): void {
  idlePaused = true;
}

export function clearIdlePaused(): void {
  idlePaused = false;
}

export function isIdlePaused(): boolean {
  return idlePaused;
}
