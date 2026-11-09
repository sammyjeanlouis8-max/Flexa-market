/**
 * Shared order list / filter helpers — mirrors marketplace orderTrackingUi.ts.
 */

export type OrderFilterKey = "all" | "processing" | "shipped" | "delivered";

export const ORDER_FILTERS: OrderFilterKey[] = [
  "all",
  "processing",
  "shipped",
  "delivered",
];

export const ORDER_FILTER_LABELS: Record<OrderFilterKey, string> = {
  all: "All",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
};

export function orderRef(id: number): string {
  return `#FM-${String(id).padStart(6, "0")}`;
}

export function matchesOrderFilter(
  filter: OrderFilterKey,
  order: {
    orderStatus: string;
    deliveryStatus?: string | null;
    trackingStatus?: string | null;
  },
): boolean {
  if (filter === "all") return true;
  const s = order.orderStatus;
  if (filter === "processing") {
    return ["pending", "ordered", "ready_to_ship", "processing"].includes(s);
  }
  if (filter === "shipped") {
    return (
      (["shipped", "en_route", "in_transit"].includes(s) ||
        [
          "waiting",
          "assigned",
          "accepted",
          "driver_assigned",
          "picked_up",
          "on_the_way",
          "arrived",
        ].includes(order.deliveryStatus ?? "") ||
        ["label_created", "in_transit", "out_for_delivery"].includes(
          order.trackingStatus ?? "",
        )) &&
      !["delivered", "completed", "cancelled", "return_refunded"].includes(s)
    );
  }
  if (filter === "delivered") {
    return (
      ["delivered", "completed"].includes(s) ||
      order.deliveryStatus === "delivered"
    );
  }
  return true;
}

export function listStatusLabel(order: {
  orderStatus: string;
  deliveryStatus?: string | null;
  trackingStatus?: string | null;
}): { label: string; color: string; bg: string } {
  if (["cancelled", "return_refunded"].includes(order.orderStatus)) {
    return { label: "Cancelled", color: "#B91C1C", bg: "#FEE2E2" };
  }
  if (
    ["delivered", "completed"].includes(order.orderStatus) ||
    order.deliveryStatus === "delivered"
  ) {
    return { label: "Delivered", color: "#047857", bg: "#D1FAE5" };
  }
  if (
    ["on_the_way", "arrived", "picked_up"].includes(order.deliveryStatus ?? "") ||
    order.trackingStatus === "out_for_delivery"
  ) {
    return { label: "Out for delivery", color: "#1D4ED8", bg: "#DBEAFE" };
  }
  if (["shipped", "en_route", "in_transit"].includes(order.orderStatus)) {
    return { label: "Shipped", color: "#0369A1", bg: "#E0F2FE" };
  }
  return { label: "Processing", color: "#C2410C", bg: "#FFEDD5" };
}

export function formatMoney(amount: number, currency?: string | null) {
  const symbol =
    currency === "HTG" ? "G" : currency === "DOP" ? "RD$" : "$";
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
