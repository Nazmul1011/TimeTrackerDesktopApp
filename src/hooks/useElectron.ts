/**
 * Electron environment hook — scaffolding.
 */
"use client";

import { useMemo } from "react";
import { getElectronAPI, isElectron } from "@/services/electron";

export function useElectron() {
  const api = useMemo(() => getElectronAPI(), []);
  return {
    isElectron: isElectron(),
    api,
  };
}
