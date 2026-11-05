import { CheckCircle2, Loader2, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FLEXA_BRAND, listStatusPresentation } from "@/lib/orderTrackingUi";

type Props = {
  orderStatus: string;
  deliveryStatus?: string | null;
  trackingStatus?: string | null;
  className?: string;
};

export default function OrderStatusBadge({ orderStatus, deliveryStatus, trackingStatus, className }: Props) {
  const { t } = useTranslation();
  const { tone, labelKey } = listStatusPresentation({ orderStatus, deliveryStatus, trackingStatus });

  const label = t(labelKey, {
    defaultValue:
      tone === "delivered"
        ? "Delivered"
        : tone === "delivery"
          ? "Out for delivery"
          : tone === "shipped"
            ? "Shipped"
            : tone === "cancelled"
              ? "Cancelled"
              : "Processing",
  });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
        tone === "cancelled" && "bg-rose-50 text-rose-700 border border-rose-200",
        tone === "processing" && "bg-sky-50 text-sky-800 border border-sky-200",
        tone === "shipped" && "bg-emerald-50 text-emerald-800 border border-emerald-200",
        className,
      )}
      style={
        tone === "delivery" || tone === "delivered"
          ? { background: FLEXA_BRAND.soft, color: FLEXA_BRAND.success, border: `1px solid ${FLEXA_BRAND.softBorder}` }
          : undefined
      }
      data-testid="order-status-badge"
    >
      {tone === "delivered" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : tone === "delivery" || tone === "shipped" ? (
        <Truck className="h-3.5 w-3.5" />
      ) : tone === "processing" ? (
        <Loader2 className="h-3.5 w-3.5" />
      ) : null}
      {label}
    </span>
  );
}
