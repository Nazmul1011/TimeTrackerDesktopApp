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
import { AuthBootstrap } from "./auth-bootstrap";
import { UpdateDialog } from "@/components/update-dialog";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <TooltipProvider>
          <DialogProvider>
            <ToastProvider>
              <AuthBootstrap />
              <TrackingAgentProvider>
                {children}
                <UpdateDialog />
              </TrackingAgentProvider>
            </ToastProvider>
          </DialogProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
