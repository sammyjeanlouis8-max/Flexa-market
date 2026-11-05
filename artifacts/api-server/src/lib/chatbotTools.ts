/**
 * Read-only, owner-scoped tools for FlexaBot.
 * Never expose unrestricted DB access to the model.
 */
import {
  db,
  listingsTable,
  transactionsTable,
  usersTable,
  boostsTable,
  promoWalletTable,
  deliveriesTable,
} from "@workspace/db";
import { and, desc, eq, or } from "drizzle-orm";
import { logger } from "./logger";
import { FLEXA_DEEP_LINKS } from "./chatbotKnowledge";
import {
  accountGuidanceTool,
  escalateTool,
  type ChatbotIntent,
  type ToolResult,
} from "./chatbotIntent";

export type { ChatbotIntent, ToolResult } from "./chatbotIntent";
export {
  classifyIntent,
  sanitizeUserQuery,
  formatToolBlock,
} from "./chatbotIntent";

const ORDER_ID_RE = /\b(?:order|commande|komann|#)\s*#?\s*(\d{1,10})\b/i;
const LISTING_ID_RE = /\b(?:listing|product|pwodwi|anons|#)\s*#?\s*(\d{1,10})\b/i;

function extractId(re: RegExp, text: string): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function redactSensitive(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value
      .replace(/\b\d{13,19}\b/g, "[redacted]")
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");
  }
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|token|secret|cvv|ssn|private/i.test(k)) continue;
      out[k] = redactSensitive(v);
    }
    return out;
  }
  return value;
}

async function toolOrders(userId: number, query: string): Promise<ToolResult> {
  const orderId = extractId(ORDER_ID_RE, query);
  try {
    if (orderId) {
      const [row] = await db
        .select({
          id: transactionsTable.id,
          type: transactionsTable.type,
          amount: transactionsTable.amount,
          currency: transactionsTable.currency,
          paymentStatus: transactionsTable.paymentStatus,
          orderStatus: transactionsTable.orderStatus,
          trackingNumber: transactionsTable.trackingNumber,
          carrier: transactionsTable.carrier,
          trackingStatus: transactionsTable.trackingStatus,
          listingCountry: transactionsTable.listingCountry,
          createdAt: transactionsTable.createdAt,
          buyerId: transactionsTable.userId,
          listingId: transactionsTable.listingId,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.id, orderId))
        .limit(1);

      if (!row) return { tool: "get_order", ok: false, error: "Order not found", deepLinks: [FLEXA_DEEP_LINKS.orders] };

      let isSeller = false;
      if (row.listingId) {
        const [listing] = await db
          .select({ sellerId: listingsTable.sellerId })
          .from(listingsTable)
          .where(eq(listingsTable.id, row.listingId))
          .limit(1);
        isSeller = listing?.sellerId === userId;
      }
      if (row.buyerId !== userId && !isSeller) {
        return { tool: "get_order", ok: false, error: "Not authorized for this order", deepLinks: [FLEXA_DEEP_LINKS.orders] };
      }

      return {
        tool: "get_order",
        ok: true,
        data: redactSensitive({
          id: row.id,
          type: row.type,
          amount: row.amount,
          currency: row.currency,
          paymentStatus: row.paymentStatus,
          orderStatus: row.orderStatus,
          trackingNumber: row.trackingNumber,
          carrier: row.carrier,
          trackingStatus: row.trackingStatus,
          listingCountry: row.listingCountry,
          createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
          role: row.buyerId === userId ? "buyer" : "seller",
        }),
        deepLinks: [`/orders/${row.id}`, FLEXA_DEEP_LINKS.orders],
      };
    }

    const rows = await db
      .select({
        id: transactionsTable.id,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        orderStatus: transactionsTable.orderStatus,
        paymentStatus: transactionsTable.paymentStatus,
        createdAt: transactionsTable.createdAt,
        listingId: transactionsTable.listingId,
      })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.type, "purchase")))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(5);

    return {
      tool: "list_my_orders",
      ok: true,
      data: redactSensitive(
        rows.map((r) => ({
          id: r.id,
          amount: r.amount,
          currency: r.currency,
          orderStatus: r.orderStatus,
          paymentStatus: r.paymentStatus,
          listingId: r.listingId,
          createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
        })),
      ),
      deepLinks: [FLEXA_DEEP_LINKS.orders],
    };
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "chatbot toolOrders failed");
    return { tool: "orders", ok: false, error: "Order lookup temporarily unavailable", deepLinks: [FLEXA_DEEP_LINKS.orders] };
  }
}

async function toolWallet(userId: number): Promise<ToolResult> {
  try {
    const [pw] = await db
      .select({
        balanceUsd: promoWalletTable.balanceUsd,
        promoBalance: promoWalletTable.promoBalance,
        unlockedBalance: promoWalletTable.unlockedBalance,
      })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId))
      .limit(1);

    return {
      tool: "wallet_summary",
      ok: true,
      data: redactSensitive({
        walletBalanceUsd: pw?.balanceUsd ?? 0,
        promoBalanceUsd: pw?.promoBalance ?? 0,
        unlockedBalanceUsd: pw?.unlockedBalance ?? 0,
        currency: "USD",
      }),
      deepLinks: [FLEXA_DEEP_LINKS.wallet, FLEXA_DEEP_LINKS.payments],
    };
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "chatbot toolWallet failed");
    return { tool: "wallet_summary", ok: false, error: "Wallet lookup unavailable", deepLinks: [FLEXA_DEEP_LINKS.wallet] };
  }
}

async function toolSubscription(userId: number): Promise<ToolResult> {
  try {
    const [user] = await db
      .select({
        subscriptionPlan: usersTable.subscriptionPlan,
        subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const expired =
      user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date();

    return {
      tool: "subscription_summary",
      ok: true,
      data: {
        plan: expired ? "basic" : (user?.subscriptionPlan ?? "basic"),
        expiresAt: user?.subscriptionExpiresAt?.toISOString?.() ?? null,
        expired: Boolean(expired),
        note: "Plan prices and benefits are shown on the Subscription screen — do not invent fees.",
      },
      deepLinks: [FLEXA_DEEP_LINKS.subscription],
    };
  } catch {
    return { tool: "subscription_summary", ok: false, error: "Subscription lookup unavailable", deepLinks: [FLEXA_DEEP_LINKS.subscription] };
  }
}

async function toolListings(userId: number): Promise<ToolResult> {
  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        status: listingsTable.status,
        moderationStatus: listingsTable.moderationStatus,
        price: listingsTable.price,
        currency: listingsTable.currency,
        isBoosted: listingsTable.isBoosted,
      })
      .from(listingsTable)
      .where(eq(listingsTable.sellerId, userId))
      .orderBy(desc(listingsTable.createdAt))
      .limit(8);

    return {
      tool: "my_listings",
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        moderationStatus: r.moderationStatus,
        price: r.price,
        currency: r.currency,
        isBoosted: r.isBoosted,
      })),
      deepLinks: [FLEXA_DEEP_LINKS.sell, "/profile"],
    };
  } catch {
    return { tool: "my_listings", ok: false, error: "Listings lookup unavailable", deepLinks: [FLEXA_DEEP_LINKS.sell] };
  }
}

async function toolBoosts(userId: number): Promise<ToolResult> {
  try {
    const rows = await db
      .select({
        id: boostsTable.id,
        listingId: boostsTable.listingId,
        paymentStatus: boostsTable.paymentStatus,
        plan: boostsTable.plan,
        expiresAt: boostsTable.expiresAt,
        createdAt: boostsTable.createdAt,
      })
      .from(boostsTable)
      .where(eq(boostsTable.userId, userId))
      .orderBy(desc(boostsTable.createdAt))
      .limit(5);

    return {
      tool: "my_boosts",
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        listingId: r.listingId,
        paymentStatus: r.paymentStatus,
        plan: r.plan,
        expiresAt: r.expiresAt?.toISOString?.() ?? r.expiresAt,
        createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
      })),
      deepLinks: [FLEXA_DEEP_LINKS.boost],
    };
  } catch {
    return { tool: "my_boosts", ok: false, error: "Boost lookup unavailable", deepLinks: [FLEXA_DEEP_LINKS.boost] };
  }
}

async function toolDelivery(userId: number, query: string): Promise<ToolResult> {
  try {
    const rows = await db
      .select({
        id: deliveriesTable.id,
        status: deliveriesTable.status,
        transactionId: deliveriesTable.transactionId,
        createdAt: deliveriesTable.createdAt,
      })
      .from(deliveriesTable)
      .where(
        or(
          eq(deliveriesTable.buyerId, userId),
          eq(deliveriesTable.sellerId, userId),
          eq(deliveriesTable.driverUserId, userId),
        ),
      )
      .orderBy(desc(deliveriesTable.createdAt))
      .limit(5);

    return {
      tool: "my_deliveries",
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        status: r.status,
        orderId: r.transactionId,
        createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
      })),
      deepLinks: [FLEXA_DEEP_LINKS.orders, FLEXA_DEEP_LINKS.delivery],
    };
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "chatbot toolDelivery failed");
    return toolOrders(userId, query);
  }
}

async function toolPublicListing(query: string): Promise<ToolResult> {
  const listingId = extractId(LISTING_ID_RE, query);
  if (!listingId) {
    return { tool: "public_listing", ok: false, error: "No listing id in question", deepLinks: ["/"] };
  }
  try {
    const [row] = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        price: listingsTable.price,
        currency: listingsTable.currency,
        status: listingsTable.status,
        moderationStatus: listingsTable.moderationStatus,
        city: listingsTable.city,
        country: listingsTable.country,
        stockQuantity: listingsTable.stockQuantity,
      })
      .from(listingsTable)
      .where(eq(listingsTable.id, listingId))
      .limit(1);

    if (!row || row.status !== "available" || row.moderationStatus !== "approved") {
      return {
        tool: "public_listing",
        ok: false,
        error: "Listing not available in public catalog",
        deepLinks: ["/"],
      };
    }

    return {
      tool: "public_listing",
      ok: true,
      data: {
        id: row.id,
        title: row.title,
        price: row.price,
        currency: row.currency,
        city: row.city,
        country: row.country,
        stockQuantity: row.stockQuantity,
        available: true,
      },
      deepLinks: [`/listing/${row.id}`],
    };
  } catch {
    return { tool: "public_listing", ok: false, error: "Listing lookup unavailable", deepLinks: ["/"] };
  }
}

export async function runSupportTools(opts: {
  userId: number;
  query: string;
  intent: ChatbotIntent;
}): Promise<{ results: ToolResult[]; deepLinks: string[] }> {
  const results: ToolResult[] = [];
  const { userId, query, intent } = opts;

  switch (intent) {
    case "orders":
      results.push(await toolOrders(userId, query));
      break;
    case "delivery":
      results.push(await toolDelivery(userId, query));
      break;
    case "wallet":
      results.push(await toolWallet(userId));
      break;
    case "subscription":
      results.push(await toolSubscription(userId));
      break;
    case "listings":
      results.push(await toolListings(userId));
      break;
    case "boosts":
      results.push(await toolBoosts(userId));
      break;
    case "product":
      results.push(await toolPublicListing(query));
      break;
    case "account":
      results.push(accountGuidanceTool());
      break;
    case "escalate":
      results.push(escalateTool());
      break;
    case "policy":
    case "general":
    default:
      break;
  }

  const deepLinks = Array.from(new Set(results.flatMap((r) => r.deepLinks)));
  return { results, deepLinks };
}
