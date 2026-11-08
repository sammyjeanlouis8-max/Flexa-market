import { db, boostsTable, boostDailyImpressionsTable, boostAnalyticsEventsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/** Delivery pacing used across Flexa Boost (~200 impressions per $1). */
export const IMPRESSIONS_PER_USD = 200;

export const BOOST_EVENT_TYPES = [
  "impression",
  "video_view",
  "product_click",
  "add_to_cart",
  "checkout_start",
  "purchase",
  "share",
  "save",
  "skip",
  "watch_progress",
] as const;

export type BoostEventType = (typeof BOOST_EVENT_TYPES)[number];

export const BOOST_TRAFFIC_SOURCES = [
  "promo_feed",
  "homepage",
  "product_page",
  "search",
  "seller_profile",
  "shared_link",
  "dm",
  "other",
] as const;

export type BoostTrafficSource = (typeof BOOST_TRAFFIC_SOURCES)[number];

export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function estimatedSpendUsd(impressions: number, budgetCap?: number | null): number {
  const raw = Math.round((Math.max(0, impressions) / IMPRESSIONS_PER_USD) * 100) / 100;
  if (budgetCap != null && Number.isFinite(budgetCap) && budgetCap >= 0) {
    return Math.min(budgetCap, raw);
  }
  return raw;
}

export function normalizeTrafficSource(raw: unknown): BoostTrafficSource {
  const s = String(raw ?? "").trim().toLowerCase();
  if ((BOOST_TRAFFIC_SOURCES as readonly string[]).includes(s)) return s as BoostTrafficSource;
  return "other";
}

export function normalizeEventType(raw: unknown): BoostEventType | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if ((BOOST_EVENT_TYPES as readonly string[]).includes(s)) return s as BoostEventType;
  if (s === "view") return "impression";
  if (s === "click" || s === "buy_click") return "product_click";
  return null;
}

export function metric(value: number | null | undefined, available: boolean, note?: string) {
  if (!available || value == null || !Number.isFinite(Number(value))) {
    return { value: null as number | null, available: false as const, note: note ?? "Not available" };
  }
  return { value: Number(value), available: true as const, note: note ?? undefined };
}

/** Resolve the active paid boost row for a listing (newest first). */
export async function findActiveBoostForListing(listingId: number) {
  const [row] = await db
    .select({
      id: boostsTable.id,
      listingId: boostsTable.listingId,
      userId: boostsTable.userId,
      budget: boostsTable.budget,
      expiresAt: boostsTable.expiresAt,
    })
    .from(boostsTable)
    .where(
      and(
        eq(boostsTable.listingId, listingId),
        eq(boostsTable.paymentStatus, "paid"),
        sql`${boostsTable.expiresAt} > now()`,
        sql`COALESCE(${boostsTable.campaignStatus}, 'active') <> 'paused'`,
      ),
    )
    .orderBy(sql`${boostsTable.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

export type RecordBoostEventInput = {
  boostId: number;
  listingId: number;
  eventType: BoostEventType;
  source?: BoostTrafficSource | string;
  viewerKey?: string | null;
  viewerUserId?: number | null;
  country?: string | null;
  region?: string | null;
  device?: string | null;
  progressMarker?: number | null;
  watchMs?: number | null;
  amountUsd?: number | null;
  searchQuery?: string | null;
  dedupeKey?: string | null;
  /** Also bump legacy counters on boosts / daily impressions. Default true. */
  bumpCounters?: boolean;
};

/**
 * Insert a granular analytics event (deduped) and optionally bump legacy counters.
 * Returns whether a new event row was inserted.
 */
export async function recordBoostEvent(input: RecordBoostEventInput): Promise<{ inserted: boolean }> {
  const source = normalizeTrafficSource(input.source);
  const dedupeKey = input.dedupeKey?.trim().slice(0, 120) || null;

  try {
    const inserted = await db
      .insert(boostAnalyticsEventsTable)
      .values({
        boostId: input.boostId,
        listingId: input.listingId,
        eventType: input.eventType,
        source,
        viewerKey: input.viewerKey?.slice(0, 80) || null,
        viewerUserId: input.viewerUserId ?? null,
        country: input.country?.slice(0, 80) || null,
        region: input.region?.slice(0, 120) || null,
        device: input.device?.slice(0, 40) || null,
        progressMarker: input.progressMarker ?? null,
        watchMs: input.watchMs ?? null,
        amountUsd: input.amountUsd ?? null,
        searchQuery: input.searchQuery?.trim().slice(0, 120) || null,
        dedupeKey,
      })
      .onConflictDoNothing()
      .returning({ id: boostAnalyticsEventsTable.id });

    const didInsert = inserted.length > 0;
    if (!didInsert || input.bumpCounters === false) {
      return { inserted: didInsert };
    }

    if (input.eventType === "impression") {
      await db.execute(
        sql`UPDATE boosts SET impressions = impressions + 1 WHERE id = ${input.boostId}`,
      );
      const date = utcDateKey();
      await db
        .insert(boostDailyImpressionsTable)
        .values({ boostId: input.boostId, date, impressionCount: 1 })
        .onConflictDoUpdate({
          target: [boostDailyImpressionsTable.boostId, boostDailyImpressionsTable.date],
          set: { impressionCount: sql`${boostDailyImpressionsTable.impressionCount} + 1` },
        });
    } else if (input.eventType === "video_view") {
      await db.execute(
        sql`UPDATE boosts SET video_views = video_views + 1 WHERE id = ${input.boostId}`,
      );
    } else if (input.eventType === "product_click") {
      await db.execute(sql`UPDATE boosts SET clicks = clicks + 1 WHERE id = ${input.boostId}`);
    } else if (input.eventType === "skip") {
      await db.execute(sql`UPDATE boosts SET skips = skips + 1 WHERE id = ${input.boostId}`);
    }

    return { inserted: true };
  } catch (err) {
    logger.warn({ err, boostId: input.boostId, eventType: input.eventType }, "recordBoostEvent failed");
    throw err;
  }
}
