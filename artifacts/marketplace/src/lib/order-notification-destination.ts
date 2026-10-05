/** A listing can have many sales: only the transaction ID identifies an order. */
export function orderNotificationDestination(notification: {
  type: string;
  referenceId?: number | null;
}): string | null {
  const seller = ["purchase", "new_order"].includes(notification.type);
  const buyer = ["order_confirmed", "order_shipped", "order_delivered",
    "shipment_created", "shipment_shipped", "shipment_in_transit", "shipment_out_for_delivery",
    "shipment_delivered", "shipment_exception", "shipment_returned"].includes(notification.type);
  if (!seller && !buyer) return null;
  const id = notification.referenceId;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0
    ? `/orders/${id}`
    : seller ? "/sales" : "/orders";
}
