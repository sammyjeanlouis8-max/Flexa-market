import { useState, useEffect } from "react";

type NetworkStatus = {
  isOnline: boolean;
  isSlowConnection: boolean;
  effectiveType: string | null;
};

export function useNetworkStatus(): NetworkStatus {
  const getStatus = (): NetworkStatus => {
    const conn = (navigator as any).connection as any;
    const effectiveType: string | null = conn?.effectiveType ?? null;
    const isSlowConnection = effectiveType === "slow-2g" || effectiveType === "2g";
    return { isOnline: navigator.onLine, isSlowConnection, effectiveType };
  };

  const [status, setStatus] = useState<NetworkStatus>(getStatus);

  useEffect(() => {
    const update = () => setStatus(getStatus());

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    const conn = (navigator as any).connection as any;
    conn?.addEventListener("change", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      conn?.removeEventListener("change", update);
    };
  }, []);

  return status;
}
