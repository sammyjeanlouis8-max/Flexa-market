/**
 * Shared order list / timeline helpers for the customer order redesign.
 * Maps backend statuses onto the 5-stage reference timeline without inventing progress.
 */

export type OrderFilterKey = "all" | "processing" | "shipped" | "delivered";

export type TimelineStageKey =
  | "placed"
  | "seller_confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered";

export const ORDER_FILTERS: OrderFilterKey[] = ["all", "processing", "shipped", "delivered"];

/** Brand green used in Layout header — keep order UI on Flexa brand, not indigo/blue primary. */
export const FLEXA_BRAND = {
  primary: "hsl(152,65%,18%)",
  header: "hsl(152,65%,18%)",
  soft: "hsl(152,40%,94%)",
  softBorder: "hsl(152,30%,85%)",
  success: "hsl(152,55%,36%)",
} as const;

export function orderRef(id: number): string {
  return `#FM-${String(id).padStart(6, "0")}`;
}

export function matchesOrderFilter(
  filter: OrderFilterKey,
  order: { orderStatus: string; deliveryStatus?: string | null; trackingStatus?: string | null },
): boolean {
  if (filter === "all") return true;
  const s = order.orderStatus;
  if (filter === "processing") {
    return ["pending", "ordered", "ready_to_ship", "processing"].includes(s);
  }
  if (filter === "shipped") {
    return (
      ["shipped", "en_route", "in_transit"].includes(s) ||
      ["waiting", "assigned", "accepted", "driver_assigned", "picked_up", "on_the_way", "arrived"].includes(
        order.deliveryStatus ?? "",
      ) ||
      ["label_created", "in_transit", "out_for_delivery"].includes(order.trackingStatus ?? "")
    ) && !["delivered", "completed", "cancelled", "return_refunded"].includes(s);
  }
  if (filter === "delivered") {
    return ["delivered", "completed"].includes(s) || order.deliveryStatus === "delivered";
  }
  return true;
}

/**
 * 0..4 index into TIMELINE_STAGES. Never marks future stages complete.
 * cancelled / return states return -1 (caller shows alternate UI).
 */
export function timelineStageIndex(input: {
  orderStatus: string;
  deliveryStatus?: string | null;
  trackingStatus?: string | null;
}): number {
  const s = input.orderStatus;
  if (["cancelled", "return_refunded", "failed"].includes(s)) return -1;
  if (["delivered", "completed"].includes(s) || input.deliveryStatus === "delivered") return 4;

  const ds = input.deliveryStatus ?? "";
  const ts = input.trackingStatus ?? "";
  if (
    ["on_the_way", "arrived", "picked_up"].includes(ds) ||
    ts === "out_for_delivery"
  ) {
    return 3;
  }
  if (
    ["shipped", "en_route", "in_transit"].includes(s) ||
    ["waiting", "assigned", "accepted", "driver_assigned"].includes(ds) ||
    ["label_created", "in_transit", "pending"].includes(ts)
  ) {
    return 2;
  }
  if (s === "ready_to_ship" || s === "confirmed") return 1;
  return 0;
}

export const TIMELINE_STAGES: Array<{
  key: TimelineStageKey;
  labelKey: string;
  pendingKey: string;
}> = [
  {
    key: "placed",
    labelKey: "orderTracking.stagePlaced",
    pendingKey: "orderTracking.stagePlacedPending",
  },
  {
    key: "seller_confirmed",
    labelKey: "orderTracking.stageSellerConfirmed",
    pendingKey: "orderTracking.stageSellerConfirmedPending",
  },
  {
    key: "preparing",
    labelKey: "orderTracking.stagePreparing",
    pendingKey: "orderTracking.stagePreparingPending",
  },
  {
    key: "out_for_delivery",
    labelKey: "orderTracking.stageOutForDelivery",
    pendingKey: "orderTracking.stageOutForDeliveryPending",
  },
  {
    key: "delivered",
    labelKey: "orderTracking.stageDelivered",
    pendingKey: "orderTracking.stageDeliveredPending",
  },
];

/** Customer-facing status badge for list cards. */
export function listStatusPresentation(order: {
  orderStatus: string;
  deliveryStatus?: string | null;
  trackingStatus?: string | null;
}): { tone: "delivery" | "delivered" | "processing" | "cancelled" | "shipped"; labelKey: string } {
  if (["cancelled", "return_refunded"].includes(order.orderStatus)) {
    return { tone: "cancelled", labelKey: "orderTracking.statusCancelled" };
  }
  if (["delivered", "completed"].includes(order.orderStatus) || order.deliveryStatus === "delivered") {
    return { tone: "delivered", labelKey: "orderTracking.statusDelivered" };
  }
  if (
    ["on_the_way", "arrived", "picked_up"].includes(order.deliveryStatus ?? "") ||
    order.trackingStatus === "out_for_delivery"
  ) {
    return { tone: "delivery", labelKey: "orderTracking.statusOutForDelivery" };
  }
  if (["shipped", "en_route", "in_transit"].includes(order.orderStatus)) {
    return { tone: "shipped", labelKey: "orderTracking.statusShipped" };
  }
  return { tone: "processing", labelKey: "orderTracking.statusProcessing" };
}

export function canShowLiveTrackButton(order: {
  orderStatus: string;
  fmDeliveryId?: number | null;
  shipmentId?: number | null;
  trackingNumber?: string | null;
}): boolean {
  if (["cancelled", "pending"].includes(order.orderStatus)) return false;
  // Prefer FM delivery tracking when a delivery record exists.
  if (order.fmDeliveryId) return !["cancelled"].includes(order.orderStatus);
  // Carrier tracking page still useful when a tracking number exists.
  return Boolean(order.trackingNumber || order.shipmentId);
}
