/**
 * Registers Expo push token with DigitalOcean after native auth.
 * Does not simulate delivery; prepares FCM path when google-services is present.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { registerExpoPushToken } from "@/lib/pushPrep";

export function PushBootstrap() {
  const { token } = useAuth();
  const lastJwt = useRef<string | null>(null);

  useEffect(() => {
    if (!token || token === lastJwt.current) return;
    lastJwt.current = token;
    void registerExpoPushToken(token);
  }, [token]);

  return null;
}
