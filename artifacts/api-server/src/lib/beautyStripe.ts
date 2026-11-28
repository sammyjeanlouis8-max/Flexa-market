import { eq } from "drizzle-orm";
import { db, beautyAppointmentsTable, beautyNotificationsTable } from "@workspace/db";
import { getStripeClient } from "./stripeClient";
import { logger } from "./logger";
import { canTransitionBeautyAppointment } from "./beautyAccess";

/** Create a Stripe PaymentIntent for a beauty appointment (0% commission until SA configures). */
export async function createBeautyPaymentIntent(input: {
  appointmentId: number;
  amountMinor: number;
  currency: string;
  customerId: number;
  businessId: number;
  mode: "full" | "deposit";
  idempotencyKey?: string | null;
}): Promise<{ clientSecret: string | null; paymentIntentId: string | null }> {
  await db.update(beautyAppointmentsTable).set({
    paymentStatus: "unpaid",
    updatedAt: new Date(),
  }).where(eq(beautyAppointmentsTable.id, input.appointmentId));

  try {
    const stripe = await getStripeClient();
    const pi = await stripe.paymentIntents.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        metadata: {
          flexaModule: "beauty",
          beautyAppointmentId: String(input.appointmentId),
          beautyBusinessId: String(input.businessId),
          customerId: String(input.customerId),
          paymentMode: input.mode,
        },
        automatic_payment_methods: { enabled: true },
      },
      input.idempotencyKey
        ? { idempotencyKey: `beauty-appt-${input.idempotencyKey}-${input.mode}` }
        : undefined,
    );
    await db.update(beautyAppointmentsTable).set({
      stripePaymentIntentId: pi.id,
      updatedAt: new Date(),
    }).where(eq(beautyAppointmentsTable.id, input.appointmentId));
    return { clientSecret: pi.client_secret, paymentIntentId: pi.id };
  } catch (err) {
    logger.warn({ err, appointmentId: input.appointmentId }, "Beauty PaymentIntent unavailable");
    return { clientSecret: null, paymentIntentId: null };
  }
}

export async function markBeautyAppointmentPaidFromStripe(
  piId: string,
  amountReceived: number,
  _currency: string,
): Promise<void> {
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.stripePaymentIntentId, piId))
    .limit(1);
  if (!appt) return;
  if (appt.paymentStatus === "paid" || appt.paymentStatus === "deposit_paid") return;

  const expectedDeposit = appt.depositMinorSnapshot || 0;
  const expectedFull = appt.totalMinor;
  let nextPayment: string;
  if (expectedDeposit > 0 && amountReceived === expectedDeposit && amountReceived < expectedFull) {
    nextPayment = "deposit_paid";
  } else if (amountReceived === expectedFull || (expectedDeposit === 0 && amountReceived === expectedFull)) {
    nextPayment = "paid";
  } else if (expectedDeposit > 0 && amountReceived === expectedFull) {
    nextPayment = "paid";
  } else {
    logger.error({
      appointmentId: appt.id,
      expectedFull,
      expectedDeposit,
      got: amountReceived,
    }, "Beauty Stripe amount mismatch");
    await db.update(beautyAppointmentsTable).set({
      paymentStatus: "failed",
      updatedAt: new Date(),
    }).where(eq(beautyAppointmentsTable.id, appt.id));
    return;
  }

  let nextStatus = appt.status;
  if (appt.status === "pending_confirmation" && canTransitionBeautyAppointment(appt.status, "confirmed")) {
    nextStatus = "confirmed";
  }

  await db.update(beautyAppointmentsTable).set({
    paymentStatus: nextPayment,
    status: nextStatus,
    updatedAt: new Date(),
  }).where(eq(beautyAppointmentsTable.id, appt.id));

  await db.insert(beautyNotificationsTable).values({
    userId: appt.customerId,
    businessId: appt.businessId,
    appointmentId: appt.id,
    type: "payment_confirmation",
    title: `Appointment #${appt.id} payment received`,
    body: nextPayment === "deposit_paid"
      ? "Your deposit was received. The remaining balance is due at the appointment."
      : "Payment received. Your appointment is confirmed.",
    href: "/beauty/my-appointments",
  });
}

export async function markBeautyAppointmentPaymentFailed(piId: string): Promise<void> {
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.stripePaymentIntentId, piId))
    .limit(1);
  if (!appt || appt.paymentStatus === "paid" || appt.paymentStatus === "deposit_paid") return;
  await db.update(beautyAppointmentsTable).set({
    paymentStatus: "failed",
    updatedAt: new Date(),
  }).where(eq(beautyAppointmentsTable.id, appt.id));
}

export async function refundBeautyAppointment(
  appointmentId: number,
  _actorId: number,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, appointmentId))
    .limit(1);
  if (!appt) return { ok: false, error: "Appointment not found" };
  if (!["paid", "deposit_paid"].includes(appt.paymentStatus)) {
    return { ok: false, error: "No paid amount to refund" };
  }
  if (!appt.stripePaymentIntentId) {
    await db.update(beautyAppointmentsTable).set({
      paymentStatus: "refunded",
      updatedAt: new Date(),
    }).where(eq(beautyAppointmentsTable.id, appointmentId));
    return { ok: true };
  }
  try {
    const stripe = await getStripeClient();
    await stripe.refunds.create({
      payment_intent: appt.stripePaymentIntentId,
      reason: "requested_by_customer",
      metadata: {
        flexaModule: "beauty",
        beautyAppointmentId: String(appointmentId),
        note: reason || "",
      },
    });
    await db.update(beautyAppointmentsTable).set({
      paymentStatus: "refunded",
      updatedAt: new Date(),
    }).where(eq(beautyAppointmentsTable.id, appointmentId));
    return { ok: true };
  } catch (err: any) {
    logger.error({ err, appointmentId }, "Beauty refund failed");
    return { ok: false, error: err?.message || "Refund failed" };
  }
}
