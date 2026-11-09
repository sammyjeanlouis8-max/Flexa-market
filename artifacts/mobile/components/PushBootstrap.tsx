import { useAuth } from "@/context/AuthContext";
import { useNativePush } from "@/hooks/useNativePush";
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
    // User logged out — remove device token ownership on server.
    if (prev && !token && expo) {
      void unregisterExpoPushToken(expo, prev).catch(() => false);
    }
    prevToken.current = token;
  }, [token, getPushToken]);

  return null;
}
