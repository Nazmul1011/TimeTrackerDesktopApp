"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";

export function ToastProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <>
      {children}
      <Toaster
        richColors
        position="top-right"
        closeButton
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
    </>
  );
}
