/**
 * Which day the home strip is showing. Null means today.
 * Set from the day cards under the timer.
 */
import { create } from "zustand";

type SelectedDayState = {
  ymd: string | null;
  /** Bumps when the same day is chosen again, so the strip can jump back to the time. */
  focus: number;
  selectDay: (ymd: string) => void;
};

export const useSelectedDayStore = create<SelectedDayState>((set) => ({
  ymd: null,
  focus: 0,
  selectDay: (ymd) =>
    set((state) => ({
      ymd,
      focus: state.ymd === ymd ? state.focus + 1 : state.focus,
    })),
}));
