import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  listingsTable,
  promaxRotationSnapshotsTable,
  usersTable,
} from "@workspace/db";
import { listingHasUsableImageSql } from "./listingMedia";
import { logger } from "./logger";

export const PROMAX_GROUPS = [
  "booster_vip",
  "booster_ordinary",
  "vip",
  "ordinary",
] as const;
export const PROMAX_RETRY_DELAY_MS = 60_000;

export type PromaxGroup = (typeof PROMAX_GROUPS)[number];

export type PromaxCandidate = {
  id: number;
  activeBoost: boolean;
  activeVip: boolean;
  priority?: number | null;
  createdAt?: Date | string | null;
};

export type PromaxSnapshotGroup = {
  key: PromaxGroup;
  listingIds: number[];
};

export type PromaxSnapshot = {
  hourKey: string;
  generatedAt: string;
  groups: PromaxSnapshotGroup[];
};

export type PromaxOrderMetadata = {
  group: PromaxGroup;
  position: number;
};

const PROMAX_GROUP_RANK: Record<PromaxGroup, number> = {
  booster_vip: 0,
  booster_ordinary: 1,
  vip: 2,
  ordinary: 3,
};

/**
 * Strict classification.  The order is intentional: a listing can never
 * appear in two groups, even when both paid signals are active.
 */
export function derivePromaxGroup(activeBoost: boolean, activeVip: boolean): PromaxGroup {
  if (activeBoost && activeVip) return "booster_vip";
  if (activeBoost) return "booster_ordinary";
  if (activeVip) return "vip";
  return "ordinary";
}

export function derivePromaxViewerGroup(
  activeBoost: boolean,
  paidBoost: boolean,
  placementEligible: boolean,
  activeVip: boolean,
): PromaxGroup {
  return derivePromaxGroup(activeBoost && paidBoost && placementEligible, activeVip);
}

export function deriveLegacyPromaxGroup(activeVip: boolean): PromaxGroup {
  return activeVip ? "vip" : "ordinary";
}

export function isLegacyFallbackCountryVisible(
  viewerCountry: string | null | undefined,
  listingCountry: string | null | undefined,
): boolean {
  return !viewerCountry || viewerCountry === listingCountry;
}

export function isActiveBoost(
  listing: { isBoosted?: boolean | null; boostExpiresAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  return Boolean(
    listing.isBoosted &&
      listing.boostExpiresAt &&
      new Date(listing.boostExpiresAt).getTime() > now.getTime(),
  );
}

export function isActiveVip(
  seller: { subscriptionPlan?: string | null; subscriptionExpiresAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  return Boolean(
    seller.subscriptionPlan === "vip" &&
      seller.subscriptionExpiresAt &&
      new Date(seller.subscriptionExpiresAt).getTime() > now.getTime(),
  );
}

function createdAtMs(value: Date | string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function baseOrder(items: PromaxCandidate[]): PromaxCandidate[] {
  return [...items].sort((a, b) =>
    createdAtMs(b.createdAt) - createdAtMs(a.createdAt) ||
    (b.priority ?? 0) - (a.priority ?? 0) ||
    a.id - b.id
  );
}

/**
 * Generate all four groups from a stable candidate set.  For the first
 * snapshot the existing ranking signals are retained.  Subsequent snapshots
 * retain that ranking while moving the prior leader to the back of its own
 * group.  This makes the lead rotate independently per group without
 * random/request-time behavior.
 */
export function buildPromaxSnapshot(
  candidates: PromaxCandidate[],
  hourKey: string,
  previous?: PromaxSnapshot | null,
  generatedAt: Date = new Date(),
): PromaxSnapshot {
  const byGroup = new Map<PromaxGroup, PromaxCandidate[]>();
  for (const key of PROMAX_GROUPS) byGroup.set(key, []);

  // De-duplicate at the source so one listing can never leak into two groups.
  const seen = new Set<number>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    byGroup.get(derivePromaxGroup(candidate.activeBoost, candidate.activeVip))!.push(candidate);
  }

  const previousByGroup = new Map<PromaxGroup, number[]>();
  for (const group of previous?.groups ?? []) {
    if (PROMAX_GROUPS.includes(group.key)) {
      previousByGroup.set(group.key, [...new Set(group.listingIds)]);
    }
  }

  const groups = PROMAX_GROUPS.map((key) => {
    const candidatesInGroup = byGroup.get(key)!;
    const sorted = baseOrder(candidatesInGroup);
    const candidateIds = new Set(sorted.map((item) => item.id));
    const oldIds = (previousByGroup.get(key) ?? []).filter((id) => candidateIds.has(id));
    const oldSet = new Set(oldIds);
    const newIds = sorted.filter((item) => !oldSet.has(item.id)).map((item) => item.id);

    let listingIds: number[];
    if (newIds.length > 0) {
      // Products that became eligible since the previous snapshot lead their
      // own paid/VIP/organic group. Existing group boundaries remain intact.
      listingIds = [...newIds, ...oldIds];
    } else if (oldIds.length > 1) {
      // Move the former leader behind alternatives.  The rest of the previous
      // order is retained, so referral/freshness ranking is not discarded.
      listingIds = [...oldIds.slice(1), oldIds[0], ...newIds];
    } else {
      listingIds = [...oldIds, ...newIds];
    }

    return { key, listingIds };
  });

  return {
    hourKey,
    generatedAt: generatedAt.toISOString(),
    groups,
  };
}

export function promaxHourKey(date: Date): string {
  const hour = new Date(date);
  hour.setUTCMinutes(0, 0, 0);
  return hour.toISOString();
}

export function nextPromaxHourDelayMs(nowMs: number): number {
  const hour = 60 * 60 * 1000;
  return hour - (nowMs % hour) + 25;
}

export function promaxSnapshotPruneCutoff(now: Date): Date {
  return new Date(now.getTime() - 6 * 60 * 60 * 1000);
}

export function shouldRetryPromaxStartup(
  snapshot: PromaxSnapshot | null,
  healthy: boolean,
): boolean {
  return !snapshot || !healthy;
}

export function paginatePromaxSnapshot(
  snapshot: PromaxSnapshot,
  page: number,
  limit: number,
): number[] {
  const allIds = snapshot.groups.flatMap((group) => group.listingIds);
  const start = Math.max(0, page - 1) * limit;
  return allIds.slice(start, start + limit);
}

/**
 * Legacy pagination used when PROMAX has no verified current snapshot. This
 * deliberately only slices the already-ranked query result; it never changes
 * listing data or applies paid-placement gating.
 */
export function paginateLegacyPage<T>(
  items: T[],
  page: number,
  limit: number,
): { items: T[]; total: number; totalPages: number } {
  const safeLimit = Math.max(1, limit);
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * safeLimit;
  return {
    items: items.slice(start, start + safeLimit),
    total: items.length,
    totalPages: Math.ceil(items.length / safeLimit),
  };
}

/**
 * Apply the persisted order exactly once. Legacy ranking supplies the
 * candidate input/tie order only; it must never rotate the snapshot leader.
 */
export function orderPromaxItems<T extends {
  id: number;
  group: PromaxGroup;
  legacyPosition: number;
}>(
  items: T[],
  snapshot: PromaxSnapshot,
): T[] {
  const positions = orderMetadataFor(snapshot);
  return [...items].sort((a, b) =>
    PROMAX_GROUP_RANK[a.group] - PROMAX_GROUP_RANK[b.group] ||
    (positions.get(a.id)?.position ?? -1) -
      (positions.get(b.id)?.position ?? -1) ||
    a.legacyPosition - b.legacyPosition
  );
}

export function pinPromaxFreshItems<T extends { id: number }>(
  items: T[],
  snapshot: PromaxSnapshot,
  pinnedFreshIds?: ReadonlySet<number>,
): { items: T[]; freshIds: number[] } {
  const snapshotIds = new Set(snapshot.groups.flatMap((group) => group.listingIds));
  const freshIds = pinnedFreshIds
    ? [...pinnedFreshIds]
    : items.filter((item) => !snapshotIds.has(item.id)).map((item) => item.id);
  const allowedFreshIds = new Set(freshIds);
  return {
    items: items.filter((item) => snapshotIds.has(item.id) || allowedFreshIds.has(item.id)),
    freshIds,
  };
}

function toSnapshot(row: typeof promaxRotationSnapshotsTable.$inferSelect): PromaxSnapshot {
  const rawGroups = Array.isArray(row.groups) ? row.groups : [];
  return {
    hourKey: row.hourKey,
    generatedAt: row.generatedAt.toISOString(),
    groups: PROMAX_GROUPS.map((key) => {
      const found = rawGroups.find((group: any) => group?.key === key);
      return { key, listingIds: Array.isArray(found?.listingIds) ? found.listingIds : [] };
    }),
  };
}

export class PromaxSnapshotCache {
  private current: PromaxSnapshot | null = null;
  private readonly history = new Map<string, PromaxSnapshot>();

  rememberHistorical(snapshot: PromaxSnapshot): void {
    this.history.set(snapshot.hourKey, snapshot);
    if (this.history.size > 4) {
      const oldest = [...this.history.keys()].sort()[0];
      this.history.delete(oldest);
    }
  }

  rememberCurrent(snapshot: PromaxSnapshot): void {
    this.current = snapshot;
    this.rememberHistorical(snapshot);
  }

  getCurrent(): PromaxSnapshot | null {
    return this.current;
  }

  getHistorical(hourKey: string): PromaxSnapshot | null {
    return this.history.get(hourKey) ?? null;
  }

  getForHour(hourKey?: string): PromaxSnapshot | null {
    if (!hourKey || hourKey === this.current?.hourKey) return this.current;
    return this.getHistorical(hourKey);
  }
}

const snapshotCache = new PromaxSnapshotCache();
let workerStarted = false;
let lastGenerationHealthy = false;
let startPromise: Promise<boolean> | null = null;
let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function rememberSnapshot(snapshot: PromaxSnapshot): void {
  snapshotCache.rememberCurrent(snapshot);
}

function orderMetadataFor(snapshot: PromaxSnapshot | null): Map<number, PromaxOrderMetadata> {
  const result = new Map<number, PromaxOrderMetadata>();
  for (const group of snapshot?.groups ?? []) {
    group.listingIds.forEach((id, position) => {
      if (!result.has(id)) result.set(id, { group: group.key, position });
    });
  }
  return result;
}

export function getPromaxOrderMetadata(): Map<number, PromaxOrderMetadata> {
  return orderMetadataFor(snapshotCache.getCurrent());
}

export async function getPromaxOrderMetadataForHour(hourKey?: string): Promise<{
  snapshot: PromaxSnapshot | null;
  order: Map<number, PromaxOrderMetadata>;
}> {
  if (!hourKey || hourKey === snapshotCache.getCurrent()?.hourKey) {
    return { snapshot: snapshotCache.getCurrent(), order: getPromaxOrderMetadata() };
  }
  const inMemory = snapshotCache.getForHour(hourKey);
  if (inMemory) return { snapshot: inMemory, order: orderMetadataFor(inMemory) };
  try {
    const [row] = await db.select().from(promaxRotationSnapshotsTable)
      .where(eq(promaxRotationSnapshotsTable.hourKey, hourKey)).limit(1);
    if (!row) return { snapshot: null, order: new Map() };
    const snapshot = toSnapshot(row);
    // Historical page-token lookup must not replace the current unpinned
    // snapshot. It is only retained for future lookups of that token.
    snapshotCache.rememberHistorical(snapshot);
    return { snapshot, order: orderMetadataFor(snapshot) };
  } catch (error) {
    logger.warn({ err: error, hourKey }, "PROMAX requested snapshot token unavailable");
    return { snapshot: null, order: new Map() };
  }
}

export function getCachedPromaxSnapshot(): PromaxSnapshot | null {
  return snapshotCache.getCurrent();
}

export async function generatePromaxSnapshot(now: Date = new Date()): Promise<PromaxSnapshot | null> {
  const hourKey = promaxHourKey(now);
  lastGenerationHealthy = false;
  try {
    const snapshot = await db.transaction(async (tx) => {
      // The transaction-scoped lock serializes replicas.  The second replica
      // sees the row written by the first and returns it without regeneration.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('flexa_promax_rotation', 0))`);
      const [existing] = await tx.select().from(promaxRotationSnapshotsTable)
        .where(eq(promaxRotationSnapshotsTable.hourKey, hourKey)).limit(1);
      if (existing) return toSnapshot(existing);
      const [previous] = await tx.select().from(promaxRotationSnapshotsTable)
        .orderBy(desc(promaxRotationSnapshotsTable.generatedAt)).limit(1);

      const rows = await tx
        .select({
          id: listingsTable.id,
          isBoosted: listingsTable.isBoosted,
          boostExpiresAt: listingsTable.boostExpiresAt,
          createdAt: listingsTable.createdAt,
          referralPoints: usersTable.referralPoints,
          subscriptionPlan: usersTable.subscriptionPlan,
          subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
          paidBoost: sql<boolean>`EXISTS (
            SELECT 1 FROM boosts b
            WHERE b.listing_id = ${listingsTable.id}
              AND b.payment_status = 'paid'
              AND b.expires_at > ${now}
          )`,
        })
        .from(listingsTable)
        .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
        .where(and(
          eq(listingsTable.status, "available"),
          eq(listingsTable.moderationStatus, "approved"),
          listingHasUsableImageSql(),
          or(isNull(listingsTable.stockQuantity), sql`${listingsTable.stockQuantity} > 0`),
        ));

      const generated = buildPromaxSnapshot(rows.map((row) => ({
        id: row.id,
        activeBoost: isActiveBoost(row, now) && Boolean(row.paidBoost),
        activeVip: isActiveVip(row, now),
        // Referral/subscription remain deterministic tie-breakers after
        // freshness; paid boost and VIP separation still happens by group.
        priority:
          (row.referralPoints ?? 0) * 1_000_000 +
          (row.subscriptionPlan === "vip" ? 30 : row.subscriptionPlan === "premium" ? 20 : row.subscriptionPlan === "standard" ? 10 : 0),
        createdAt: row.createdAt,
      })), hourKey, previous ? toSnapshot(previous) : null, now);

      const [persisted] = await tx
        .insert(promaxRotationSnapshotsTable)
        .values({
          hourKey,
          generatedAt: now,
          groups: generated.groups,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: promaxRotationSnapshotsTable.hourKey,
          set: {
            hourKey,
            generatedAt: now,
            groups: generated.groups,
            updatedAt: now,
          },
          })
        .returning();
      if (!persisted || persisted.hourKey !== hourKey) {
        throw new Error("PROMAX snapshot persistence verification failed");
      }
      const pruneCutoff = promaxSnapshotPruneCutoff(now);
      await tx.delete(promaxRotationSnapshotsTable)
        .where(sql`${promaxRotationSnapshotsTable.generatedAt} < ${pruneCutoff}`);
      return generated;
    });
    lastGenerationHealthy = true;
    rememberSnapshot(snapshot);
    logger.info({ hourKey, groups: snapshot.groups.map((group) => ({ key: group.key, count: group.listingIds.length })) }, "PROMAX rotation snapshot ready");
    return snapshot;
  } catch (error) {
    lastGenerationHealthy = false;
    logger.error({ err: error, hourKey }, "PROMAX rotation generation failed; retaining last snapshot");
    if (snapshotCache.getCurrent()) return snapshotCache.getCurrent();
    try {
      const [last] = await db.select().from(promaxRotationSnapshotsTable)
        .orderBy(desc(promaxRotationSnapshotsTable.generatedAt)).limit(1);
      if (last) {
        rememberSnapshot(toSnapshot(last));
        return snapshotCache.getCurrent();
      }
    } catch (fallbackError) {
      logger.error({ err: fallbackError }, "PROMAX last snapshot fallback failed");
    }
    return null;
  }
}

export async function startPromaxRotationWorker(): Promise<boolean> {
  if (workerStarted) return true;
  if (startPromise) return startPromise;
  startPromise = (async () => {
    const initial = await generatePromaxSnapshot();
    if (shouldRetryPromaxStartup(initial, lastGenerationHealthy)) {
      logger.warn("PROMAX worker not started because the required snapshot table is unavailable");
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void startPromaxRotationWorker();
        }, PROMAX_RETRY_DELAY_MS);
        retryTimer.unref();
      }
      return false;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    workerStarted = true;
    const scheduleNext = () => {
      if (boundaryTimer) return;
      const delay = nextPromaxHourDelayMs(Date.now());
      boundaryTimer = setTimeout(() => {
        boundaryTimer = null;
        void generatePromaxSnapshot().finally(scheduleNext);
      }, delay);
      boundaryTimer.unref();
    };
    scheduleNext();
    return true;
  })().finally(() => {
    startPromise = null;
  });
  return startPromise;
}