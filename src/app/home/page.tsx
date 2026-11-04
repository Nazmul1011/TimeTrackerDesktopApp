/**
 * Home page — Figma desktop widget layout.
 * Header + Timer + Tabs (Summary / Timesheet / Day / Screenshots).
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TimerCard } from "@/components/timer/timer-card";
import { SummaryTab } from "@/components/summary/summary-tab";
import { TimesheetTab } from "@/components/timesheet/timesheet-tab";
import { ScreenshotGrid } from "@/components/screenshots/screenshot-grid";
import { DayTimeline } from "@/components/timeline/day-timeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROUTES } from "@/constants/routes";
import { HOME_TAB_EVENT } from "@/lib/notification-nav";
import { authApi } from "@/services/api/auth.api";
import { orgApi } from "@/services/api/org.api";
import { timerApi } from "@/services/api/timer.api";
import { connectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";
import { mapApiUserToUser } from "@/types";

type HomeTab = "summary" | "timesheet" | "timeline" | "screenshots";

const tabTriggerClass =
  "h-8 rounded-full px-1 text-[11px] font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-[#4a5565] data-[state=active]:shadow-none data-[state=inactive]:hover:bg-white/70 dark:hover:text-[#f1f5f9] dark:data-[state=active]:border-[#475569] dark:data-[state=active]:bg-[#334155] dark:data-[state=active]:text-[#f1f5f9] dark:data-[state=inactive]:text-[#94a3b8] dark:data-[state=inactive]:hover:bg-[#334155]/60";

export default function HomePage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const tokens = useAuthStore((s) => s.tokens);
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
    if (!tokens.accessToken) {
      router.replace(ROUTES.LOGIN);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const [me, organizations] = await Promise.all([authApi.me(), orgApi.listMine()]);
        if (cancelled) return;

        const orgId =
          organizationId && organizations.some((o) => o.id === organizationId)
            ? organizationId
            : (organizations[0]?.id ?? null);

        setSession({
          user: mapApiUserToUser(me),
          organizations,
          organizationId: orgId,
        });

        if (orgId && tokens.accessToken) {
          connectRealtime({
            token: tokens.accessToken,
            organizationId: orgId,
          });
          try {
            const current = await timerApi.current();
            if (!cancelled) hydrateFromApi(current);
          } catch {
            // Keep whatever timer state we already have (do not drop a running session)
          }
        }
      } catch (err) {
        if (cancelled) return;
        // Only a rejected login sends the user back to sign in. Offline at
        // launch, a sleeping network or a server restart must not log anyone
        // out: keep the saved session and try again shortly.
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 401 || status === 403) {
          router.replace(ROUTES.LOGIN);
          return;
        }
        retryTimer = setTimeout(() => void bootstrap(), 5_000);
      }
    }

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    void bootstrap();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // organizationId omitted so org switch does not re-bootstrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, isAuthenticated, router, setSession, tokens.accessToken, hydrateFromApi]);

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
          <TabsList className="grid h-10 w-full grid-cols-4 rounded-lg bg-[#f5f5f5] p-1 dark:bg-[#1e293b]">
            <TabsTrigger value="summary" className={tabTriggerClass}>
              Summary
            </TabsTrigger>
            <TabsTrigger value="timesheet" className={tabTriggerClass}>
              Timesheet
            </TabsTrigger>
            <TabsTrigger value="timeline" className={tabTriggerClass}>
              Day
            </TabsTrigger>
            <TabsTrigger value="screenshots" className={tabTriggerClass}>
              Screenshots
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-3">
            <SummaryTab />
          </TabsContent>
          <TabsContent value="timesheet" className="mt-3">
            <TimesheetTab />
          </TabsContent>
          <TabsContent value="timeline" className="mt-3">
            <DayTimeline />
          </TabsContent>
          <TabsContent value="screenshots" className="mt-3">
            <ScreenshotGrid />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
