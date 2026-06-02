import { useEffect } from "react";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "https://bonjour-tool.replit.app";

async function registerToken(token: string) {
  try {
    await fetch(`${API_BASE}/api/push/expo-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        token,
        platform: "ios",
        deviceId: null,
      }),
    });
  } catch {}
}

export function useExpoPushToken() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleToken = (token: string) => {
      registerToken(token);
    };

    const w = window as any;

    if (typeof w.__expoPushToken === "string") {
      handleToken(w.__expoPushToken);
    }

    w.__onExpoPushToken = handleToken;

    return () => {
      w.__onExpoPushToken = undefined;
    };
  }, [user]);
}
