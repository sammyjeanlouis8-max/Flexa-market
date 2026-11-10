import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  escapeIlikePattern,
  matchesAdminUserSearch,
  parseAdminUserSearchQuery,
  phoneDigitsOnly,
} from "../lib/adminUserSearch";

const pool = [
  {
    id: 1,
    name: "Jean Dupont",
    email: "jean.dupont@example.com",
    phone: "+509 3712-4455",
    country: "Haiti",
  },
  {
    id: 2,
    name: "Maria Lopez",
    email: "maria@flexa.test",
    phone: "+1 (809) 555-0199",
    country: "Dominican Republic",
  },
  {
    id: 3,
    name: "Nadia Pierre",
    email: "NADIA.PIERRE@Flexa.Market",
    phone: "+50937441122",
    country: "Haiti",
  },
  // Simulates an account that would sit past a first “page” of results
  {
    id: 99,
    name: "Zora Latepage",
    email: "zora.late@example.com",
    phone: "+1-555-010-9988",
    country: "USA",
  },
];

describe("phoneDigitsOnly", () => {
  it("strips spaces, parentheses, hyphens, and keeps international digits", () => {
    expect(phoneDigitsOnly("+509 3712-4455")).toBe("50937124455");
    expect(phoneDigitsOnly("+1 (809) 555-0199")).toBe("18095550199");
    expect(phoneDigitsOnly("(509) 3744.1122")).toBe("50937441122");
  });
});

describe("matchesAdminUserSearch", () => {
  it("matches full or partial name (case-insensitive)", () => {
    expect(matchesAdminUserSearch(pool[0]!, "Jean")).toBe(true);
    expect(matchesAdminUserSearch(pool[0]!, "dupont")).toBe(true);
    expect(matchesAdminUserSearch(pool[0]!, "jean dupont")).toBe(true);
    expect(matchesAdminUserSearch(pool[0]!, "Nadia")).toBe(false);
  });

  it("matches email regardless of capitalization (exact or partial)", () => {
    expect(
      matchesAdminUserSearch(pool[2]!, "nadia.pierre@flexa.market"),
    ).toBe(true);
    expect(
      matchesAdminUserSearch(pool[2]!, "NADIA.PIERRE@FLEXA.MARKET"),
    ).toBe(true);
    expect(matchesAdminUserSearch(pool[2]!, "nadia.pierre")).toBe(true);
    expect(matchesAdminUserSearch(pool[2]!, "@flexa.market")).toBe(true);
    expect(matchesAdminUserSearch(pool[2]!, "nobody@missing.test")).toBe(false);
  });

  it("matches a formatted international phone number", () => {
    expect(matchesAdminUserSearch(pool[0]!, "+509 3712-4455")).toBe(true);
    expect(matchesAdminUserSearch(pool[0]!, "50937124455")).toBe(true);
    expect(matchesAdminUserSearch(pool[1]!, "+1 (809) 555-0199")).toBe(true);
    expect(matchesAdminUserSearch(pool[1]!, "1-809-555-0199")).toBe(true);
    // Wrong number / truncated digits do not match.
    expect(matchesAdminUserSearch(pool[0]!, "3712")).toBe(false);
    expect(matchesAdminUserSearch(pool[0]!, "50937124456")).toBe(false);
  });

  it("finds an account outside the first page of a sorted list", () => {
    const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    const firstPage = sorted.slice(0, 2);
    expect(firstPage.some((u) => u.id === 99)).toBe(false);
    // Server-side search still hits Zora even though she is past page 1.
    const hits = pool.filter((u) =>
      matchesAdminUserSearch(u, "Zora Latepage"),
    );
    expect(hits.map((u) => u.id)).toEqual([99]);
    expect(
      pool.filter((u) => matchesAdminUserSearch(u, "zora.late@example.com")).map((u) => u.id),
    ).toEqual([99]);
    expect(
      pool.filter((u) => matchesAdminUserSearch(u, "+1-555-010-9988")).map((u) => u.id),
    ).toEqual([99]);
  });

  it("returns no results for an unknown query", () => {
    expect(pool.filter((u) => matchesAdminUserSearch(u, "zzz-nobody"))).toEqual([]);
    expect(pool.filter((u) => matchesAdminUserSearch(u, "nobody@missing.test"))).toEqual([]);
    expect(pool.filter((u) => matchesAdminUserSearch(u, "+509 0000-0000"))).toEqual([]);
  });
});

describe("escapeIlikePattern", () => {
  it("escapes wildcard characters", () => {
    expect(escapeIlikePattern("100%_off")).toBe("100\\%\\_off");
  });
});

describe("parseAdminUserSearchQuery + Control Users route contract", () => {
  it("parses name / email / phone tokens and skips empty queries", () => {
    expect(parseAdminUserSearchQuery("")).toBeNull();
    expect(parseAdminUserSearchQuery("   ")).toBeNull();
    expect(parseAdminUserSearchQuery("Nadia")?.namePattern).toBe("%Nadia%");
    expect(parseAdminUserSearchQuery("Nadia.Pierre@Flexa.Market")?.emailExact).toBe(
      "nadia.pierre@flexa.market",
    );
    expect(parseAdminUserSearchQuery("+509 3712-4455")?.phoneDigits).toBe("50937124455");
    expect(parseAdminUserSearchQuery("3712")?.phoneDigits).toBeNull();
  });

  it("wires server search + requireAdmin without a page LIMIT", () => {
    const adminRoutes = readFileSync(
      resolve(__dirname, "../routes/admin.ts"),
      "utf8",
    );
    expect(adminRoutes).toMatch(/parseAdminUserSearchQuery/);
    expect(adminRoutes).toMatch(/regexp_replace\(coalesce\(\$\{usersTable\.phone\}/);
    expect(adminRoutes).toMatch(
      /router\.get\("\/admin\/users", requireAdmin/,
    );
    // Must not truncate authorized results to a client page window.
    const usersHandler = adminRoutes.match(
      /router\.get\("\/admin\/users", requireAdmin[\s\S]*?res\.json\(users\.map\(formatControlUserListRow\)\);/,
    )?.[0] ?? "";
    expect(usersHandler).toBeTruthy();
    expect(usersHandler).not.toMatch(/\.limit\(/);
    expect(usersHandler).toMatch(/country && country !== "all"/);
    expect(usersHandler).toMatch(/formatControlUserListRow/);
  });

  it("keeps search above filters with the required placeholder in the UI", () => {
    const ui = readFileSync(
      resolve(__dirname, "../../../marketplace/src/pages/AdminUsers.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/Search by name, email, or phone/);
    const searchIdx = ui.indexOf('data-testid="admin-users-search"');
    const countryIdx = ui.indexOf('data-testid="admin-users-country-filter"');
    const statusIdx = ui.indexOf('data-testid="admin-users-status-filter"');
    expect(searchIdx).toBeGreaterThan(-1);
    expect(countryIdx).toBeGreaterThan(searchIdx);
    expect(statusIdx).toBeGreaterThan(searchIdx);
    expect(ui).toMatch(/LIST_STATE_KEY/);
    expect(ui).toMatch(/saveListState/);
    expect(ui).toMatch(/loadListState/);
    // Inline Retry errors — keep loaded data, clear of status-bar toasts for failures.
    expect(ui).toMatch(/admin-users-list-error/);
    expect(ui).toMatch(/admin-user-details-error/);
    expect(ui).toMatch(/InlineError/);
  });
});
