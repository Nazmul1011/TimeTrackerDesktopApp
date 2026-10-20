/**
 * Last screenshot failure reported by the Electron main process.
 * Lives outside the Screenshots tab so a failure is not lost while another tab is open.
 */
import { create } from "zustand";

export type ScreenshotFailureKind = "permission" | "upload";

interface ScreenshotStatusState {
  failure: { kind: ScreenshotFailureKind; message: string } | null;
  setFailure: (message: string) => void;
  clearFailure: () => void;
}

export const useScreenshotStatusStore = create<ScreenshotStatusState>((set) => ({
  failure: null,

  setFailure: (message) =>
    set({
      failure: {
        kind: /screen recording/i.test(message) ? "permission" : "upload",
        message,
      },
    }),

  clearFailure: () => set({ failure: null }),
}));
