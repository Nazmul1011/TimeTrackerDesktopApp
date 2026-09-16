"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle } from "lucide-react";

export function UpdateDialog() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string>("");
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.updater) return;

    const cleanup = window.electronAPI.updater.onDownloaded((payload) => {
      setVersion(payload.version || "");
      setOpen(true);
    });

    return () => cleanup();
  }, []);

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await window.electronAPI?.updater?.install();
    } catch {
      setIsRestarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[340px] rounded-2xl border border-[#ededed] bg-white p-5 shadow-xl dark:border-[#334155] dark:bg-[#1e293b]">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#f0f6ff] dark:bg-[#1e3a8a]/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/logo.svg"
              alt="Gr8r"
              className="size-7 rounded-lg"
              width={28}
              height={28}
            />
            <div className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#2b7fff] text-white ring-2 ring-white dark:ring-[#1e293b]">
              <ArrowUpCircle className="size-3.5" />
            </div>
          </div>

          <DialogHeader className="gap-1 text-center sm:text-center">
            <DialogTitle className="text-base font-semibold text-[#1e2939] dark:text-[#f1f5f9]">
              Update Ready
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-[#6a7282] dark:text-[#94a3b8]">
              {version ? `Version ${version}` : "A new version"} of Gr8r Time Tracker has been
              downloaded and is ready to install.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 flex w-full flex-row justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 flex-1 rounded-lg border-[#e2e8f0] px-3 text-xs font-medium text-[#475569] hover:bg-[#f8fafc] dark:border-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#334155]"
              disabled={isRestarting}
              onClick={() => setOpen(false)}
            >
              Later
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 flex-1 rounded-lg bg-[#2b7fff] px-3 text-xs font-medium text-white shadow-none hover:bg-[#1a6aef]"
              disabled={isRestarting}
              onClick={() => void handleRestart()}
            >
              {isRestarting ? "Restarting…" : "Restart Now"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
