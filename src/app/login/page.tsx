/**
 * Login page — real backend auth + org selection.
 */
"use client";

import { useEffect, useState } from "react";
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
import { isOfflineError } from "@/lib/offline-error";
import { authApi } from "@/services/api/auth.api";
import { orgApi } from "@/services/api/org.api";
import type { OrganizationWithMembership } from "@/services/api/types";
import { connectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { mapApiUserToUser } from "@/types";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingOrgs, setPendingOrgs] = useState<OrganizationWithMembership[] | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [pendingTokens, setPendingTokens] = useState<{
    access_token: string;
    refresh_token: string;
    session_token: string;
  } | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    // Tokens alone are not enough — org selection still needs this page.
    if (isAuthenticated && (user || organizationId)) {
      router.replace(ROUTES.HOME);
    }
  }, [hasHydrated, isAuthenticated, organizationId, router, user]);

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
      toast.error(
        isOfflineError(err)
          ? "You're offline. Connect to the internet to sign in."
          : getErrorMessage(err, "Sign in failed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9fafb] p-6 dark:bg-background">
      <form onSubmit={handleSubmit} className="surface-card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/figma/logo.svg"
            alt="Gr8r"
            className="size-10 rounded-lg"
            width={40}
            height={40}
          />
          <h1 className="text-lg font-semibold text-[#1e2939] dark:text-[#f1f5f9]">Sign in</h1>
          <p className="text-xs text-[var(--text-muted)]">Gr8r Time Tracker desktop</p>
        </div>

        {!pendingOrgs ? (
          <>
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-[#1e2939] dark:text-[#f1f5f9]"
              >
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
                className="text-[#1e2939] dark:text-[#f1f5f9]"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-[#1e2939] dark:text-[#f1f5f9]"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pr-10 text-[#1e2939] dark:text-[#f1f5f9]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-[#6a7282] transition-colors hover:text-[#1e2939] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label
              htmlFor="organization"
              className="text-sm font-medium text-[#1e2939] dark:text-[#f1f5f9]"
            >
              Organization
            </Label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger
                id="organization"
                className="h-10 rounded-lg border-[#e6e6e6] bg-white text-[#1e2939] dark:border-[#334155] dark:bg-card dark:text-[#f1f5f9]"
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
          {loading ? "Signing in…" : pendingOrgs ? "Continue" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
