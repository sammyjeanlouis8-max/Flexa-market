import type { Request, Response } from "express";
import multer from "multer";
import { uploadToStorage } from "./storage";
import { getSignedStreamUrl, getPublicUrl, isConfigured as wasabiConfigured } from "./wasabi";
import { db, restaurantIdentityVerificationsTable, restaurantModerationLogsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { hasRole } from "../middlewares/auth";

export const restaurantDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

export async function uploadRestaurantIdentityDoc(userId: number, buffer: Buffer, mimetype: string) {
  const prefix = `restaurant-idv/${userId}`;
  const result = await uploadToStorage(buffer, mimetype, prefix);
  const key =
    (result.key && result.key.startsWith(`restaurant-idv/${userId}/`) && result.key)
    || (typeof result.url === "string" && result.url.includes(`restaurant-idv/${userId}/`)
      ? `restaurant-idv/${userId}/` + result.url.split(`restaurant-idv/${userId}/`).pop()!.split("?")[0]
      : null);
  if (key) {
    return {
      key,
      url: `/api/restaurants/identity/document?key=${encodeURIComponent(key)}`,
      backend: result.backend,
    };
  }
  return { key: null as string | null, url: result.url, backend: result.backend };
}

export async function userCanAccessRestaurantDocKey(req: Request, key: string): Promise<boolean> {
  if (!key.startsWith("restaurant-idv/")) return false;
  const ownerId = Number(key.split("/")[1]);
  if (!Number.isFinite(ownerId) || ownerId <= 0) return false;
  const userId = req.userId;
  if (!userId) return false;
  if (userId === ownerId) return true;
  return hasRole(req.user, "moderator");
}

export async function serveRestaurantIdentityDocument(req: Request, res: Response): Promise<void> {
  const key = String(req.query.key || "").trim();
  if (!key || key.includes("..") || !key.startsWith("restaurant-idv/")) {
    res.status(400).json({ error: "Invalid document key" });
    return;
  }
  if (!(await userCanAccessRestaurantDocKey(req, key))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    if (hasRole(req.user, "moderator") && req.userId) {
      await db.insert(restaurantModerationLogsTable).values({
        actorId: req.userId,
        action: "view_identity_document",
        details: "Authorized staff viewed restaurant identity document",
        accessedDocumentKey: key,
        restaurantId: null,
      });
    }
  } catch {
    /* audit failure should not block authorized access */
  }

  try {
    if (wasabiConfigured()) {
      const signed = await getSignedStreamUrl(key, 60 * 15);
      res.redirect(302, signed);
      return;
    }
    res.redirect(302, getPublicUrl(key));
  } catch (err: any) {
    req.log?.error?.({ err }, "restaurant identity document serve failed");
    res.status(500).json({ error: "Could not open document" });
  }
}

/** Strip private keys from any identity verification row before client JSON. */
export function publicIdentityStatus(row: typeof restaurantIdentityVerificationsTable.$inferSelect | null) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    status: row.status,
    documentType: row.documentType,
    legalName: row.legalName,
    countryOfResidence: row.countryOfResidence,
    documentIssuingCountry: row.documentIssuingCountry,
    rejectionReason: row.rejectionReason,
    reusedMarketKyc: row.reusedMarketKyc,
    submittedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export async function latestIdentityForRestaurant(restaurantId: number) {
  const [row] = await db
    .select()
    .from(restaurantIdentityVerificationsTable)
    .where(eq(restaurantIdentityVerificationsTable.restaurantId, restaurantId))
    .orderBy(desc(restaurantIdentityVerificationsTable.createdAt))
    .limit(1);
  return row ?? null;
}
