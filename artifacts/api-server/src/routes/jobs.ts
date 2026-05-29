import { Router } from "express";
import { db, jobsTable, usersTable } from "@workspace/db";
import { eq, and, desc, ne, or, isNull, sql, inArray } from "drizzle-orm";
import { requireAuth, requireNotRestricted } from "../middlewares/auth";
import { deductWalletHybrid } from "./wallet";

const router = Router();

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_LOCATION = 120;
const MAX_BUDGET = 1_000_000;

function shapeJob(row: typeof jobsTable.$inferSelect, poster: { id: number; name: string; avatar: string | null } | null) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    budget: row.budget ?? null,
    location: row.location ?? null,
    country: row.country ?? null,
    status: row.status,
    paid: Boolean(row.paid),
    feeAmount: row.feeAmount ?? null,
    feeCurrency: row.feeCurrency ?? null,
    paymentMethod: row.paymentMethod ?? null,
    posterId: row.posterId,
    posterName: poster?.name ?? null,
    posterAvatar: poster?.avatar ?? null,
    claimedById: row.claimedById ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Determine the posting fee for a given country. Posters in Haiti pay
 * 250 HTG via mobile money (or USDT); everyone else pays $15 USD via
 * card or USDT. The "country" comes from the user's profile, not the
 * job's location, so a Haitian living abroad still pays in their own
 * currency.
 */
function feeForCountry(country: string | null | undefined): {
  amount: number;
  currency: "USD" | "HTG";
  methods: Array<"card" | "moncash" | "natcash" | "usdt">;
} {
  if (country === "Haiti") {
    return { amount: 250, currency: "HTG", methods: ["moncash", "natcash", "usdt"] };
  }
  return { amount: 15, currency: "USD", methods: ["card", "usdt"] };
}

/**
 * GET /api/jobs — list every OPEN job. We always exclude the viewer's own
 * postings (they belong on /api/jobs/me) and prefer same-country results
 * but fall through to all-country results so newly-launched markets aren't
 * empty.
 *
 * Admins / superadmins are an exception: they see EVERY open job across
 * EVERY region in one global feed, with no country filter, so they can
 * moderate and seed content from anywhere.
 */
router.get("/jobs", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const viewerCountry = req.user?.country ?? null;
  const isAdmin = Boolean(
    req.user?.isAdmin || (req.user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin
  );

  const baseConds = [
    eq(jobsTable.status, "open"),
    ne(jobsTable.posterId, userId),
  ];

  // Admins always see the global feed — no country filter, no fallback.
  if (isAdmin) {
    const rows = await db.select().from(jobsTable)
      .leftJoin(usersTable, eq(jobsTable.posterId, usersTable.id))
      .where(and(...baseConds))
      .orderBy(desc(jobsTable.createdAt))
      .limit(200);
    res.json(rows.map(r => shapeJob(r.jobs, r.users ? { id: r.users.id, name: r.users.name, avatar: r.users.avatar } : null)));
    return;
  }

  // Try country-matched first for regular users.
  let rows: Array<{ jobs: typeof jobsTable.$inferSelect; users: typeof usersTable.$inferSelect | null }> = [];
  if (viewerCountry) {
    rows = await db.select().from(jobsTable)
      .leftJoin(usersTable, eq(jobsTable.posterId, usersTable.id))
      .where(and(...baseConds, eq(jobsTable.country, viewerCountry)))
      .orderBy(desc(jobsTable.createdAt))
      .limit(100);
  }
  if (rows.length === 0) {
    rows = await db.select().from(jobsTable)
      .leftJoin(usersTable, eq(jobsTable.posterId, usersTable.id))
      .where(and(...baseConds))
      .orderBy(desc(jobsTable.createdAt))
      .limit(100);
  }

  res.json(rows.map(r => shapeJob(r.jobs, r.users ? { id: r.users.id, name: r.users.name, avatar: r.users.avatar } : null)));
});

/**
 * GET /api/jobs/me — jobs you posted PLUS jobs you claimed. Useful for the
 * "My Jobs" tab so people can find work they accepted.
 */
router.get("/jobs/me", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db.select().from(jobsTable)
    .leftJoin(usersTable, eq(jobsTable.posterId, usersTable.id))
    .where(or(eq(jobsTable.posterId, userId), eq(jobsTable.claimedById, userId)))
    .orderBy(desc(jobsTable.createdAt))
    .limit(200);

  res.json(rows.map(r => shapeJob(r.jobs, r.users ? { id: r.users.id, name: r.users.name, avatar: r.users.avatar } : null)));
});

/**
 * GET /api/jobs/:id — single job. Visible to the poster, the claimer, or to
 * anyone if the job is still open.
 */
router.get("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(jobsTable)
    .leftJoin(usersTable, eq(jobsTable.posterId, usersTable.id))
    .where(eq(jobsTable.id, id));

  if (!row?.jobs) { res.status(404).json({ error: "Not found" }); return; }
  const job = row.jobs;
  const userId = req.userId!;
  const viewerIsParticipant = job.posterId === userId || job.claimedById === userId;
  if (job.status !== "open" && !viewerIsParticipant) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(shapeJob(job, row.users ? { id: row.users.id, name: row.users.name, avatar: row.users.avatar } : null));
});

/**
 * POST /api/jobs — create a new job. Country defaults to the user's country
 * so the country-targeted listing works without extra UI.
 */
router.post("/jobs", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const title = String(req.body?.title ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const location = req.body?.location ? String(req.body.location).trim() : null;
  const rawBudget = req.body?.budget;

  if (!title || title.length > MAX_TITLE) {
    res.status(400).json({ error: "Title is required (max 120 chars)" });
    return;
  }
  if (!description || description.length > MAX_DESCRIPTION) {
    res.status(400).json({ error: "Description is required (max 2000 chars)" });
    return;
  }
  if (location && location.length > MAX_LOCATION) {
    res.status(400).json({ error: "Location too long" });
    return;
  }

  let budget: number | null = null;
  if (rawBudget !== undefined && rawBudget !== null && rawBudget !== "") {
    const n = typeof rawBudget === "number" ? rawBudget : parseFloat(String(rawBudget));
    if (!Number.isFinite(n) || n < 0 || n > MAX_BUDGET) {
      res.status(400).json({ error: "Invalid budget" });
      return;
    }
    budget = n;
  }

  const country = req.user?.country ?? null;
  const fee = feeForCountry(country);

  // Admins / superadmins post for free — they help seed the marketplace
  // and shouldn't be paywalled. Their jobs are created already-paid + open.
  const isAdmin = Boolean(req.user?.isAdmin || (req.user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin);

  // Jobs is currently a Haiti-only feature — non-Haiti payment processing
  // (international card rails) is too complex for the current MVP, so we
  // gate posting at the API layer too. Admins are exempt so they can seed
  // jobs from anywhere.
  if (!isAdmin && (country ?? "").toLowerCase() !== "haiti") {
    res.status(403).json({ error: "Jobs are currently available in Haiti only" });
    return;
  }

  const [created] = await db.insert(jobsTable).values({
    posterId: req.userId!,
    title,
    description,
    location,
    budget,
    country,
    status: isAdmin ? "open" : "draft",
    paid: isAdmin,
    feeAmount: fee.amount,
    feeCurrency: fee.currency,
    paidAt: isAdmin ? new Date() : null,
    paymentMethod: isAdmin ? "admin" : null,
  }).returning();

  res.status(201).json({
    ...shapeJob(created, req.user ? { id: req.user.id, name: req.user.name, avatar: req.user.avatar } : null),
    fee: {
      amount: fee.amount,
      currency: fee.currency,
      methods: fee.methods,
      required: !isAdmin,
    },
  });
});

/**
 * POST /api/jobs/:id/pay — record the posting-fee payment for a draft job
 * and flip it to "open" so it shows up in the public list. Only the poster
 * can pay; the job must be in "draft" status (idempotency: paying twice
 * just re-asserts the same state).
 *
 * Body: { paymentMethod: "card"|"moncash"|"natcash"|"usdt", paymentRef: string }
 *
 * Note: this is a self-attested payment record (same pattern as
 * listings/:id/buy). When real Stripe / MonCash gateways come online we'll
 * verify the reference server-side; for now the reference is stored as
 * an audit trail.
 */
router.post("/jobs/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = req.userId!;

  const paymentMethod = String(req.body?.paymentMethod ?? "").trim();
  const paymentRef = String(req.body?.paymentRef ?? "wallet").trim();
  const ALLOWED_METHODS = ["card", "moncash", "natcash", "usdt", "fm_wallet"];
  if (!ALLOWED_METHODS.includes(paymentMethod)) {
    res.status(400).json({ error: "Invalid payment method" }); return;
  }
  if (paymentMethod !== "fm_wallet" && paymentRef.length < 4) {
    res.status(400).json({ error: "Invalid payment reference" }); return;
  }

  const [existing] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.posterId !== userId) {
    res.status(403).json({ error: "Only the poster can pay for this job" }); return;
  }
  if (existing.paid) {
    // Already paid → just return current shape (idempotent).
    res.json(shapeJob(existing, null));
    return;
  }

  // Verify the chosen method is allowed for this poster's country.
  const fee = feeForCountry(existing.country);
  const allowedMethodsWithWallet = [...fee.methods, "fm_wallet" as const];
  if (!allowedMethodsWithWallet.includes(paymentMethod as typeof allowedMethodsWithWallet[number])) {
    res.status(400).json({ error: `Payment method "${paymentMethod}" is not available in your region` });
    return;
  }

  // FM Wallet: instant deduction from user's balance
  if (paymentMethod === "fm_wallet") {
    const feeUsd = fee.currency === "HTG" ? fee.amount / 150 : fee.amount;
    const ok = await deductWalletHybrid(userId, feeUsd, `Djòb posting fee — job #${id}`, "boost_debit", userId);
    if (!ok) {
      res.status(402).json({ error: "Insufficient wallet balance. Please top up and try again." });
      return;
    }
  }

  // Atomic: only flip a draft that is still unpaid. This prevents two
  // concurrent /pay requests from both winning, and prevents reviving a
  // job that has been closed/banned/taken since the read above.
  const [updated] = await db.update(jobsTable)
    .set({
      paid: true,
      status: "open",
      paymentMethod,
      paymentRef: paymentMethod === "fm_wallet" ? "fm_wallet" : paymentRef,
      paidAt: new Date(),
      feeAmount: existing.feeAmount ?? fee.amount,
      feeCurrency: existing.feeCurrency ?? fee.currency,
    })
    .where(and(
      eq(jobsTable.id, id),
      eq(jobsTable.posterId, userId),
      eq(jobsTable.paid, false),
      eq(jobsTable.status, "draft"),
    ))
    .returning();

  if (!updated) {
    // Either someone else already paid (race) or the job is no longer in a
    // payable state. Re-fetch and respond idempotently if it's already paid.
    const [now] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (now?.paid) { res.json(shapeJob(now, null)); return; }
    res.status(409).json({ error: "Job is no longer payable" });
    return;
  }
  res.json(shapeJob(updated, null));
});

/**
 * POST /api/jobs/:id/claim — atomically claim an OPEN job. Implemented as a
 * conditional UPDATE so two simultaneous claimers can't both win:
 * the UPDATE only matches if status is still "open" and the claimer is not
 * the poster.
 */
router.post("/jobs/:id/claim", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = req.userId!;

  const updated = await db.update(jobsTable)
    .set({
      status: "claimed",
      claimedById: userId,
      claimedAt: new Date(),
    })
    .where(and(
      eq(jobsTable.id, id),
      eq(jobsTable.status, "open"),
      ne(jobsTable.posterId, userId),
    ))
    .returning();

  if (updated.length === 0) {
    // Distinguish "already taken" vs "your own job" so the UI can show the
    // right message. A single follow-up read is fine; this branch is rare.
    const [existing] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.posterId === userId) {
      res.status(403).json({ error: "You can't claim your own job", code: "OWN_JOB" });
      return;
    }
    res.status(409).json({ error: "This job has already been taken", code: "ALREADY_CLAIMED" });
    return;
  }

  res.json(shapeJob(updated[0], null));
});

/**
 * DELETE /api/jobs/:id — only the poster can delete, and only while the job
 * is still open. Once someone has claimed it we keep the row for the audit
 * trail / messaging follow-up.
 */
router.delete("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  // Allow the poster to delete either an unpaid draft (no fee was collected
  // yet) or an open, unclaimed job. Once a job is claimed/closed it stays.
  const deleted = await db.delete(jobsTable)
    .where(and(
      eq(jobsTable.id, id),
      eq(jobsTable.posterId, req.userId!),
      inArray(jobsTable.status, ["open", "draft"]),
    ))
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found or not deletable" });
    return;
  }
  res.json({ message: "Deleted" });
});

// ── My applications (job seeker sees their own submissions) ───────────────────

router.get("/jobs/my-applications", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db.execute(sql`
    SELECT ja.id, ja.job_id, ja.status, ja.cover_letter, ja.whatsapp, ja.employer_note, ja.created_at,
           j.title as job_title, j.status as job_status, j.poster_id,
           u.name as poster_name
    FROM job_applications ja
    JOIN jobs j ON j.id = ja.job_id
    JOIN users u ON u.id = j.poster_id
    WHERE ja.applicant_id = ${userId}
    ORDER BY ja.created_at DESC
    LIMIT 100
  `);
  res.json(rows.rows.map((r: any) => ({
    id: r.id,
    job_id: r.job_id,
    job_title: r.job_title,
    job_status: r.job_status,
    poster_name: r.poster_name,
    status: r.status,
    cover_letter: r.cover_letter,
    whatsapp: r.whatsapp,
    employer_note: r.employer_note,
    created_at: r.created_at,
  })));
});

// ── Employer verification routes ──────────────────────────────────────────────

router.get("/jobs/employer-status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const user = req.user as any;
  if (user?.isAdmin || user?.isSuperAdmin) {
    res.json({ status: "approved", isVerifiedEmployer: true, adminBypass: true });
    return;
  }
  const result = await db.execute(sql`
    SELECT id, status, rejection_reason, created_at FROM employer_verifications
    WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
  `);
  const app = result.rows[0] as any ?? null;
  const isVerifiedEmployer = Boolean(user?.isVerifiedEmployer);
  res.json({ status: app?.status ?? null, isVerifiedEmployer, application: app });
});

router.post("/jobs/employer-apply", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { fullName, phone, whatsapp, address, businessName, businessAddress, idSelfie, idFront, idBack, businessPhotos, socialLinks } = req.body as any;
  if (!fullName?.trim() || !phone?.trim() || !address?.trim()) {
    res.status(400).json({ error: "Full name, phone, and address are required." }); return;
  }
  const existing = await db.execute(sql`
    SELECT id, status FROM employer_verifications WHERE user_id = ${userId} AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1
  `);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: "You already have a pending or approved application." }); return;
  }
  await db.execute(sql`
    INSERT INTO employer_verifications (user_id, full_name, phone, whatsapp, address, business_name, business_address, id_selfie, id_front, id_back, business_photos, social_links)
    VALUES (${userId}, ${fullName.trim()}, ${phone.trim()}, ${whatsapp?.trim() ?? null}, ${address.trim()}, ${businessName?.trim() ?? null}, ${businessAddress?.trim() ?? null}, ${idSelfie ?? null}, ${idFront ?? null}, ${idBack ?? null}, ${businessPhotos ? JSON.stringify(businessPhotos) : null}, ${socialLinks ? JSON.stringify(socialLinks) : null})
  `);
  res.json({ message: "Application submitted. Super Admin will review shortly." });
});

// ── Job applications (seeker applies to a job) ────────────────────────────────

router.get("/jobs/:id/applications", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  const user = req.user as any;
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  const isOwner = job.posterId === userId || user?.isAdmin || user?.isSuperAdmin;
  if (!isOwner) { res.status(403).json({ error: "Forbidden" }); return; }
  const apps = await db.execute(sql`
    SELECT ja.*, u.name as applicant_name, u.avatar as applicant_avatar, u.phone as applicant_phone, u.rating, u.review_count
    FROM job_applications ja
    JOIN users u ON u.id = ja.applicant_id
    WHERE ja.job_id = ${jobId}
    ORDER BY ja.created_at DESC
  `);
  res.json(apps.rows);
});

router.post("/jobs/:id/apply", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const jobId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (!jobId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  if (job.status !== "open") { res.status(409).json({ error: "This job is no longer accepting applications." }); return; }
  if (job.posterId === userId) { res.status(403).json({ error: "You cannot apply to your own job." }); return; }
  const { coverLetter, whatsapp } = req.body as any;
  try {
    await db.execute(sql`
      INSERT INTO job_applications (job_id, applicant_id, cover_letter, whatsapp)
      VALUES (${jobId}, ${userId}, ${coverLetter?.trim() ?? null}, ${whatsapp?.trim() ?? null})
    `);
    await db.execute(sql`UPDATE jobs SET application_count = application_count + 1 WHERE id = ${jobId}`);
    res.json({ message: "Application submitted." });
  } catch (err: any) {
    if (err?.message?.includes("unique")) {
      res.status(409).json({ error: "You have already applied to this job." }); return;
    }
    throw err;
  }
});

router.patch("/jobs/:id/applications/:appId", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseInt(String(req.params.id), 10);
  const appId = parseInt(String(req.params.appId), 10);
  const userId = req.userId!;
  const { status, employerNote } = req.body as any;
  if (!["shortlisted", "rejected", "hired"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job || job.posterId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.execute(sql`
    UPDATE job_applications SET status = ${status}, employer_note = ${employerNote ?? null}, updated_at = NOW()
    WHERE id = ${appId} AND job_id = ${jobId}
  `);
  res.json({ message: "Updated" });
});

// ── Admin employer verification management ────────────────────────────────────

router.get("/admin/employer-verifications", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  if (!user?.isAdmin && !user?.isSuperAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  const status = req.query.status as string ?? "pending";
  const rows = await db.execute(sql`
    SELECT ev.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar
    FROM employer_verifications ev
    JOIN users u ON u.id = ev.user_id
    WHERE ev.status = ${status}
    ORDER BY ev.created_at DESC
    LIMIT 100
  `);
  res.json(rows.rows);
});

router.patch("/admin/employer-verifications/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  if (!user?.isSuperAdmin) { res.status(403).json({ error: "Only Super Admin can approve employer verifications." }); return; }
  const id = parseInt(String(req.params.id), 10);
  const { action, rejectionReason } = req.body as any;
  if (!["approve", "reject"].includes(action)) { res.status(400).json({ error: "Invalid action" }); return; }
  const evRes = await db.execute(sql`SELECT user_id FROM employer_verifications WHERE id = ${id}`);
  if (!evRes.rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const targetUserId = (evRes.rows[0] as any).user_id;
  if (action === "approve") {
    await db.execute(sql`UPDATE employer_verifications SET status = 'approved', reviewed_by = ${req.userId!}, reviewed_at = NOW(), updated_at = NOW() WHERE id = ${id}`);
    await db.execute(sql`UPDATE users SET is_verified_employer = TRUE WHERE id = ${targetUserId}`);
  } else {
    await db.execute(sql`UPDATE employer_verifications SET status = 'rejected', rejection_reason = ${rejectionReason ?? null}, reviewed_by = ${req.userId!}, reviewed_at = NOW(), updated_at = NOW() WHERE id = ${id}`);
  }
  res.json({ message: action === "approve" ? "Employer verified successfully." : "Application rejected." });
});

export default router;
