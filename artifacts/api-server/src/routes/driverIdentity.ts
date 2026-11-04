/**
 * Secure identity-document upload + temporary view URLs for Haiti driver applications.
 *
 * Uploads are stored under driver-identity/ and referenced as didoc:<key>.
 * Public listing of identity docs is forbidden — view requires owner or admin.
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, driverApplicationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getRole, hasRole } from "../middlewares/auth";
import { uploadToStorage } from "../lib/storage";
import { validateMimeType } from "../lib/s3";
import { getSignedStreamUrl, isConfigured as wasabiConfigured } from "../lib/wasabi";
import { DIDOC_PREFIX, driverDocKeyFromRef, isDriverDocRef } from "../lib/driverDocRefs";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed."));
      return;
    }
    cb(null, true);
  },
});

const VIEW_TTL_SEC = 5 * 60;

function viewSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.DRIVER_DOC_VIEW_SECRET || "dev-driver-doc-secret";
}

export { isDriverDocRef, driverDocKeyFromRef };

function signViewToken(key: string, exp: number): string {
  return createHmac("sha256", viewSigningSecret()).update(`${key}|${exp}`).digest("hex");
}

function verifyViewToken(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = signViewToken(key, exp);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(sig), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * POST /api/driver/identity-documents
 * Multipart field "file". Optional body field purpose=cin|license_front|license_back|other
 * Returns { ref: "didoc:driver-identity/..." } — never a public CDN URL.
 */
router.post(
  "/driver/identity-documents",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    try {
      validateMimeType(req.file.mimetype);
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? "Invalid file type" });
      return;
    }

    const purpose = String((req.body as any)?.purpose ?? "other").replace(/[^a-z_]/g, "").slice(0, 32) || "other";
    const userId = req.userId!;
    const prefix = `driver-identity/${userId}/${purpose}`;

    try {
      const { url, backend } = await uploadToStorage(req.file.buffer, req.file.mimetype, prefix);
      // Prefer opaque key refs. If Wasabi returned a public URL, derive key from path when possible.
      let ref: string;
      if (backend === "wasabi" && wasabiConfigured()) {
        // uploadMedia stores as `{prefix}/{uuid}.ext` — recover from returned URL path when present.
        try {
          const u = new URL(url);
          const pathKey = u.pathname.replace(/^\/+/, "").split("/").slice(1).join("/"); // drop bucket
          if (pathKey.startsWith("driver-identity/")) {
            ref = `${DIDOC_PREFIX}${pathKey}`;
          } else {
            // Fallback: store the full URL but mark private via didoc-url wrapper for proxy fetch
            ref = `${DIDOC_PREFIX}url:${Buffer.from(url).toString("base64url")}`;
          }
        } catch {
          ref = `${DIDOC_PREFIX}url:${Buffer.from(url).toString("base64url")}`;
        }
      } else {
        // Object-storage / relative path
        const key = url.replace(/^\/api\/storage\/objects\//, "").replace(/^\/objects\//, "");
        ref = key.startsWith("driver-identity/")
          ? `${DIDOC_PREFIX}${key}`
          : `${DIDOC_PREFIX}url:${Buffer.from(url).toString("base64url")}`;
      }

      // Do not log file contents or the raw URL.
      req.log?.info({ purpose, userId, backend }, "driver identity document uploaded");
      res.status(201).json({
        ref,
        purpose,
        verificationStatus: "uploaded",
        message: "Document stored privately. Use the secure view endpoint to preview.",
      });
    } catch (err: any) {
      req.log?.error({ err: err?.message }, "driver identity upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

/**
 * GET /api/driver/identity-documents/view?ref=didoc:... 
 * Owner or staff only. Redirects to a short-lived signed URL when possible,
 * otherwise streams via temporary tokenized redirect for url: refs.
 */
router.get("/driver/identity-documents/view", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const ref = String(req.query.ref ?? "");
  if (!isDriverDocRef(ref)) {
    res.status(400).json({ error: "Invalid document reference" });
    return;
  }

  const userId = req.userId!;
  const role = getRole(req.user);
  const isStaff = hasRole(req.user, "moderator");

  // Ownership: ref path includes userId segment OR applicant owns an application that references it.
  const key = driverDocKeyFromRef(ref);
  let allowed = isStaff;
  if (!allowed && key) {
    const parts = key.split("/");
    // driver-identity/{userId}/...
    if (parts[0] === "driver-identity" && parts[1] === String(userId)) allowed = true;
  }
  if (!allowed) {
    const apps = await db
      .select({
        id: driverApplicationsTable.id,
        photoNationalId: (driverApplicationsTable as any).photoNationalId,
        photoLicenseFront: driverApplicationsTable.photoLicenseFront,
        photoLicenseBack: driverApplicationsTable.photoLicenseBack,
        userId: driverApplicationsTable.userId,
      })
      .from(driverApplicationsTable)
      .where(eq(driverApplicationsTable.userId, userId))
      .limit(20);
    allowed = apps.some((a: any) =>
      [a.photoNationalId, a.photoLicenseFront, a.photoLicenseBack].includes(ref),
    );
  }
  if (!allowed) {
    res.status(403).json({ error: "Not authorized to view this document" });
    return;
  }

  // url: base64 wrapper (dev / public-bucket fallback)
  if (ref.startsWith(`${DIDOC_PREFIX}url:`)) {
    try {
      const raw = Buffer.from(ref.slice(`${DIDOC_PREFIX}url:`.length), "base64url").toString("utf8");
      res.redirect(302, raw);
      return;
    } catch {
      res.status(400).json({ error: "Invalid document reference" });
      return;
    }
  }

  if (!key) {
    res.status(400).json({ error: "Invalid document reference" });
    return;
  }

  try {
    if (wasabiConfigured()) {
      const signed = await getSignedStreamUrl(key, VIEW_TTL_SEC);
      res.setHeader("Cache-Control", "private, no-store");
      res.redirect(302, signed);
      return;
    }
    // Dev object-storage fallback
    const exp = Math.floor(Date.now() / 1000) + VIEW_TTL_SEC;
    const sig = signViewToken(key, exp);
    res.redirect(302, `/api/storage/objects/${key}?exp=${exp}&sig=${sig}`);
  } catch (err: any) {
    req.log?.error({ err: err?.message }, "driver identity view failed");
    res.status(500).json({ error: "Could not create secure document URL" });
  }
});

/**
 * Admin helper: issue a short-lived view URL for a stored ref (JSON, no redirect).
 * GET /api/admin/driver-identity-url?ref=...
 */
router.get("/admin/driver-identity-url", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const ref = String(req.query.ref ?? "");
  if (!isDriverDocRef(ref)) {
    res.status(400).json({ error: "Invalid document reference" });
    return;
  }
  if (ref.startsWith(`${DIDOC_PREFIX}url:`)) {
    try {
      const raw = Buffer.from(ref.slice(`${DIDOC_PREFIX}url:`.length), "base64url").toString("utf8");
      res.json({ url: raw, expiresInSec: VIEW_TTL_SEC, mode: "legacy_url" });
      return;
    } catch {
      res.status(400).json({ error: "Invalid document reference" });
      return;
    }
  }
  const key = driverDocKeyFromRef(ref);
  if (!key) {
    res.status(400).json({ error: "Invalid document reference" });
    return;
  }
  try {
    if (wasabiConfigured()) {
      const url = await getSignedStreamUrl(key, VIEW_TTL_SEC);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ url, expiresInSec: VIEW_TTL_SEC, mode: "signed" });
      return;
    }
    res.json({
      url: `/api/driver/identity-documents/view?ref=${encodeURIComponent(ref)}`,
      expiresInSec: VIEW_TTL_SEC,
      mode: "proxy",
    });
  } catch (err: any) {
    req.log?.error({ err: err?.message }, "admin driver identity url failed");
    res.status(500).json({ error: "Could not create secure document URL" });
  }
});

export { verifyViewToken };
export default router;
