'use client';

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Client-side session guard. Avoid `redirect()` from `next/navigation` in client
 * components — it throws internally and can interact badly with error boundaries,
 * leaving the UI painted but non-interactive.
 */
export function useRequireAuth(loginPath = "/login") {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(loginPath);
    }
  }, [status, router, loginPath]);

  return { session, status };
}
