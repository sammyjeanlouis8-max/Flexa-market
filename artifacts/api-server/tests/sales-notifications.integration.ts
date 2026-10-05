/** Development-only: synthetic wallet balance; no Stripe/MonCash charges or real push recipients. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, usersTable, listingsTable, categoriesTable, promoWalletTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { generateToken, hashPassword } from "../src/lib/auth";

async function main() {
  if (process.env.NODE_ENV === "production" || new URL(process.env.DATABASE_URL!).hostname.includes("ondigitalocean.com"))
    throw new Error("Development fixtures only");
  const tag = randomUUID();
  const passwordHash = await hashPassword(randomUUID());
  const [buyer, seller] = await db.insert(usersTable).values(["buyer", "seller"].map(role => ({
    name: `Notification QA ${role}`, email: `notification-${role}-${tag}@example.test`,
    country: "Haiti", isPhoneVerified: true, notifyPush: false, notifyEmail: false, passwordHash,
  }))).returning();
  const ids = [buyer.id, seller.id];
  let listingId: number | null = null;
  const api = async (path: string, userId: number, body?: object) => {
    const response = await fetch(`http://localhost:8080/api${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${generateToken(userId)}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await db.insert(promoWalletTable).values({ userId: buyer.id, balanceUsd: 100 });
    const [category] = await db.select().from(categoriesTable).limit(1);
    const [listing] = await db.insert(listingsTable).values({
      sellerId: seller.id, categoryId: category.id, title: `Notification QA ${tag}`, description: "Development fixture",
      country: "Haiti", city: "Port-au-Prince", location: "Haiti", price: 5, currency: "USD", stockQuantity: 1,
    }).returning();
    listingId = listing.id;
    const bought = await api(`/listings/${listing.id}/purchase`, buyer.id, {
      paymentMethod: "wallet", paymentRef: tag,
      shipping: { name: "Notification QA", street: "Development fixture", region: "Ouest", city: "Port-au-Prince",
        zip: "HT6110", phone: "+15555550199", country: "Haiti" },
    });
    assert.equal(bought.status, 200, JSON.stringify(bought.data));
    const [order] = await db.select().from(transactionsTable).where(eq(transactionsTable.listingId, listing.id));
    const sellerNotifications = await api("/notifications", seller.id);
    assert(sellerNotifications.data.some((n: any) => n.type === "purchase" && n.referenceId === order.id));
    assert((await api(`/orders/${order.id}`, seller.id)).status === 200);
    const shipped = await api(`/orders/${order.id}/ship`, seller.id, {
      deliveryDescription: "Development manual delivery", driverPhone: "+15555550199", driverName: "Notification QA",
    });
    assert.equal(shipped.status, 200, JSON.stringify(shipped.data));
    const buyerNotifications = await api("/notifications", buyer.id);
    assert(buyerNotifications.data.some((n: any) => n.type === "order_shipped" && n.referenceId === order.id));
    assert(buyerNotifications.data.some((n: any) => n.type === "order_confirmed" && n.referenceId === order.id));
    assert((await api(`/orders/${order.id}`, buyer.id)).status === 200);
    assert((await api("/notifications", seller.id)).data.every((n: any) => n.type !== "order_shipped"));
    console.log("PASS: wallet sale emits exact seller destination; shipment emits exact buyer destination; both order pages authorize the recipient.");
  } finally {
    await db.transaction(async tx => {
      await tx.execute(sql`DELETE FROM notifications WHERE user_id IN (${buyer.id}, ${seller.id})`);
      if (listingId) {
        await tx.execute(sql`DELETE FROM deliveries WHERE listing_id = ${listingId}`);
        await tx.execute(sql`DELETE FROM transactions WHERE listing_id = ${listingId}`);
        await tx.execute(sql`DELETE FROM listings WHERE id = ${listingId}`);
      }
      await tx.execute(sql`DELETE FROM wallet_transactions WHERE user_id IN (${buyer.id}, ${seller.id})`);
      await tx.execute(sql`DELETE FROM promo_wallets WHERE user_id IN (${buyer.id}, ${seller.id})`);
      await tx.delete(usersTable).where(sql`${usersTable.id} IN (${buyer.id}, ${seller.id})`);
    });
  }
}
main().then(() => pool.end()).catch(async error => {
  console.error(error.cause?.message ?? error.message);
  await pool.end(); process.exitCode = 1;
});
