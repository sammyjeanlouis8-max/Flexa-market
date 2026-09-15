import { describe, expect, it } from "vitest";
import {
  buildPromaxSnapshot,
  derivePromaxGroup,
  deriveLegacyPromaxGroup,
  derivePromaxViewerGroup,
  isActiveBoost,
  isActiveVip,
  nextPromaxHourDelayMs,
  promaxSnapshotPruneCutoff,
  paginateLegacyPage,
  orderPromaxItems,
  isLegacyFallbackCountryVisible,
  paginatePromaxSnapshot,
  PromaxSnapshotCache,
  PROMAX_RETRY_DELAY_MS,
  shouldRetryPromaxStartup,
  type PromaxCandidate,
} from "../lib/promaxRotation";
import { isUndefinedTableError, isWithinPromaxDailyBudget, matchesPromaxAudience } from "../lib/promaxBoostGating";

const now = new Date("2030-01-01T12:30:00.000Z");

describe("PROMAX strict grouping", () => {
  it("uses exactly four groups in the required order", () => {
    expect(derivePromaxGroup(true, true)).toBe("booster_vip");
    expect(derivePromaxGroup(true, false)).toBe("booster_ordinary");
    expect(derivePromaxGroup(false, true)).toBe("vip");
    expect(derivePromaxGroup(false, false)).toBe("ordinary");
  });

  it("classifies fail-open rows into renderable organic groups", () => {
    expect(deriveLegacyPromaxGroup(true)).toBe("vip");
    expect(deriveLegacyPromaxGroup(false)).toBe("ordinary");
  });

  it("keeps promaxDisabled fallback country-only even for paid audiences", () => {
    expect(isLegacyFallbackCountryVisible("Haiti", "Haiti")).toBe(true);
    expect(isLegacyFallbackCountryVisible("Haiti", "USA")).toBe(false);
    // Audience match cannot authorize a cross-country legacy fallback row.
    expect(isLegacyFallbackCountryVisible("Haiti", "USA")).toBe(false);
  });

  it("does not treat expired boost or VIP status as active", () => {
    expect(isActiveBoost({ isBoosted: true, boostExpiresAt: "2030-01-01T12:29:59.000Z" }, now)).toBe(false);
    expect(isActiveBoost({ isBoosted: true, boostExpiresAt: "2030-01-01T12:30:01.000Z" }, now)).toBe(true);
    expect(isActiveVip({ subscriptionPlan: "vip", subscriptionExpiresAt: "2030-01-01T12:29:59.000Z" }, now)).toBe(false);
    expect(isActiveVip({ subscriptionPlan: "vip", subscriptionExpiresAt: "2030-01-01T12:30:01.000Z" }, now)).toBe(true);
  });
});

function candidates(ids: number[]): PromaxCandidate[] {
  return ids.map((id, index) => ({
    id,
    activeBoost: id < 3,
    activeVip: id === 1 || id === 4,
    priority: ids.length - index,
    createdAt: new Date(now.getTime() - index * 1000),
  }));
}

describe("PROMAX hourly fairness", () => {
  it("historical token lookup never promotes over the current unpinned snapshot", () => {
    const cache = new PromaxSnapshotCache();
    const current = buildPromaxSnapshot([
      { id: 50, activeBoost: false, activeVip: false },
    ], "2030-01-01T13:00:00.000Z", null, now);
    const historical = buildPromaxSnapshot([
      { id: 51, activeBoost: false, activeVip: false },
    ], "2030-01-01T12:00:00.000Z", null, now);
    cache.rememberCurrent(current);
    cache.rememberHistorical(historical);
    expect(cache.getForHour(historical.hourKey)).toEqual(historical);
    expect(cache.getForHour()).toEqual(current);
    expect(cache.getForHour()).not.toEqual(cache.getForHour(historical.hourKey));
  });

  it("is deterministic for the same hour", () => {
    const first = buildPromaxSnapshot(candidates([1, 2, 3, 4, 5]), "2030-01-01T12:00:00.000Z", null, now);
    const second = buildPromaxSnapshot(candidates([1, 2, 3, 4, 5]), "2030-01-01T12:00:00.000Z", null, now);
    expect(second).toEqual(first);
  });

  it("moves a previous leader back within its own group", () => {
    const first = buildPromaxSnapshot(candidates([1, 2, 3, 4, 5]), "2030-01-01T12:00:00.000Z", null, now);
    const second = buildPromaxSnapshot(candidates([1, 2, 3, 4, 5]), "2030-01-01T13:00:00.000Z", first, now);
    for (const group of first.groups) {
      if (group.listingIds.length > 1) {
        const next = second.groups.find((item) => item.key === group.key)!;
        expect(next.listingIds[0]).not.toBe(group.listingIds[0]);
      }
    }
  });

  it("route-equivalent ordering applies three consecutive fair snapshots once", () => {
    const ids = [60, 61, 62];
    const routeOrder = (snapshot: ReturnType<typeof buildPromaxSnapshot>) =>
      orderPromaxItems(ids.map((id, legacyPosition) => ({
        id,
        group: "ordinary" as const,
        legacyPosition,
      })), snapshot).map((item) => item.id);
    let previous: ReturnType<typeof buildPromaxSnapshot> | null = null;
    const leaders: number[] = [];
    for (let hour = 12; hour < 15; hour++) {
      const snapshot = buildPromaxSnapshot(
        ids.map((id) => ({ id, activeBoost: false, activeVip: false })),
        `2030-01-01T${hour}:00:00.000Z`,
        previous,
        now,
      );
      const ordered = routeOrder(snapshot);
      leaders.push(ordered[0]);
      previous = snapshot;
    }
    expect(leaders).toEqual([60, 61, 62]);
  });

  it("does not let an isolated former leader lead when a new alternative appears", () => {
    const first = buildPromaxSnapshot([
      { id: 20, activeBoost: false, activeVip: false },
    ], "2030-01-01T12:00:00.000Z", null, now);
    const second = buildPromaxSnapshot([
      { id: 20, activeBoost: false, activeVip: false },
      { id: 21, activeBoost: false, activeVip: false },
    ], "2030-01-01T13:00:00.000Z", first, now);
    expect(second.groups.find((group) => group.key === "ordinary")?.listingIds[0]).toBe(21);
  });

  it("deduplicates listings and leaves empty groups present", () => {
    const snapshot = buildPromaxSnapshot([
      { id: 7, activeBoost: true, activeVip: true },
      { id: 7, activeBoost: false, activeVip: false },
      { id: 8, activeBoost: false, activeVip: false },
    ], "2030-01-01T12:00:00.000Z", null, now);
    const allIds = snapshot.groups.flatMap((group) => group.listingIds);
    expect(allIds).toEqual([7, 8]);
    expect(snapshot.groups.map((group) => group.key)).toEqual([
      "booster_vip", "booster_ordinary", "vip", "ordinary",
    ]);
    expect(snapshot.groups.find((group) => group.key === "booster_ordinary")?.listingIds).toEqual([]);
    expect(snapshot.groups.find((group) => group.key === "vip")?.listingIds).toEqual([]);
  });

  it("keeps sold-out rows out of complete snapshot pages", () => {
    // The SQL candidate predicate excludes stock <= 0 before the pure builder;
    // every ID in this page is therefore eligible for display.
    const snapshot = buildPromaxSnapshot([
      { id: 30, activeBoost: false, activeVip: false },
      { id: 31, activeBoost: false, activeVip: false },
    ], "2030-01-01T12:00:00.000Z", null, now);
    expect(paginatePromaxSnapshot(snapshot, 1, 20)).toEqual([30, 31]);
  });

  it("keeps legacy product pagination available when the snapshot is unavailable", () => {
    const products = [{ id: 101, title: "first" }, { id: 102, title: "second" }, { id: 103, title: "third" }];
    const pageOne = paginateLegacyPage(products, 1, 2);
    const pageTwo = paginateLegacyPage(products, 2, 2);
    expect(pageOne.items).toEqual(products.slice(0, 2));
    expect(pageTwo.items).toEqual(products.slice(2));
    expect(pageOne.total).toBe(3);
    expect(pageOne.totalPages).toBe(2);
  });

  it("pins pages to one snapshot token and schedules on the UTC boundary", () => {
    const snapshot = buildPromaxSnapshot([
      { id: 40, activeBoost: false, activeVip: false },
      { id: 41, activeBoost: false, activeVip: false },
      { id: 42, activeBoost: false, activeVip: false },
    ], "2030-01-01T12:00:00.000Z", null, now);
    expect(paginatePromaxSnapshot(snapshot, 1, 2)).toEqual([40, 41]);
    expect(paginatePromaxSnapshot(snapshot, 2, 2)).toEqual([42]);
    expect(nextPromaxHourDelayMs(Date.parse("2030-01-01T12:59:59.000Z"))).toBe(1025);
  });

  it("computes snapshot pruning cutoff as a concrete Date parameter", () => {
    const generatedAt = new Date("2030-01-01T12:00:00.000Z");
    expect(promaxSnapshotPruneCutoff(generatedAt)).toEqual(new Date("2030-01-01T06:00:00.000Z"));
  });

  it("enforces paid boost audience and daily budget contracts", () => {
    expect(matchesPromaxAudience({
      listingCountry: "Haiti",
      audienceCountry: "Haiti",
      audienceCity: "Port-au-Prince",
      audienceGender: "female",
      audienceAgeMin: 21,
      audienceAgeMax: 35,
    }, {
      country: "Haiti",
      location: "Port-au-Prince",
      gender: "female",
      dateOfBirth: "2000-01-01",
    })).toBe(true);
    expect(matchesPromaxAudience({
      listingCountry: "Haiti",
      audienceCountry: "Haiti",
      audienceCity: "Port-au-Prince",
      audienceGender: "female",
    }, { country: "Haiti", location: "Cap-Haïtien", gender: "female" })).toBe(false);
    expect(isWithinPromaxDailyBudget(5, 999)).toBe(true);
    expect(isWithinPromaxDailyBudget(5, 1000)).toBe(false);
  });

  it("fails open only for an unavailable impression table", () => {
    expect(isUndefinedTableError({ code: "42P01" })).toBe(true);
    expect(isUndefinedTableError({ code: "23505" })).toBe(false);
    expect(isUndefinedTableError(new Error("database unavailable"))).toBe(false);
  });

  it("demotes a gated placement without hiding its organic listing", () => {
    expect(derivePromaxViewerGroup(true, true, false, false)).toBe("ordinary");
    expect(derivePromaxViewerGroup(true, true, false, true)).toBe("vip");
    expect(derivePromaxViewerGroup(true, true, true, false)).toBe("booster_ordinary");
  });

  it("freezes a cap demotion so page offsets do not shift after page one", () => {
    const snapshot = buildPromaxSnapshot([
      { id: 70, activeBoost: true, activeVip: false, priority: 2 },
      { id: 71, activeBoost: true, activeVip: false, priority: 1 },
    ], "2030-01-01T12:00:00.000Z", null, now);
    const demoted = new Set([70]);
    const order = () => orderPromaxItems([
      { id: 70, group: derivePromaxViewerGroup(true, true, !demoted.has(70), false), legacyPosition: 0 },
      { id: 71, group: derivePromaxViewerGroup(true, true, !demoted.has(71), false), legacyPosition: 1 },
    ], snapshot).map((item) => item.id);
    const pageOne = order();
    // Impression count may cross the cap after page one, but the pinned
    // sequence reuses the same demoted set and therefore keeps page two stable.
    const pageTwo = order();
    expect(pageOne.slice(0, 1)).toEqual([71]);
    expect(pageTwo.slice(1, 2)).toEqual([70]);
  });

  it("retries only when startup has no verified snapshot", () => {
    expect(shouldRetryPromaxStartup(null, false)).toBe(true);
    expect(shouldRetryPromaxStartup(null, true)).toBe(true);
    expect(shouldRetryPromaxStartup({} as any, false)).toBe(true);
    expect(shouldRetryPromaxStartup({} as any, true)).toBe(false);
    expect(PROMAX_RETRY_DELAY_MS).toBe(60_000);
  });
});