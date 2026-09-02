/**
 * Admin panel — review pending screenshot deletion requests.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dayjs } from "@/lib/dayjs";
import { screenshotApi } from "@/services/api/screenshot.api";
import { useAuthStore } from "@/store/auth.store";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "PROJECT_MANAGER"]);

type PendingRequest = Awaited<
  ReturnType<typeof screenshotApi.listPendingDeletionRequests>
>[number];

export function ScreenshotDeletionReview() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const organizations = useAuthStore((s) => s.organizations);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const membership = organizations.find((o) => o.id === organizationId)?.membership;
  const canReview = membership ? ADMIN_ROLES.has(membership.role) : false;

  const load = useCallback(async () => {
    if (!canReview || !organizationId) {
      setRequests([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await screenshotApi.listPendingDeletionRequests();
      setRequests(rows);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [canReview, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      await screenshotApi.reviewDeletion(id, action);
      toast.success(
        action === "approve" ? "Screenshot deleted" : "Deletion request declined",
      );
      await load();
    } catch {
      toast.error("Could not review deletion request");
    } finally {
      setBusyId(null);
    }
  };

  if (!canReview) return null;

  return (
    <div className="surface-card w-full overflow-hidden">
      <div className="border-b border-[#e5e5e5] px-4 py-3">
        <p className="text-xs font-medium text-[#1e2939]">
          Screenshot deletion requests
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Review and approve or decline employee deletion requests.
        </p>
      </div>

      <div className="px-4 py-3">
        {loading ? (
          <p className="py-4 text-center text-xs text-[var(--text-muted)]">
            Loading pending requests…
          </p>
        ) : requests.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--text-muted)]">
            No pending deletion requests.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((req) => (
              <li
                key={req.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] p-2"
              >
                <div className="size-12 shrink-0 overflow-hidden rounded-md bg-[var(--surface-elevated)]">
                  {req.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={req.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[#1e2939]">
                    {req.user?.name ?? req.user?.email ?? "Employee"}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {dayjs(req.capturedAt).format("MMM D, hh:mm A")}
                    {req.appName ? ` · ${req.appName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    disabled={busyId === req.id}
                    onClick={() => void review(req.id, "reject")}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    disabled={busyId === req.id}
                    onClick={() => void review(req.id, "approve")}
                  >
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
