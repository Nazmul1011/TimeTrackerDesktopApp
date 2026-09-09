/**
 * Application providers — Query, Theme, Toast, Tooltip, Dialog.
 */
"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { AuthBootstrap } from "./auth-bootstrap";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./toast-provider";
import { TooltipProvider } from "./tooltip-provider";
import { DialogProvider } from "./dialog-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthBootstrap>
        <ThemeProvider>
          <TooltipProvider>
            <DialogProvider>
              <ToastProvider>{children}</ToastProvider>
            </DialogProvider>
          </TooltipProvider>
        </ThemeProvider>
      </AuthBootstrap>
    </QueryProvider>
  );
}
