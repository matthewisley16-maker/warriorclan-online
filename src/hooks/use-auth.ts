import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";

/**
 * Max time (ms) to wait for auth to settle before giving up on the spinner —
 * applied only inside embedded previews (editor iframes), where the Convex
 * auth handshake can stall. Normal tabs wait as long as they need.
 */
const AUTH_TIMEOUT = 8000;

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // Escape hatch so embedded previews never spin forever on auth.
  const embedded = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!embedded) return;
    const t = window.setTimeout(() => setTimedOut(true), AUTH_TIMEOUT);
    return () => window.clearTimeout(t);
  }, [embedded]);

  const isLoading = (isAuthLoading || user === undefined) && !(embedded && timedOut);

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
