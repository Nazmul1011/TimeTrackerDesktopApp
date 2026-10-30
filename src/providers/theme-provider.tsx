"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { useSettingsStore } from "@/store/settings.store";
import { SettingsBootstrap } from "./settings-bootstrap";

/** Applies the saved Light / Dark / System preference to the page. */
function ThemeSync() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <SettingsBootstrap />
      <ThemeSync />
      {children}
    </NextThemesProvider>
  );
}
