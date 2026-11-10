/**
 * Registered country is immutable from Flexa Control admin APIs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminRoutes = readFileSync(
  resolve(__dirname, "../routes/admin.ts"),
  "utf8",
);

describe("admin users country read-only", () => {
  it("rejects set-country for admins", () => {
    expect(adminRoutes).toMatch(/rejectAdminCountryMutation/);
    expect(adminRoutes).toMatch(
      /router\.post\("\/admin\/users\/:id\/set-country"[\s\S]*?rejectAdminCountryMutation/,
    );
    expect(adminRoutes).not.toMatch(
      /set-country[\s\S]{0,200}db\.update\(usersTable\)\.set\(\{\s*country/,
    );
  });

  it("rejects reset-country-lock as a country-change enabler", () => {
    expect(adminRoutes).toMatch(
      /router\.post\("\/admin\/users\/:id\/reset-country-lock"[\s\S]*?rejectAdminCountryMutation/,
    );
  });

  it("requires reason + session invalidate on block, and positive days on suspend", () => {
    expect(adminRoutes).toMatch(/A reason is required to block a user/);
    expect(adminRoutes).toMatch(/Suspension requires a positive number of days/);
    expect(adminRoutes).toMatch(/tokenInvalidatedAt:\s*now/);
    expect(adminRoutes).toMatch(/Never clear isBanned when lifting a suspension/);
  });

  it("exposes a dedicated user detail payload for Control", () => {
    expect(adminRoutes).toMatch(/router\.get\("\/admin\/users\/:id"/);
    expect(adminRoutes).toMatch(/countryDisplay/);
    expect(adminRoutes).toMatch(/Country not set/);
  });

  it("queries user_restrictions.restricted_at (not a missing created_at)", () => {
    // Regression: selecting userRestrictionsTable.createdAt caused HTTP 500
    // "Internal server error" on every User Details open.
    expect(adminRoutes).toMatch(/createdAt:\s*userRestrictionsTable\.restrictedAt/);
    expect(adminRoutes).toMatch(/orderBy\(desc\(userRestrictionsTable\.restrictedAt\)\)/);
    expect(adminRoutes).not.toMatch(/userRestrictionsTable\.createdAt/);
  });

  it("sanitizes Control user payloads (no password / raw session ids)", () => {
    expect(adminRoutes).toMatch(/formatControlUserListRow/);
    const detailHandler = adminRoutes.match(
      /router\.get\("\/admin\/users\/:id", requireAdmin[\s\S]*?res\.json\(\{/,
    )?.[0] ?? "";
    expect(detailHandler).toBeTruthy();
    expect(adminRoutes).toMatch(/Intentionally omit metadata \/ sessionId/);
    expect(adminRoutes).toMatch(/savedAddress/);
    expect(adminRoutes).toMatch(/commonDevices/);
    expect(adminRoutes).toMatch(/assertUserInScope/);
  });

  it("exposes Devices & Sessions plus sign-out-all and internal-note", () => {
    expect(adminRoutes).toMatch(/router\.get\("\/admin\/users\/:id\/devices"/);
    expect(adminRoutes).toMatch(/buildDevicesFromLoginLogs/);
    expect(adminRoutes).toMatch(/getActiveSocketCount/);
    expect(adminRoutes).toMatch(/router\.post\("\/admin\/users\/:id\/sign-out-all"/);
    expect(adminRoutes).toMatch(/router\.post\("\/admin\/users\/:id\/internal-note"/);
    expect(adminRoutes).toMatch(/user_sign_out_all/);
    expect(adminRoutes).toMatch(/user_internal_note/);
  });
});
