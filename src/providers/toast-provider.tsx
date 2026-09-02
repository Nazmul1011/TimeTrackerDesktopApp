"use client";

import { Toaster } from "sonner";
import type { ReactNode } from "react";

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster richColors position="top-right" closeButton theme="light" />
    </>
  );
}
