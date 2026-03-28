'use client';

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { setupGlobalErrorCapture } from "@/lib/logger";

export function AgencyAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setupGlobalErrorCapture();
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
