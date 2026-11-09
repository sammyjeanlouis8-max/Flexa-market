import { useAuth } from "@/context/AuthContext";
import { useNativePush } from "@/hooks/useNativePush";
import { planLogoutTokenCleanup } from "@/lib/pushLifecycle";
import { unregisterExpoPushToken } from "@/lib/pushToken";
import React, { useEffect, useRef } from "react";

/** Mount once under AuthProvider to own push token lifecycle. */
export function PushBootstrap() {
  const { token } = useAuth();
  const { getPushToken } = useNativePush();
  const prevToken = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevToken.current;
    const expo = getPushToken();
    const plan = planLogoutTokenCleanup({
      previousJwt: prev,
      nextJwt: token,
      expoToken: expo,
    });
    if (plan.shouldUnregister && plan.expoToken && plan.authJwtToUse) {
      void unregisterExpoPushToken(plan.expoToken, plan.authJwtToUse).catch(() => false);
    }
    prevToken.current = token;
  }, [token, getPushToken]);

  return null;
}
