import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { logger } from "./logger";

/**
 * Get or create a Stripe Customer for a Flexa user.
 * Clears stale test/live mode mismatches automatically.
 */
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  user: { id: number; email: string | null; name: string | null; stripeCustomerId: string | null },
): Promise<string> {
  if (user.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(user.stripeCustomerId);
      return user.stripeCustomerId;
    } catch (err: any) {
      const isStale =
        err?.code === "resource_missing"
        || (err?.message ?? "").toLowerCase().includes("no such customer")
        || (err?.message ?? "").toLowerCase().includes("test mode");
      if (!isStale) throw err;
      await db.update(usersTable)
        .set({ stripeCustomerId: null })
        .where(eq(usersTable.id, user.id));
      logger.warn(
        { userId: user.id, oldId: user.stripeCustomerId },
        "Cleared stale Stripe customer ID (test/live mode mismatch)",
      );
    }
  }

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: user.name || undefined,
    metadata: { userId: String(user.id) },
  });
  await db.update(usersTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(usersTable.id, user.id));
  return customer.id;
}
