/**
 * Home page — Figma desktop widget layout.
 * Header + Timer + Tabs (Summary / Timesheet / Screenshots).
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TimerCard } from "@/components/timer/timer-card";
import { SummaryTab } from "@/components/summary/summary-tab";
import { TimesheetTab } from "@/components/timesheet/timesheet-tab";
import { ScreenshotGrid } from "@/components/screenshots/screenshot-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROUTES } from "@/constants/routes";
import { HOME_TAB_EVENT } from "@/lib/notification-nav";
import { timerApi } from "@/services/api/timer.api";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

type HomeTab = "summary" | "timesheet" | "screenshots";

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);
  const [activeTab, setActiveTab] = useState<HomeTab>("summary");

  useEffect(() => {
    const handler = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: HomeTab }>).detail?.tab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener(HOME_TAB_EVENT, handler);
    return () => window.removeEventListener(HOME_TAB_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace(ROUTES.LOGIN);
    }
  }, [hasHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !organizationId) return;

    let cancelled = false;

    async function loadTimer() {
      try {
        const current = await timerApi.current();
        if (!cancelled) hydrateFromApi(current);
      } catch {
        // Keep whatever timer state we already have (do not drop a running session)
      }
    }

    void loadTimer();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hydrateFromApi, isAuthenticated, organizationId]);

  return (
    <div className="app-shell">
      <Header />
      <TimerCard />

      <section className="surface-card flex min-h-[250px] flex-col gap-3 p-3">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as HomeTab)}
          className="w-full"
        >
          <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg bg-[#f5f5f5] p-1">
            <TabsTrigger
              value="summary"
              className="h-8 rounded-full text-sm font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-[#4a5565] data-[state=active]:shadow-none data-[state=inactive]:hover:bg-white/70"
            >
              Summary
            </TabsTrigger>
            <TabsTrigger
              value="timesheet"
              className="h-8 rounded-full text-sm font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-[#4a5565] data-[state=active]:shadow-none data-[state=inactive]:hover:bg-white/70"
            >
              Timesheet
            </TabsTrigger>
            <TabsTrigger
              value="screenshots"
              className="h-8 rounded-full text-sm font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-[#4a5565] data-[state=active]:shadow-none data-[state=inactive]:hover:bg-white/70"
            >
              Screenshots
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-3">
            <SummaryTab />
          </TabsContent>
          <TabsContent value="timesheet" className="mt-3">
            <TimesheetTab />
          </TabsContent>
          <TabsContent value="screenshots" className="mt-3">
            <ScreenshotGrid />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
