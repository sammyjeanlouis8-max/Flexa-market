import { Check, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FLEXA_BRAND, TIMELINE_STAGES, timelineStageIndex } from "@/lib/orderTrackingUi";

type Props = {
  orderStatus: string;
  deliveryStatus?: string | null;
  trackingStatus?: string | null;
  createdAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  /** When true, omit outer card chrome (parent already provides a card). */
  embedded?: boolean;
  className?: string;
};

function formatTs(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export default function OrderTimeline({
  orderStatus,
  deliveryStatus,
  trackingStatus,
  createdAt,
  shippedAt,
  deliveredAt,
  completedAt,
  embedded = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const idx = timelineStageIndex({ orderStatus, deliveryStatus, trackingStatus });

  if (idx < 0) {
    return (
      <div className={cn(!embedded && "rounded-2xl border border-border bg-card p-4", "text-sm text-muted-foreground", className)}>
        {t("orderTracking.timelineUnavailable", {
          defaultValue: "Tracking timeline is unavailable for this order status.",
        })}
      </div>
    );
  }

  const timestamps = [
    formatTs(createdAt),
    formatTs(createdAt), // seller confirmed often soon after — only show if past stage without inventing
    formatTs(shippedAt),
    formatTs(shippedAt),
    formatTs(deliveredAt || completedAt),
  ];

  return (
    <div className={cn(!embedded && "rounded-2xl border border-border bg-card p-4 sm:p-5", className)} data-testid="order-timeline">
      {!embedded && (
        <h2 className="text-sm font-bold text-foreground mb-4">
          {t("orderTracking.timelineTitle", { defaultValue: "Delivery progress" })}
        </h2>
      )}
      <ol className="relative space-y-0">
        {TIMELINE_STAGES.map((stage, i) => {
          const done = i < idx;
          const current = i === idx;
          const pending = i > idx;
          const ts = i === 0 ? timestamps[0] : i === 2 || i === 3 ? timestamps[i] : i === 4 ? timestamps[4] : done || current ? timestamps[i] : null;

          return (
            <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0" data-testid={`timeline-stage-${stage.key}`}>
              {i < TIMELINE_STAGES.length - 1 && (
                <span
                  className="absolute left-[15px] top-8 bottom-0 w-0.5"
                  style={{ background: done || current ? FLEXA_BRAND.success : "hsl(var(--border))" }}
                  aria-hidden
                />
              )}
              <div
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                  done && "border-transparent text-white",
                  current && "border-transparent text-white",
                  pending && "border-muted-foreground/30 bg-background text-muted-foreground",
                )}
                style={
                  done || current
                    ? { background: FLEXA_BRAND.success, borderColor: FLEXA_BRAND.success }
                    : undefined
                }
              >
                {done ? <Check className="h-4 w-4" /> : current && stage.key === "out_for_delivery" ? <Truck className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current opacity-40" />}
              </div>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-xl px-3 py-2.5",
                  current && "border",
                  pending && "opacity-70",
                )}
                style={
                  current
                    ? { background: FLEXA_BRAND.soft, borderColor: FLEXA_BRAND.softBorder }
                    : undefined
                }
              >
                <p className={cn("text-sm font-bold", current || done ? "text-foreground" : "text-muted-foreground")}>
                  {t(stage.labelKey, {
                    defaultValue:
                      stage.key === "placed"
                        ? "Order placed"
                        : stage.key === "seller_confirmed"
                          ? "Seller confirmed"
                          : stage.key === "preparing"
                            ? "Preparing for delivery"
                            : stage.key === "out_for_delivery"
                              ? "Out for delivery"
                              : "Delivered",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pending
                    ? t(stage.pendingKey, { defaultValue: "Waiting for confirmation." })
                    : current && stage.key === "out_for_delivery"
                      ? t("orderTracking.outForDeliveryHint", {
                          defaultValue: "Your order is with the delivery partner.",
                        })
                      : ts || t("orderTracking.completedStep", { defaultValue: "Completed" })}
                </p>
                {ts && (done || current) && (
                  <p className="text-[11px] text-muted-foreground mt-1">{ts}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
