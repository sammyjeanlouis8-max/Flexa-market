import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";

const { restrictedGuard } = vi.hoisted(() => ({ restrictedGuard: vi.fn() }));
vi.mock("../middlewares/auth", () => ({
  hasRole: (user: { role?: string }, min: string) =>
    min === "admin" && ["admin", "superadmin"].includes(user.role ?? ""),
  isAdminAccessSuspended: (user: { isAdminSuspended?: boolean }) =>
    !!user.isAdminSuspended,
  requireNotRestricted: restrictedGuard,
}));

import { requireListingPublicationAccess } from "../middlewares/listingPublicationAccess";

beforeEach(() => {
  vi.clearAllMocks();
  restrictedGuard.mockImplementation((req, res, next) => {
    if (req.user.isRestricted) {
      res.status(403).json({ error: "USER_RESTRICTED", code: "USER_RESTRICTED" });
    } else {
      next();
    }
  });
});

async function check(
  country: string | null,
  submittedCountry: string,
  role = "user",
  isRestricted = true,
  isAdminSuspended = false,
) {
  const user = { country, role, isRestricted, isAdminSuspended };
  const req = { user, body: { country: submittedCountry } } as unknown as Request;
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn();
  await requireListingPublicationAccess(req, res as unknown as Response, next);
  return { req, res, next, user };
}

describe("Kat FM publication-only restriction exception", () => {
  it.each(["Haiti", "Ayiti", "HT", " Haïti "])(
    "allows restricted %s sellers to publish without lifting their restriction", async country => {
      const { next, user } = await check(country, "Haiti");
      expect(next).toHaveBeenCalledOnce();
      expect(restrictedGuard).not.toHaveBeenCalled();
      expect(user.isRestricted).toBe(true);
    },
  );

  it("uses an ordinary seller's real country instead of their submitted country", async () => {
    const { next } = await check("Haiti", "United States");
    expect(next).toHaveBeenCalledOnce();
    expect(restrictedGuard).not.toHaveBeenCalled();
  });

  it.each(["United States", "Dominican Republic", "Canada", "", null])(
    "does not let a restricted %s seller claim Haiti to bypass restrictions", async country => {
      const { next, res } = await check(country, "Haiti");
      expect(restrictedGuard).toHaveBeenCalledOnce();
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    },
  );

  it("keeps restrictions for a Haiti admin's overseas listing", async () => {
    const { next } = await check("Haiti", "United States", "admin");
    expect(restrictedGuard).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps restrictions for an overseas admin's Haiti listing", async () => {
    const { next } = await check("United States", "Haiti", "admin");
    expect(restrictedGuard).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a Haiti admin's Haiti listing", async () => {
    const { next } = await check("Haiti", "Haiti", "admin");
    expect(next).toHaveBeenCalledOnce();
    expect(restrictedGuard).not.toHaveBeenCalled();
  });

  it("does not restore a suspended admin's country-override permission", async () => {
    const { next } = await check("Haiti", "United States", "admin", true, true);
    expect(next).toHaveBeenCalledOnce();
    expect(restrictedGuard).not.toHaveBeenCalled();
  });

  it("still permits unrestricted sellers outside Haiti without payout setup", async () => {
    const { next } = await check("Canada", "Canada", "user", false);
    expect(restrictedGuard).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("requires an authenticated user", async () => {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();
    await requireListingPublicationAccess({ body: {} } as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("limits the exception to publication and keeps restocking restricted", () => {
    const routes = readFileSync(new URL("../routes/listings.ts", import.meta.url), "utf8");
    expect(routes).toContain('router.post("/listings", requireAuth, requireListingPublicationAccess,');
    expect(routes).toContain('router.patch("/listings/:id/restock", requireAuth, requireNotRestricted,');
    const sell = readFileSync(new URL("../../../marketplace/src/pages/Sell.tsx", import.meta.url), "utf8");
    expect(sell).toContain("if (isRestricted && (isEditMode || isStripeOnlySeller))");
    expect(sell).toContain('payoutData?.cardPayoutMethod ?? (isStripeOnlySeller ? null : "fm_wallet")');
  });
});