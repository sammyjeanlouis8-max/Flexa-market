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
});
