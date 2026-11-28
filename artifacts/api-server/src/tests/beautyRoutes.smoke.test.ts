import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Smoke: beauty router is mounted and critical paths exist in source. */
describe("beauty routes smoke", () => {
  const routes = readFileSync(resolve(__dirname, "../routes/beauty.ts"), "utf8");
  const index = readFileSync(resolve(__dirname, "../routes/index.ts"), "utf8");
  const access = readFileSync(resolve(__dirname, "../lib/beautyAccess.ts"), "utf8");
  const stripeCheckout = readFileSync(resolve(__dirname, "../routes/stripeCheckout.ts"), "utf8");

  it("mounts beautyRouter", () => {
    expect(index).toContain('import beautyRouter from "./beauty"');
    expect(index).toContain("router.use(beautyRouter)");
  });

  it("enables public launch while keeping auth write gates", () => {
    expect(access).toContain("export const BEAUTY_PUBLIC_LAUNCH = true");
    expect(routes).toContain("requireBeautyAccess");
    expect(routes).toContain("requireBeautyAuthAccess");
    expect(routes).toContain("publicLaunch: BEAUTY_PUBLIC_LAUNCH");
  });

  it("exposes core marketplace endpoints", () => {
    for (const path of [
      '"/beauty/launch"',
      '"/beauty/categories"',
      '"/beauty/businesses"',
      '"/beauty/availability"',
      '"/beauty/appointments"',
      '"/beauty/my-appointments"',
      '"/beauty/my-businesses"',
      '"/beauty/center/:businessId/overview"',
      '"/beauty/admin/overview"',
      '"/beauty/admin/businesses/:id/decide"',
      '"/beauty/admin/categories"',
      '"/beauty/admin/countries"',
    ]) {
      expect(routes).toContain(path);
    }
  });

  it("never trusts client prices and snapshots service details", () => {
    expect(routes).toContain("priceMinorSnapshot");
    expect(routes).toContain("serviceNameSnapshot");
    expect(routes).toContain("durationMinutesSnapshot");
    expect(routes).toContain("privateResidentialAddress");
  });

  it("wires Stripe beauty payment intents in checkout webhooks", () => {
    expect(stripeCheckout).toContain('flexaModule === "beauty"');
    expect(stripeCheckout).toContain("markBeautyAppointmentPaidFromStripe");
    expect(stripeCheckout).toContain("markBeautyAppointmentPaymentFailed");
  });

  it("validates appointment status transitions server-side", () => {
    expect(routes).toContain("canTransitionBeautyAppointment");
    expect(access).toContain("pending_confirmation");
    expect(access).toContain("cancelled_by_customer");
    expect(access).toContain("cancelled_by_business");
  });

  it("requires a valid service image before publishing/activating", () => {
    expect(routes).toContain("isValidPublicImageUrl");
    expect(routes).toContain("A valid service image is required before publishing");
    expect(routes).toContain("A valid service image is required before activating");
    expect(routes).toContain('"/beauty/my-businesses/:id/portfolio"');
  });

  it("seeds and discovers the 12 primary beauty categories", () => {
    const catalog = readFileSync(
      resolve(__dirname, "../lib/beautyCategoriesCatalog.ts"),
      "utf8",
    );
    for (const slug of [
      "beauty-studio",
      "barbershop",
      "nail-studio",
      "makeup-studio",
      "braids-locs",
      "spa-massage",
      "lashes-brows",
      "skin-care",
      "wigs-extensions",
      "bridal-beauty",
      "waxing-studio",
      "mobile-beauty",
    ]) {
      expect(catalog).toContain(`slug: "${slug}"`);
    }
    expect(routes).toContain("BEAUTY_PRIMARY_CATEGORIES");
    expect(routes).toContain("categorySlugs");
    expect(routes).toContain("mobileDelivery");
  });
});

describe("beauty startup migrations", () => {
  const migrations = readFileSync(resolve(__dirname, "../lib/migrations.ts"), "utf8");

  it("registers beauty tables before the apply loop", () => {
    const createPos = migrations.indexOf('name: "beauty_categories.create"');
    const bizPos = migrations.indexOf('name: "beauty_businesses.create"');
    const apptPos = migrations.indexOf('name: "beauty_appointments.create"');
    const loopPos = migrations.indexOf("for (const m of migrations)");
    expect(createPos).toBeGreaterThan(-1);
    expect(bizPos).toBeGreaterThan(-1);
    expect(apptPos).toBeGreaterThan(-1);
    expect(loopPos).toBeGreaterThan(-1);
    expect(createPos).toBeLessThan(loopPos);
    expect(bizPos).toBeLessThan(loopPos);
    expect(apptPos).toBeLessThan(loopPos);
  });

  it("adds beauty_business_id on conversations", () => {
    expect(migrations).toContain("beauty_business_id");
    expect(migrations).toContain("conversations_beauty_business_id_idx");
  });
});

describe("beauty access sync", () => {
  it("matches marketplace and mobile launch flags", () => {
    const api = readFileSync(resolve(__dirname, "../lib/beautyAccess.ts"), "utf8");
    const market = readFileSync(
      resolve(__dirname, "../../../marketplace/src/lib/beautyAccess.ts"),
      "utf8",
    );
    const mobile = readFileSync(
      resolve(__dirname, "../../../mobile/lib/beautyAccess.ts"),
      "utf8",
    );
    const apiFlag = /export const BEAUTY_PUBLIC_LAUNCH = (true|false)/.exec(api)?.[1];
    const marketFlag = /export const BEAUTY_PUBLIC_LAUNCH = (true|false)/.exec(market)?.[1];
    const mobileFlag = /export const BEAUTY_PUBLIC_LAUNCH = (true|false)/.exec(mobile)?.[1];
    expect(apiFlag).toBe("true");
    expect(marketFlag).toBe(apiFlag);
    expect(mobileFlag).toBe(apiFlag);
  });
});
