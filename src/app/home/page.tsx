/**
 * Home page — Figma desktop widget layout.
 * Header + Timer + Tabs (Summary / Timesheet / Screenshots).
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TimerCard } from "@/components/timer/timer-card";
import { SummaryTab } from "@/components/summary/summary-tab";
import { TimesheetTab } from "@/components/timesheet/timesheet-tab";
import { ScreenshotGrid } from "@/components/screenshots/screenshot-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROUTES } from "@/constants/routes";
import { authApi } from "@/services/api/auth.api";
import { orgApi } from "@/services/api/org.api";
import { timerApi } from "@/services/api/timer.api";
import { connectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";
import { mapApiUserToUser } from "@/types";
import { useTrackingAgent } from "@/hooks/useTrackingAgent";

export default function HomePage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const tokens = useAuthStore((s) => s.tokens);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);

  useTrackingAgent();

  useEffect(() => {
    if (!tokens.accessToken) {
      router.replace(ROUTES.LOGIN);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const [me, organizations] = await Promise.all([
          authApi.me(),
          orgApi.listMine(),
        ]);
        if (cancelled) return;

        const orgId =
          organizationId &&
          organizations.some((o) => o.id === organizationId)
            ? organizationId
            : organizations[0]?.id ?? null;

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
      } catch {
        if (!cancelled) {
          router.replace(ROUTES.LOGIN);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
    // intentionally omit organizationId to avoid re-bootstrap on org switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, router, setSession, tokens.accessToken, hydrateFromApi]);

  return (
    <div className="app-shell">
      <Header />
      <TimerCard />

      <section className="surface-card flex min-h-[250px] flex-col gap-3 p-3">
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg bg-[#f5f5f5] p-1">
            <TabsTrigger
              value="summary"
              className="h-8 rounded-full text-sm font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-none data-[state=inactive]:text-[#4a5565] data-[state=inactive]:hover:bg-white/70"
            >
              Summary
            </TabsTrigger>
            <TabsTrigger
              value="timesheet"
              className="h-8 rounded-full text-sm font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-none data-[state=inactive]:text-[#4a5565] data-[state=inactive]:hover:bg-white/70"
            >
              Timesheet
            </TabsTrigger>
            <TabsTrigger
              value="screenshots"
              className="h-8 rounded-full text-sm font-normal shadow-none transition-colors hover:text-[#1e2939] data-[state=active]:rounded-md data-[state=active]:border data-[state=active]:border-[#ededed] data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-none data-[state=inactive]:text-[#4a5565] data-[state=inactive]:hover:bg-white/70"
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
