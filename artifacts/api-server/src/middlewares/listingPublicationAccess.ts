import type { Request, Response, NextFunction } from "express";
import { hasRole, isAdminAccessSuspended, requireNotRestricted } from "./auth";
import { isStripeOnlySale } from "../lib/usSellerPayoutPolicy";

/**
 * Kat FM-eligible sellers may publish despite an account restriction.
 * This exception applies only to new listings; it never clears the restriction
 * or changes checkout, withdrawals, restocking, or other account permissions.
 */
export async function requireListingPublicationAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const seller = req.user;
  if (!seller) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Match the listing handler's server-owned country resolution. An ordinary
  // seller cannot submit Haiti to bypass their actual profile country.
  const sellerCountry = (seller.country ?? "").trim();
  const canChangeListingCountry =
    hasRole(seller, "admin") && !isAdminAccessSuspended(seller);
  const submittedCountry = typeof req.body?.country === "string"
    ? req.body.country.trim()
    : "";
  const listingCountry = canChangeListingCountry
    ? (submittedCountry || sellerCountry || null)
    : sellerCountry;

  if (!isStripeOnlySale(sellerCountry, listingCountry)) {
    next();
    return;
  }

  await requireNotRestricted(req, res, next);
}