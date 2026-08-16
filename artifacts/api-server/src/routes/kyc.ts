/**
 * KYC / Identity Verification routes.
 *
 * Users can submit government-issued ID + selfie photos for verification.
 * Admins review and approve or reject submissions.
 * Large P2P transfers ($500+) require KYC approval.
 *
 * Routes:
 *   GET  /api/kyc/status              — current user's KYC status
 *   POST /api/kyc/submit              — submit documents (multipart/form-data)
 *   GET  /api/admin/kyc               — list pending KYC applications (admin)
 *   PATCH /api/admin/kyc/:userId/decide — approve or reject (admin)
 */

import { Router } from "express";
import multer from "multer";
import { db, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { uploadToStorage } from "../lib/storage";
import { sendEmail } from "../lib/email";
import { kycStatusEmail } from "../lib/emailTemplates";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── GET /api/kyc/status ──────────────────────────────────────────────────────

router.get("/kyc/status", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      kycStatus:         sql<string>`kyc_status`,
      kycDocumentType:   sql<string>`kyc_document_type`,
      kycRejectionReason: sql<string>`kyc_rejection_reason`,
      kycSubmittedAt:    sql<string>`kyc_submitted_at`,
      kycReviewedAt:     sql<string>`kyc_reviewed_at`,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    status:           user.kycStatus ?? "not_submitted",
    documentType:     user.kycDocumentType ?? null,
    rejectionReason:  user.kycRejectionReason ?? null,
    submittedAt:      user.kycSubmittedAt ?? null,
    reviewedAt:       user.kycReviewedAt ?? null,
  });
});

// ─── POST /api/kyc/submit ─────────────────────────────────────────────────────

router.post(
  "/kyc/submit",
  requireAuth,
  upload.fields([{ name: "document", maxCount: 1 }, { name: "selfie", maxCount: 1 }]),
  async (req, res): Promise<void> => {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, kycStatus: sql<string>`kyc_status` })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    if (user.kycStatus === "approved") {
      res.status(409).json({ error: "KYC déjà approuvé" }); return;
    }
    if (user.kycStatus === "pending") {
      res.status(409).json({ error: "KYC annatant revizyon — pa soumèt ankò" }); return;
    }

    const VALID_DOC_TYPES = ["national_id", "passport", "driving_license"] as const;
    type DocType = typeof VALID_DOC_TYPES[number];
    const docType = req.body?.docType as DocType;
    if (!VALID_DOC_TYPES.includes(docType)) {
      res.status(400).json({ error: "docType pa valid" }); return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const docFile = files?.["document"]?.[0];
    const selfieFile = files?.["selfie"]?.[0];

    if (!docFile || !selfieFile) {
      res.status(400).json({ error: "document ak selfie obligatwa" }); return;
    }

    // Upload both files to object storage
    let docUrl: string;
    let selfieUrl: string;

    try {
      const [docRes, selfieRes] = await Promise.all([
        uploadToStorage(docFile.buffer, "image/jpeg", "kyc"),
        uploadToStorage(selfieFile.buffer, "image/jpeg", "kyc"),
      ]);
      docUrl = docRes.url;
      selfieUrl = selfieRes.url;
    } catch (err: unknown) {
      logger.error({ err }, "KYC file upload failed");
      res.status(500).json({ error: "Echèk telechajman foto — eseye ankò" }); return;
    }

    await db.execute(sql`
      UPDATE users
      SET kyc_status         = 'pending',
          kyc_document_url   = ${docUrl},
          kyc_selfie_url     = ${selfieUrl},
          kyc_document_type  = ${docType},
          kyc_submitted_at   = NOW(),
          kyc_rejection_reason = NULL,
          kyc_reviewed_at    = NULL,
          kyc_reviewed_by    = NULL
      WHERE id = ${req.userId}
    `);

    logger.info({ userId: req.userId, docType }, "KYC submitted");
    res.json({ ok: true, status: "pending" });
  },
);

// ─── GET /api/admin/kyc ───────────────────────────────────────────────────────

router.get("/admin/kyc", requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = req.query.status as string | undefined;
  const VALID_STATUSES = ["pending", "approved", "rejected", "not_submitted"] as const;
  const status = statusFilter && VALID_STATUSES.includes(statusFilter as any)
    ? statusFilter
    : "pending";

  const rows = await db.execute(sql`
    SELECT
      id, name, email,
      country,
      kyc_status,
      kyc_document_type,
      kyc_document_url,
      kyc_selfie_url,
      kyc_rejection_reason,
      kyc_submitted_at,
      kyc_reviewed_at
    FROM users
    WHERE kyc_status = ${status}
    ORDER BY kyc_submitted_at ASC
    LIMIT 100
  `) as unknown as any[];

  res.json({ applications: rows, count: rows.length });
});

// ─── PATCH /api/admin/kyc/:userId/decide ─────────────────────────────────────

router.patch("/admin/kyc/:userId/decide", requireAdmin, async (req, res): Promise<void> => {
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(rawUserId ?? "", 10);
  if (!userId) { res.status(400).json({ error: "Invalid userId" }); return; }

  const { decision, rejectionReason } = req.body ?? {};
  if (!["approve", "reject"].includes(decision)) {
    res.status(400).json({ error: "decision dwe 'approve' oswa 'reject'" }); return;
  }
  if (decision === "reject" && !rejectionReason?.trim()) {
    res.status(400).json({ error: "rejectionReason obligatwa pou rejeksyon" }); return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, kycStatus: sql<string>`kyc_status` })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.kycStatus !== "pending") {
    res.status(409).json({ error: `KYC pa 'pending' (current: ${user.kycStatus})` }); return;
  }

  const newStatus = decision === "approve" ? "approved" : "rejected";
  const reasonVal = decision === "reject" ? String(rejectionReason).trim() : null;

  await db.execute(sql`
    UPDATE users
    SET kyc_status           = ${newStatus},
        kyc_rejection_reason = ${reasonVal},
        kyc_reviewed_at      = NOW(),
        kyc_reviewed_by      = ${req.userId!}
    WHERE id = ${userId}
  `);

  logger.info({ userId, decision, reviewedBy: req.userId }, "KYC decision recorded");

  // Email notification — fire and forget
  void (async () => {
    const tpl = kycStatusEmail({ name: user.name, status: newStatus as "approved" | "rejected", rejectionReason: reasonVal ?? undefined });
    await sendEmail({ to: user.email, ...tpl });
  })();

  res.json({ ok: true, status: newStatus });
});

export default router;
