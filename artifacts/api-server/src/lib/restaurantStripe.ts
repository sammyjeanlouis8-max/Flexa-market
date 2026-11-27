import { eq, sql } from "drizzle-orm";
import { db, restaurantOrdersTable, restaurantNotificationsTable } from "@workspace/db";
import { getStripeClient } from "./stripeClient";
import { logger } from "./logger";

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Create a Stripe PaymentIntent for a restaurant order (platform charge; 0% commission at launch). */
export async function createRestaurantPaymentIntent(input: {
  orderId: number;
  totalMinor: number;
  currency: string;
  customerId: number;
  restaurantId: number;
  idempotencyKey?: string | null;
}): Promise<{ clientSecret: string | null; paymentIntentId: string | null; confirmationPin: string }> {
  const confirmationPin = randomPin();
  await db.update(restaurantOrdersTable).set({
    confirmationPin,
    paymentStatus: "requires_payment",
    status: "pending_payment",
    usesFlexaDrivers: false,
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, input.orderId));

  try {
    const stripe = await getStripeClient();
    const pi = await stripe.paymentIntents.create(
      {
        amount: input.totalMinor,
        currency: input.currency.toLowerCase(),
        metadata: {
          flexaModule: "restaurant",
          restaurantOrderId: String(input.orderId),
          restaurantId: String(input.restaurantId),
          customerId: String(input.customerId),
          usesFlexaDrivers: "false",
        },
        automatic_payment_methods: { enabled: true },
      },
      input.idempotencyKey
        ? { idempotencyKey: `restaurant-order-${input.idempotencyKey}` }
        : undefined,
    );
    await db.update(restaurantOrdersTable).set({
      stripePaymentIntentId: pi.id,
      updatedAt: new Date(),
    }).where(eq(restaurantOrdersTable.id, input.orderId));
    return {
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      confirmationPin,
    };
  } catch (err) {
    logger.warn({ err, orderId: input.orderId }, "Restaurant PaymentIntent unavailable — order stays pending_payment");
    return { clientSecret: null, paymentIntentId: null, confirmationPin };
  }
}

/** Mark restaurant order paid when Stripe PaymentIntent succeeds (webhook). */
export async function markRestaurantOrderPaidFromStripe(piId: string, amountReceived: number, currency: string): Promise<void> {
  const [order] = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.stripePaymentIntentId, piId))
    .limit(1);
  if (!order) return;
  if (order.paymentStatus === "paid") return;
  if (order.totalMinor > 0 && amountReceived !== order.totalMinor) {
    logger.error({
      orderId: order.id,
      expected: order.totalMinor,
      got: amountReceived,
      currency,
    }, "Restaurant Stripe amount mismatch");
    await db.update(restaurantOrdersTable).set({
      paymentStatus: "failed",
      updatedAt: new Date(),
    }).where(eq(restaurantOrdersTable.id, order.id));
    return;
  }
  await db.update(restaurantOrdersTable).set({
    paymentStatus: "paid",
    status: "order_placed",
    usesFlexaDrivers: false,
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, order.id));
  await db.insert(restaurantNotificationsTable).values({
    userId: order.customerId,
    restaurantId: order.restaurantId,
    type: "payment_paid",
    title: `Order #${order.id} paid`,
    body: "Payment received. The business will confirm and prepare your food.",
    href: "/restaurant/my-orders",
  });
  try {
    await db.execute(sql`
      INSERT INTO restaurant_order_status_history (order_id, from_status, to_status, actor_id, note)
      VALUES (${order.id}, ${order.status}, 'order_placed', ${order.customerId}, 'stripe_payment_intent.succeeded')
    `);
  } catch {
    /* history table optional mid-deploy */
  }
}

export async function markRestaurantOrderPaymentFailed(piId: string): Promise<void> {
  const [order] = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.stripePaymentIntentId, piId))
    .limit(1);
  if (!order || order.paymentStatus === "paid") return;
  await db.update(restaurantOrdersTable).set({
    paymentStatus: "failed",
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, order.id));
}

/** Full refund of a paid restaurant order via Stripe. */
export async function refundRestaurantOrder(orderId: number, actorId: number, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const [order] = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Not found" };
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
    return { ok: false, error: "Order is not paid" };
  }
  await db.update(restaurantOrdersTable).set({
    status: "refund_pending",
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, orderId));
  if (order.stripePaymentIntentId) {
    try {
      const stripe = await getStripeClient();
      await stripe.refunds.create({
        payment_intent: order.stripePaymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          flexaModule: "restaurant",
          restaurantOrderId: String(orderId),
          actorId: String(actorId),
          note: reason || "",
        },
      });
    } catch (err: any) {
      logger.error({ err, orderId }, "Restaurant Stripe refund failed");
      return { ok: false, error: err?.message || "Refund failed" };
    }
  }
  await db.update(restaurantOrdersTable).set({
    status: "refunded",
    paymentStatus: "refunded",
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, orderId));
  await db.insert(restaurantNotificationsTable).values({
    userId: order.customerId,
    restaurantId: order.restaurantId,
    type: "refunded",
    title: `Order #${orderId} refunded`,
    body: reason || "Your payment was refunded.",
    href: "/restaurant/my-orders",
  });
  return { ok: true };
}
