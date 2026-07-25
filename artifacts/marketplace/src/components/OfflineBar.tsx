import { Wifi, WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTranslation } from "react-i18next";

export default function OfflineBar() {
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const { t } = useTranslation();

  if (isOnline && !isSlowConnection) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: isOnline ? "#92400e" : "#1f2937",
        color: "#fff",
        fontSize: 12,
        fontWeight: 500,
        textAlign: "center",
        padding: "5px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        zIndex: 49,
        position: "relative",
      }}
    >
      {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
      {isOnline
        ? t("errors.slowConnection")
        : t("errors.noInternet")}
    </div>
  );
}
