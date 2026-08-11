"use client";

import type { ReactNode } from "react";

/**
 * Dialog provider placeholder.
 * Radix Dialog is controlled per-instance; this wrapper reserves a mount point
 * for future global dialog/modal orchestration.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
