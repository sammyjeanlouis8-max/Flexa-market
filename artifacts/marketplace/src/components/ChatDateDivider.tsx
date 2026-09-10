import { useTranslation } from "react-i18next";
import { formatChatDay } from "@/lib/chatTimeline";

export function ChatDateDivider({ createdAt, isDark }: {
  createdAt: string | number;
  isDark: boolean;
}) {
  const { t, i18n } = useTranslation();
  const label = formatChatDay(createdAt, i18n.language, t);
  if (!label) return null;
  return (
    <div role="separator" aria-label={label}
      style={{ display: "flex", justifyContent: "center", margin: "14px 0 12px" }}>
      <span style={{
        padding: "5px 12px", borderRadius: 8,
        background: isDark ? "#26343c" : "#fff",
        color: isDark ? "#c3cbd0" : "#606c70",
        boxShadow: "0 1px 2px rgba(11,20,26,0.10)",
        fontSize: 11, fontWeight: 500, lineHeight: "16px",
        textAlign: "center",
      }}>
        {label}
      </span>
    </div>
  );
}