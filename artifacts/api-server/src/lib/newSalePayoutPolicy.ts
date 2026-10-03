import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isStripeOnlySale, getNewSaleStripeCountry, requireActiveStripeDestination } from "./usSellerPayoutPolicy";

export const NEW_SALE_PAYOUT_ERROR = "Vandè a poko gen yon kont Stripe ki pare pou resevwa lajan lavant sa a. Pa gen lòd ki kreye ni debi nan bous ou.";

/** Call before payment/session creation or wallet debit, and freeze the result on the new order. */
export async function requireNewSalePayout(
  listing: { sellerId: number; country?: string | null; requiresStripePayout?: boolean | null },
): Promise<boolean> {
  const [seller] = await db.select({
    country: usersTable.country,
    stripeAccountId: usersTable.stripeAccountId,
  }).from(usersTable).where(eq(usersTable.id, listing.sellerId));
  if (!seller) throw new Error("SELLER_NOT_FOUND");
  const required = !!listing.requiresStripePayout || isStripeOnlySale(seller.country, listing.country);
  if (required) await requireActiveStripeDestination(seller.stripeAccountId, getNewSaleStripeCountry(seller.country, listing.country));
  return required;
}