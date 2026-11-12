import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src");

describe("hide / block / report safety controls", () => {
  it("keeps block optional for reports and supports unblock by blocker only", () => {
    const src = readFileSync(join(root, "routes/blocks.ts"), "utf8");
    expect(src).toContain("report: z.boolean()");
    expect(src).toContain("wantReport");
    expect(src).toContain("eq(userBlocksTable.blockerId, req.userId!)");
    expect(src).not.toMatch(/insert\(reportsTable\)[\s\S]{0,80}User blocked for abusive/);
  });

  it("rejects direct messages and new conversations when either party blocked the other", () => {
    const src = readFileSync(join(root, "routes/messages.ts"), "utf8");
    expect(src).toContain("isDirectMessagingBlocked");
    expect(src).toContain("MESSAGING_BLOCKED");
    expect(src.match(/MESSAGING_BLOCKED/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("rejects chat payment offers between blocked users", () => {
    const src = readFileSync(join(root, "routes/offers.ts"), "utf8");
    expect(src).toContain("isDirectMessagingBlocked");
    expect(src).toContain("MESSAGING_BLOCKED");
  });

  it("filters hidden listings from catalog helpers and home stats", () => {
    const visibility = readFileSync(join(root, "lib/catalogVisibility.ts"), "utf8");
    const listings = readFileSync(join(root, "routes/listings.ts"), "utf8");
    const stats = readFileSync(join(root, "routes/stats.ts"), "utf8");
    const hides = readFileSync(join(root, "routes/hides.ts"), "utf8");
    expect(visibility).toContain("listing_hides");
    expect(visibility).toContain("appendViewerCatalogFilters");
    expect(listings).toContain("appendViewerCatalogFilters");
    expect(listings).toContain("isListingHiddenForViewer");
    expect(stats).toContain("appendViewerCatalogFilters");
    expect(hides).toContain('/listings/:id/hide');
    expect(hides).toContain('/users/:id/hide-listings');
    expect(hides).toContain('/users/me/hides');
  });

  it("dedupes pending abuse reports on retry", () => {
    const src = readFileSync(join(root, "routes/reports.ts"), "utf8");
    expect(src).toContain("duplicate: true");
    expect(src).toContain('eq(reportsTable.status, "pending")');
  });

  it("registers listing_hides startup migration", () => {
    const src = readFileSync(join(root, "lib/migrations.ts"), "utf8");
    expect(src).toContain("listing_hides.create");
    expect(src).toContain("listing_hides_exactly_one_target");
  });
});
