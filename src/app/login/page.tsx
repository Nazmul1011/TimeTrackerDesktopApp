/**
 * Login page — real backend auth + org selection.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTES } from "@/constants/routes";
import { authApi } from "@/services/api/auth.api";
import { orgApi } from "@/services/api/org.api";
import type { OrganizationWithMembership } from "@/services/api/types";
import { connectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { mapApiUserToUser } from "@/types";
import { toast } from "sonner";

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingOrgs, setPendingOrgs] = useState<
    OrganizationWithMembership[] | null
  >(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [pendingTokens, setPendingTokens] = useState<{
    access_token: string;
    refresh_token: string;
    session_token: string;
  } | null>(null);

  const finishLogin = async (
    tokens: {
      access_token: string;
      refresh_token: string;
      session_token: string;
    },
    organizations: OrganizationWithMembership[],
    organizationId: string,
  ) => {
    // Persist tokens + org first so subsequent API calls have headers
    setSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      sessionToken: tokens.session_token,
      organizations,
      organizationId,
    });

    const me = await authApi.me();
    setSession({
      user: mapApiUserToUser(me),
      organizations,
      organizationId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      sessionToken: tokens.session_token,
    });

    connectRealtime({
      token: tokens.access_token,
      organizationId,
    });

    toast.success("Signed in");
    router.push(ROUTES.HOME);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (pendingOrgs && pendingTokens) {
        if (!selectedOrgId) {
          toast.error("Select an organization");
          return;
        }
        await finishLogin(pendingTokens, pendingOrgs, selectedOrgId);
        return;
      }

      const tokens = await authApi.login({ email, password });

      // Temporarily store tokens so org list request is authenticated
      setSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        sessionToken: tokens.session_token,
      });

      const organizations = await orgApi.listMine();
      if (!organizations.length) {
        toast.error("No organizations found for this account");
        return;
      }

      if (organizations.length === 1) {
        await finishLogin(tokens, organizations, organizations[0].id);
        return;
      }

      setPendingTokens(tokens);
      setPendingOrgs(organizations);
      setSelectedOrgId(organizations[0].id);
      toast.message("Select an organization to continue");
    } catch (err) {
      toast.error(getErrorMessage(err, "Sign in failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9fafb] p-6">
      <form
        onSubmit={handleSubmit}
        className="surface-card w-full max-w-sm space-y-4 p-6"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/figma/logo.svg"
            alt="Gr8r"
            className="size-10 rounded-lg"
            width={40}
            height={40}
          />
          <h1 className="text-lg font-semibold text-[#1e2939]">Sign in</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Gr8r Time Tracker desktop
          </p>
        </div>

        {!pendingOrgs ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-[#1e2939]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="text-[#1e2939]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#1e2939]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="text-[#1e2939]"
              />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="organization" className="text-sm font-medium text-[#1e2939]">
              Organization
            </Label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger
                id="organization"
                className="h-10 rounded-lg border-[#e6e6e6] bg-white text-[#1e2939]"
              >
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {pendingOrgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          type="submit"
          className="w-full bg-[var(--brand)] hover:bg-[#1a6aef]"
          disabled={loading}
        >
          {loading
            ? "Signing in…"
            : pendingOrgs
              ? "Continue"
              : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
