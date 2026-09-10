"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants/routes";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.HOME);
  }, [router]);

  return null;
}
