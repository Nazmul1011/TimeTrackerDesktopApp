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
import { useNotificationStore } from "@/store/notification.store";
import { useTimerStore } from "@/store/timer.store";
import { mapApiUserToUser } from "@/types";
import { useTrackingAgent } from "@/hooks/useTrackingAgent";

export default function HomePage() {
  const router = useRouter();
  const setNotifications = useNotificationStore((s) => s.setNotifications);
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
            if (!cancelled) hydrateFromApi(null);
          }
        }
      } catch {
        if (!cancelled) {
          router.replace(ROUTES.LOGIN);
        }
      }
    }

    void bootstrap();

    setNotifications([
      {
        id: "n-1",
        title: "Deletion request",
        body: "Your screenshot deletion request for 09:20 AM is awaiting admin review.",
        type: "info",
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: "n-2",
        title: "Screenshot deleted",
        body: "Your screenshot from 09:20 AM has been permanently deleted.",
        type: "success",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    return () => {
      cancelled = true;
    };
    // intentionally omit organizationId to avoid re-bootstrap on org switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, router, setNotifications, setSession, tokens.accessToken, hydrateFromApi]);

  return (
    <div className="app-shell">
      <Header />
      <TimerCard />

      <section className="surface-card flex min-h-[250px] flex-col gap-3 p-3">
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg bg-[var(--surface-elevated)] p-1">
            <TabsTrigger
              value="summary"
              className="rounded-md text-sm data-[state=active]:border data-[state=active]:border-[var(--border-subtle)] data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black data-[state=inactive]:text-[var(--text-subtle)]"
            >
              Summary
            </TabsTrigger>
            <TabsTrigger
              value="timesheet"
              className="rounded-md text-sm data-[state=active]:border data-[state=active]:border-[var(--border-subtle)] data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black data-[state=inactive]:text-[var(--text-subtle)]"
            >
              Timesheet
            </TabsTrigger>
            <TabsTrigger
              value="screenshots"
              className="rounded-md text-sm data-[state=active]:border data-[state=active]:border-[var(--border-subtle)] data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-black data-[state=inactive]:text-[var(--text-subtle)]"
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
