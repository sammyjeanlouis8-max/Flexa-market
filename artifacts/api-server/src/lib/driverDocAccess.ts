import type { Request, Response } from "express";
import multer from "multer";
import { uploadToStorage } from "./storage";
import { getSignedStreamUrl, getPublicUrl, isConfigured as wasabiConfigured } from "./wasabi";
import { db, driverApplicationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { hasRole } from "../middlewares/auth";

export const driverDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported file type"), ok);
  },
});

/** Store under driver-docs/{userId}/… — never enqueue as listing media. */
export async function uploadDriverDocument(userId: number, buffer: Buffer, mimetype: string) {
  const prefix = `driver-docs/${userId}`;
  const result = await uploadToStorage(buffer, mimetype, prefix);
  const key =
    (result.key && result.key.startsWith(`driver-docs/${userId}/`) && result.key)
    || (typeof result.url === "string" && result.url.includes(`driver-docs/${userId}/`)
      ? `driver-docs/${userId}/` + result.url.split(`driver-docs/${userId}/`).pop()!.split("?")[0]
      : null);

  if (key) {
    return {
      key,
      url: `/api/delivery/application/document?key=${encodeURIComponent(key)}`,
      backend: result.backend,
    };
  }
  return { key: null as string | null, url: result.url, backend: result.backend };
}

export function extractDriverDocKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url, "http://local");
    return u.searchParams.get("key");
  } catch {
    return null;
  }
}

export async function userCanAccessDriverDocKey(req: Request, key: string): Promise<boolean> {
  if (!key.startsWith("driver-docs/")) return false;
  const ownerId = Number(key.split("/")[1]);
  if (!Number.isFinite(ownerId) || ownerId <= 0) return false;
  const userId = req.userId;
  if (!userId) return false;
  if (userId === ownerId) return true;
  return hasRole(req.user, "moderator");
}

/** Stream or redirect a private driver document to an authorized viewer. */
export async function serveDriverDocument(req: Request, res: Response): Promise<void> {
  const key = String(req.query.key || "").trim();
  if (!key || key.includes("..") || !key.startsWith("driver-docs/")) {
    res.status(400).json({ error: "Invalid document key" });
    return;
  }
  if (!(await userCanAccessDriverDocKey(req, key))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    if (wasabiConfigured()) {
      const signed = await getSignedStreamUrl(key, 60 * 15);
      res.redirect(302, signed);
      return;
    }
    res.redirect(302, getPublicUrl(key));
  } catch (err: any) {
    req.log?.error?.({ err }, "driver document serve failed");
    res.status(500).json({ error: "Could not open document" });
  }
}

/** Confirm a stored license (or other) URL belongs to this applicant. */
export async function documentBelongsToApplicant(
  userId: number,
  url: string | null | undefined,
): Promise<boolean> {
  if (!url || !String(url).trim()) return false;
  const s = String(url);
  if (s.includes("/api/delivery/application/document?key=")) {
    const key = extractDriverDocKeyFromUrl(s);
    return !!key && key.startsWith(`driver-docs/${userId}/`);
  }
  if (s.includes(`driver-docs/${userId}/`)) return true;
  const [app] = await db
    .select()
    .from(driverApplicationsTable)
    .where(eq(driverApplicationsTable.userId, userId))
    .orderBy(desc(driverApplicationsTable.createdAt))
    .limit(1);
  if (!app) return true;
  const fields = [
    (app as any).photoNationalId,
    app.photoIdSelfie,
    app.facePhotoHoldingId,
    app.photoLicenseFront,
    app.photoLicenseBack,
    app.photoVehicleRegistration,
    app.selfiePhotoUrl,
  ];
  return fields.some((f) => f && String(f) === s);
}
