/**
 * Application providers — Query, Theme, Toast, Tooltip, Dialog.
 */
"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./toast-provider";
import { TooltipProvider } from "./tooltip-provider";
import { DialogProvider } from "./dialog-provider";
import { TrackingAgentProvider } from "./tracking-agent-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <TooltipProvider>
          <DialogProvider>
            <ToastProvider>
              <TrackingAgentProvider>{children}</TrackingAgentProvider>
            </ToastProvider>
          </DialogProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
