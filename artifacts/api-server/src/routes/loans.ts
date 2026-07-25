import { Router } from "express";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { deductWallet } from "./wallet";
import { logger } from "../lib/logger";

const router = Router();

const ELIGIBLE_COUNTRIES = ["Haiti", "Dominican Republic"];
const MIN_DAYS = 90;
const INTEREST_RATE = 0.15;
const MIN_AMOUNT = 200;
const MAX_AMOUNT = 3000;

// ── Calculation helper ─────────────────────────────────────────────────────────
function calcRepayment(amount: number, termMonths: number) {
  const total = parseFloat((amount * (1 + INTEREST_RATE)).toFixed(2));
  const monthly = parseFloat((total / termMonths).toFixed(2));
  return { total, monthly, interest: parseFloat((total - amount).toFixed(2)) };
}

// ── Eligibility metrics ────────────────────────────────────────────────────────
async function fetchEligibilityMetrics(userId: number) {
  const [user] = await db
    .select({
      id: usersTable.id,
      country: usersTable.country,
      createdAt: usersTable.createdAt,
      isBanned: usersTable.isBanned,
      rating: usersTable.rating,
      reviewCount: usersTable.reviewCount,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  const now = new Date();
  const daysOnPlatform = Math.floor(
    (now.getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const salesRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM transactions
    WHERE seller_user_id = ${userId} AND order_status = 'delivered'
  `);
  const salesCount = parseInt((salesRes.rows[0] as any)?.cnt ?? "0", 10);

  const delivRes = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
      COUNT(*) as total
    FROM deliveries WHERE seller_id = ${userId}
  `);
  const dr = delivRes.rows[0] as any;
  const delivSuccessRate =
    parseInt(dr?.total ?? "0", 10) > 0
      ? Math.round((parseInt(dr.delivered ?? "0", 10) / parseInt(dr.total, 10)) * 100)
      : 100;

  const repRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM reports
    WHERE target_id = ${userId} AND target_type = 'user' AND status != 'dismissed'
  `);
  const reportCount = parseInt((repRes.rows[0] as any)?.cnt ?? "0", 10);

  const activeListRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM listings
    WHERE seller_id = ${userId} AND status = 'available'
  `);
  const activeListingCount = parseInt((activeListRes.rows[0] as any)?.cnt ?? "0", 10);

  return { user, daysOnPlatform, salesCount, delivSuccessRate, reportCount, activeListingCount };
}

// ── Generate installment schedule when loan is activated ───────────────────────
async function generateInstallmentSchedule(
  loanId: number, userId: number, amount: number, termMonths: number
) {
  const existing = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM loan_installments WHERE loan_id = ${loanId}`
  );
  if (parseInt((existing.rows[0] as any)?.cnt ?? "0", 10) > 0) return;

  const { total, monthly } = calcRepayment(amount, termMonths);
  const now = new Date();

  for (let i = 1; i <= termMonths; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + i);
    await db.execute(sql`
      INSERT INTO loan_installments (loan_id, user_id, installment_number, due_date, amount_usd, status)
      VALUES (${loanId}, ${userId}, ${i}, ${dueDate.toISOString()}, ${monthly}, 'pending')
    `);
  }

  await db.execute(sql`
    UPDATE loan_applications SET
      status = 'active',
      approved_at = NOW(),
      total_repayment_usd = ${total},
      amount_paid_usd = 0,
      updated_at = NOW()
    WHERE id = ${loanId}
  `);
}

// ── Process one installment (deduct from FM wallet) ────────────────────────────
async function processInstallment(
  installmentId: number, loanId: number, userId: number, amountUsd: number
): Promise<"success" | "failed" | "skipped"> {
  const checkRes = await db.execute(
    sql`SELECT status FROM loan_installments WHERE id = ${installmentId}`
  );
  const curStatus = (checkRes.rows[0] as any)?.status;
  if (curStatus === "paid") return "skipped";

  let success = false;
  try {
    success = await deductWallet(userId, amountUsd, `Vèsman prè #${loanId} — echeyans ${installmentId}`);
  } catch { success = false; }

  await db.execute(sql`
    INSERT INTO loan_payment_attempts (installment_id, loan_id, user_id, result, error_msg, amount_usd)
    VALUES (
      ${installmentId}, ${loanId}, ${userId},
      ${success ? "success" : "failed"},
      ${success ? null : "Balans FM Wallet ensifizant"},
      ${amountUsd}
    )
  `);

  if (success) {
    await db.execute(sql`
      UPDATE loan_installments SET status = 'paid', paid_at = NOW(), updated_at = NOW()
      WHERE id = ${installmentId}
    `);
    await db.execute(sql`
      UPDATE loan_applications SET
        amount_paid_usd = COALESCE(amount_paid_usd, 0) + ${amountUsd},
        updated_at = NOW()
      WHERE id = ${loanId}
    `);

    const remRes = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM loan_installments WHERE loan_id = ${loanId} AND status != 'paid'`
    );
    const remaining = parseInt((remRes.rows[0] as any)?.cnt ?? "1", 10);

    if (remaining === 0) {
      await db.execute(sql`
        UPDATE loan_applications SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${loanId}
      `);
      await db.insert(notificationsTable).values({
        userId, type: "loan_completed", isRead: false,
        meta: JSON.stringify({ loanId, message: "Felisitasyon! Ou fin peye prè ou a nèt. Ou ka re-aplike ankò." }),
      } as any).catch(() => {});
    } else {
      await db.insert(notificationsTable).values({
        userId, type: "loan_payment_success", isRead: false,
        meta: JSON.stringify({ loanId, installmentId, amount: amountUsd, message: `Peman $${amountUsd.toFixed(2)} ou a trete avèk siksè.` }),
      } as any).catch(() => {});
    }
    return "success";
  } else {
    await db.execute(sql`
      UPDATE loan_installments SET
        retry_count = COALESCE(retry_count, 0) + 1,
        last_retry_at = NOW(),
        status = CASE WHEN COALESCE(retry_count, 0) >= 3 THEN 'overdue' ELSE 'failed' END,
        updated_at = NOW()
      WHERE id = ${installmentId}
    `);
    await db.insert(notificationsTable).values({
      userId, type: "loan_payment_failed", isRead: false,
      meta: JSON.stringify({ loanId, installmentId, amount: amountUsd, message: `Peman $${amountUsd.toFixed(2)} echwe — rechaje FM Wallet ou.` }),
    } as any).catch(() => {});
    return "failed";
  }
}

// ── Admin auto-rejection job: rejects non-super-admin applications after 24h ──
export async function runLoanAdminRejectionJob() {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const staleRes = await db.execute(sql`
    SELECT la.id, la.user_id
    FROM loan_applications la
    JOIN users u ON u.id = la.user_id
    WHERE u.is_admin = TRUE
      AND (u.is_super_admin = FALSE OR u.is_super_admin IS NULL)
      AND la.status IN ('pending_review', 'under_verification')
      AND la.created_at < ${cutoff}
  `);

  for (const row of staleRes.rows as any[]) {
    try {
      await db.execute(sql`
        UPDATE loan_applications SET
          status = 'auto_rejected',
          reviewer_note = 'Loan request rejected. Admin and internal staff accounts are not eligible for merchant financing. Only Super Admin accounts can access internal financing test permissions.',
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${row.id}
      `);
      await db.insert(notificationsTable).values({
        userId: row.user_id,
        type: "loan_auto_rejected",
        isRead: false,
        meta: JSON.stringify({
          loanId: row.id,
          message: "Loan request rejected. Admin and internal staff accounts are not eligible for merchant financing. Only Super Admin accounts can access internal financing test permissions.",
        }),
      } as any).catch(() => {});
      logger.info({ loanId: row.id, userId: row.user_id }, "Auto-rejected admin loan application");
    } catch (err) {
      logger.warn({ err, loanId: row.id }, "Admin loan auto-rejection error");
    }
  }
}

// ── Background job: runs every hour, processes due installments ────────────────
export async function runLoanRepaymentJob() {
  const now = new Date();
  const h24  = new Date(now.getTime() - 24  * 3600 * 1000).toISOString();
  const h72  = new Date(now.getTime() - 72  * 3600 * 1000).toISOString();
  const h168 = new Date(now.getTime() - 168 * 3600 * 1000).toISOString();

  const dueRes = await db.execute(sql`
    SELECT li.id, li.loan_id, li.user_id, li.amount_usd, li.retry_count, li.status
    FROM loan_installments li
    JOIN loan_applications la ON la.id = li.loan_id
    WHERE la.status = 'active'
      AND li.status IN ('pending', 'failed')
      AND li.due_date <= ${now.toISOString()}
      AND (
        li.status = 'pending'
        OR (li.retry_count = 1 AND li.last_retry_at <= ${h24})
        OR (li.retry_count = 2 AND li.last_retry_at <= ${h72})
        OR (li.retry_count = 3 AND li.last_retry_at <= ${h168})
      )
      AND li.retry_count < 4
    ORDER BY li.due_date ASC
    LIMIT 200
  `);

  let processed = 0;
  for (const row of dueRes.rows as any[]) {
    try {
      const result = await processInstallment(
        row.id, row.loan_id, row.user_id, parseFloat(row.amount_usd)
      );
      if (result !== "skipped") processed++;
    } catch (err) {
      logger.warn({ err, installmentId: row.id }, "Loan repayment job: installment error");
    }
  }

  if (processed > 0) {
    logger.info({ processed }, "Loan repayment job complete");
  }
}

// ── Admin scope helper ─────────────────────────────────────────────────────────
function resolveAdminCountries(actor: any): string[] | null {
  if (actor.isSuperAdmin) return null;
  let allowed: string[] | null = null;
  if (actor.adminScopeCountries) {
    try { allowed = JSON.parse(actor.adminScopeCountries) as string[]; } catch { /* ignore */ }
  }
  if (!allowed && actor.adminScopeCountry) allowed = [actor.adminScopeCountry];
  if (!allowed && actor.country) allowed = [actor.country];
  return allowed;
}

// ── GET /api/loans/eligibility ─────────────────────────────────────────────────
router.get("/loans/eligibility", requireAuth, async (req, res) => {
  try {
    const actor = (req as any).user;
    const userId = actor.id;
    const isSuperAdmin = !!actor.isSuperAdmin;
    const isAdminUser  = !isSuperAdmin && !!actor.isAdmin;

    const m = await fetchEligibilityMetrics(userId);
    if (!m) { res.status(404).json({ error: "User not found" }); return; }

    const { user, daysOnPlatform, salesCount, delivSuccessRate, reportCount, activeListingCount } = m;
    const countryEligible  = isSuperAdmin || isAdminUser || ELIGIBLE_COUNTRIES.includes(user.country ?? "");
    const timeEligible     = isSuperAdmin || isAdminUser || daysOnPlatform >= MIN_DAYS;
    const listingEligible  = isSuperAdmin || isAdminUser || activeListingCount >= 10;

    const appRes = await db.execute(sql`
      SELECT id, status, amount_requested, term_months, created_at, reviewer_note,
             approved_at, completed_at, total_repayment_usd, amount_paid_usd
      FROM loan_applications WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT 1
    `);
    const app = appRes.rows[0] as any ?? null;

    // If the user has any prior application (rejected, completed, etc.) they
    // have already cleared the 90-day time gate once — do not make them wait
    // another 90 days just because a previous attempt was rejected.
    const hasPriorApplication = !!app;
    const effectiveTimeEligible = timeEligible || hasPriorApplication;
    const eligible = (isSuperAdmin || isAdminUser)
      ? true
      : (countryEligible && effectiveTimeEligible && listingEligible && !user.isBanned);

    res.json({
      eligible,
      countryEligible,
      country: user.country,
      accountCreatedAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
      daysOnPlatform,
      daysRemaining: Math.max(0, MIN_DAYS - daysOnPlatform),
      minDays: MIN_DAYS,
      interestRate: INTEREST_RATE,
      minAmount: MIN_AMOUNT,
      maxAmount: MAX_AMOUNT,
      isSuperAdmin,
      isAdminUser,
      adminWillAutoReject: isAdminUser,
      listingEligible,
      activeListingCount,
      minListings: 10,
      metrics: {
        salesCount,
        activeListingCount,
        avgRating: parseFloat((user.rating ?? 0).toFixed(1)),
        reviewCount: user.reviewCount ?? 0,
        deliverySuccessRate: delivSuccessRate,
        reportCount,
      },
      existingApplication: app
        ? {
            id: app.id,
            status: app.status,
            amountRequested: app.amount_requested,
            termMonths: app.term_months,
            createdAt: app.created_at,
            reviewerNote: app.reviewer_note,
            approvedAt: app.approved_at,
            completedAt: app.completed_at,
            totalRepaymentUsd: app.total_repayment_usd,
            amountPaidUsd: app.amount_paid_usd,
          }
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "GET /api/loans/eligibility error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/loans/apply ──────────────────────────────────────────────────────
router.post("/loans/apply", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const m = await fetchEligibilityMetrics(userId);
    if (!m) { res.status(404).json({ error: "User not found" }); return; }

    const actor = (req as any).user;
    const isSuperAdmin = !!actor.isSuperAdmin;
    const isAdminUser  = !isSuperAdmin && !!actor.isAdmin;

    const { user, daysOnPlatform, activeListingCount } = m;

    // Only check country/days/listings for regular users; admins & super admins bypass
    if (!isSuperAdmin && !isAdminUser) {
      if (!ELIGIBLE_COUNTRIES.includes(user.country ?? "")) {
        res.status(403).json({ error: "This feature is only available in Haiti and Dominican Republic." });
        return;
      }
      if (activeListingCount < 10) {
        res.status(403).json({
          error: `Ou bezwen oumenm 10 atik disponib pou vann pou aplike. Ou gen ${activeListingCount} kounye a.`,
          listingEligible: false,
          activeListingCount,
          minListings: 10,
        });
        return;
      }
      // Check whether the user has any prior application (rejected/completed).
      // If so, they already cleared the 90-day gate once — skip the time check.
      const priorAppRes = await db.execute(sql`
        SELECT id FROM loan_applications WHERE user_id = ${userId} LIMIT 1
      `);
      const hasPriorApp = (priorAppRes.rows.length ?? 0) > 0;
      if (!hasPriorApp && daysOnPlatform < MIN_DAYS) {
        res.status(403).json({ error: `You need at least ${MIN_DAYS} days on the platform to apply.` });
        return;
      }
    }
    if (user.isBanned && !isSuperAdmin) {
      res.status(403).json({ error: "Your account is currently restricted." });
      return;
    }

    const existingRes = await db.execute(sql`
      SELECT id, status FROM loan_applications
      WHERE user_id = ${userId} AND status NOT IN ('rejected', 'completed', 'auto_rejected')
      ORDER BY created_at DESC LIMIT 1
    `);
    if (existingRes.rows.length > 0) {
      const existingRow = existingRes.rows[0] as any;
      // Super admins can always reapply for testing — auto-cancel any pending app
      if (isSuperAdmin && existingRow.status !== "active") {
        await db.execute(sql`
          UPDATE loan_applications SET
            status = 'auto_rejected',
            reviewer_note = 'Cancelled by super admin to create a new test application.',
            reviewed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${existingRow.id}
        `);
      } else {
        res.status(409).json({ error: "You already have an active application." });
        return;
      }
    }

    const {
      amountRequested, termMonths,
      fullName, dob, whatsapp, businessPhone, emergencyPhone, address, city, country,
      businessName, businessCategory, businessDescription, businessAgeYears, monthlySalesUsd,
      businessPhotos, productPhotos, businessDocs, identityDoc,
      facebookUrl, tiktokUrl, instagramUrl,
    } = req.body;

    if (!amountRequested || amountRequested < MIN_AMOUNT || amountRequested > MAX_AMOUNT) {
      res.status(400).json({ error: `Loan amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}` });
      return;
    }
    if (!fullName?.trim()) {
      res.status(400).json({ error: "Full name is required." });
      return;
    }
    if (!identityDoc?.trim()) {
      res.status(400).json({ error: "Identity document photo is required." });
      return;
    }

    const insertRes = await db.execute(sql`
      INSERT INTO loan_applications (
        user_id, status, amount_requested, term_months,
        full_name, dob, whatsapp, business_phone, emergency_phone, address, city, country,
        business_name, business_category, business_description, business_age_years, monthly_sales_usd,
        business_photos, product_photos, business_docs, identity_doc,
        facebook_url, tiktok_url, instagram_url
      ) VALUES (
        ${userId}, 'pending_review', ${amountRequested}, ${termMonths ?? 6},
        ${fullName ?? null}, ${dob ?? null}, ${whatsapp ?? null}, ${businessPhone ?? null},
        ${emergencyPhone ?? null}, ${address ?? null}, ${city ?? null}, ${country ?? user.country},
        ${businessName ?? null}, ${businessCategory ?? null}, ${businessDescription ?? null},
        ${businessAgeYears ?? null}, ${monthlySalesUsd ?? null},
        ${JSON.stringify(businessPhotos ?? [])}::jsonb,
        ${JSON.stringify(productPhotos ?? [])}::jsonb,
        ${JSON.stringify(businessDocs ?? [])}::jsonb,
        ${identityDoc ?? null},
        ${facebookUrl ?? null}, ${tiktokUrl ?? null}, ${instagramUrl ?? null}
      ) RETURNING id, status, created_at
    `);

    const newApp = insertRes.rows[0] as any;
    res.status(201).json({ id: newApp.id, status: newApp.status, createdAt: newApp.created_at });
  } catch (err) {
    req.log.error({ err }, "POST /api/loans/apply error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/loans/my ─────────────────────────────────────────────────────────
router.get("/loans/my", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const appsRes = await db.execute(sql`
      SELECT id, status, amount_requested, term_months, reviewer_note,
             approved_at, completed_at, total_repayment_usd, amount_paid_usd,
             created_at, updated_at
      FROM loan_applications WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `);
    res.json({ applications: appsRes.rows });
  } catch (err) {
    req.log.error({ err }, "GET /api/loans/my error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/loans/my/installments ────────────────────────────────────────────
router.get("/loans/my/installments", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { loanId } = req.query as Record<string, string>;

    let filter = sql`WHERE li.user_id = ${userId}`;
    if (loanId) filter = sql`WHERE li.user_id = ${userId} AND li.loan_id = ${parseInt(loanId, 10)}`;

    const rows = await db.execute(sql`
      SELECT
        li.id, li.loan_id, li.installment_number, li.due_date, li.amount_usd,
        li.status, li.paid_at, li.retry_count, li.last_retry_at, li.created_at,
        (SELECT json_agg(pa ORDER BY pa.attempted_at DESC)
         FROM loan_payment_attempts pa WHERE pa.installment_id = li.id) as attempts
      FROM loan_installments li
      ${filter}
      ORDER BY li.installment_number ASC
    `);

    res.json({ installments: rows.rows });
  } catch (err) {
    req.log.error({ err }, "GET /api/loans/my/installments error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/loans/:id/retry-payment ─────────────────────────────────────────
router.post("/loans/:id/retry-payment", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const loanId = parseInt(req.params.id as string, 10);
    const { installmentId } = req.body as { installmentId: number };

    const instRes = await db.execute(sql`
      SELECT li.id, li.loan_id, li.user_id, li.amount_usd, li.status
      FROM loan_installments li
      WHERE li.id = ${installmentId} AND li.loan_id = ${loanId} AND li.user_id = ${userId}
    `);
    const inst = instRes.rows[0] as any;
    if (!inst) { res.status(404).json({ error: "Installment not found" }); return; }
    if (inst.status === "paid") { res.status(400).json({ error: "Already paid" }); return; }

    const result = await processInstallment(installmentId, loanId, userId, parseFloat(inst.amount_usd));
    res.json({ result });
  } catch (err) {
    req.log.error({ err }, "POST /api/loans/:id/retry-payment error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/loans ───────────────────────────────────────────────────────
router.get("/admin/loans", requireAuth, async (req, res) => {
  try {
    const actor = (req as any).user;
    if (!actor.isAdmin && !actor.isSuperAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }

    const allowedCountries = resolveAdminCountries(actor);
    const countryClause = allowedCountries && allowedCountries.length > 0
      ? sql`AND u.country = ANY(ARRAY[${sql.raw(allowedCountries.map(c => `'${c.replace(/'/g, "''")}'`).join(","))}]::text[])`
      : sql``;

    const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const statusFilter = status && status !== "all" ? sql`AND la.status = ${status}` : sql``;

    const appsRes = await db.execute(sql`
      SELECT
        la.id, la.status, la.amount_requested, la.term_months,
        la.full_name, la.whatsapp, la.business_phone, la.city, la.country,
        la.business_name, la.business_category, la.monthly_sales_usd,
        la.identity_doc, la.business_photos, la.product_photos, la.business_docs,
        la.facebook_url, la.tiktok_url, la.instagram_url,
        la.reviewer_note, la.reviewed_at, la.created_at,
        la.approved_at, la.completed_at, la.total_repayment_usd, la.amount_paid_usd,
        u.id as applicant_id, u.name as applicant_name, u.email as applicant_email,
        u.avatar as applicant_avatar, u.rating as applicant_rating,
        u.review_count as applicant_review_count, u.is_verified as applicant_verified,
        u.created_at as applicant_joined,
        rv.name as reviewer_name,
        (SELECT COUNT(*) FROM loan_installments li WHERE li.loan_id = la.id AND li.status = 'overdue') as overdue_count,
        (SELECT COUNT(*) FROM loan_installments li WHERE li.loan_id = la.id AND li.status = 'failed') as failed_count
      FROM loan_applications la
      JOIN users u ON u.id = la.user_id
      LEFT JOIN users rv ON rv.id = la.reviewer_id
      WHERE 1=1 ${statusFilter} ${countryClause}
      ORDER BY la.created_at DESC
      LIMIT ${parseInt(limit as string, 10)} OFFSET ${parseInt(offset as string, 10)}
    `);

    const countRes = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM loan_applications la
      JOIN users u ON u.id = la.user_id
      WHERE 1=1 ${statusFilter} ${countryClause}
    `);

    res.json({
      applications: appsRes.rows,
      total: parseInt((countRes.rows[0] as any)?.cnt ?? "0", 10),
      scopeCountries: allowedCountries ?? ["All"],
    });
  } catch (err) {
    req.log.error({ err }, "GET /api/admin/loans error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/loans/:id/installments ─────────────────────────────────────
router.get("/admin/loans/:id/installments", requireAuth, async (req, res) => {
  try {
    const actor = (req as any).user;
    if (!actor.isAdmin && !actor.isSuperAdmin) {
      res.status(403).json({ error: "Admin only" }); return;
    }
    const loanId = parseInt(req.params.id as string, 10);

    const rows = await db.execute(sql`
      SELECT
        li.id, li.loan_id, li.installment_number, li.due_date, li.amount_usd,
        li.status, li.paid_at, li.retry_count, li.last_retry_at, li.created_at,
        (SELECT json_agg(pa ORDER BY pa.attempted_at DESC)
         FROM loan_payment_attempts pa WHERE pa.installment_id = li.id) as attempts
      FROM loan_installments li
      WHERE li.loan_id = ${loanId}
      ORDER BY li.installment_number ASC
    `);

    res.json({ installments: rows.rows });
  } catch (err) {
    req.log.error({ err }, "GET /api/admin/loans/:id/installments error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/admin/loans/:id/installments/:instId/retry ──────────────────────
router.post("/admin/loans/:id/installments/:instId/retry", requireAuth, async (req, res) => {
  try {
    const actor = (req as any).user;
    if (!actor.isAdmin && !actor.isSuperAdmin) {
      res.status(403).json({ error: "Admin only" }); return;
    }
    const loanId = parseInt(req.params.id as string, 10);
    const instId = parseInt(req.params.instId as string, 10);

    const instRes = await db.execute(sql`
      SELECT li.id, li.user_id, li.amount_usd, li.status
      FROM loan_installments li
      WHERE li.id = ${instId} AND li.loan_id = ${loanId}
    `);
    const inst = instRes.rows[0] as any;
    if (!inst) { res.status(404).json({ error: "Not found" }); return; }
    if (inst.status === "paid") { res.status(400).json({ error: "Already paid" }); return; }

    // Reset retry count so it can attempt again
    await db.execute(sql`
      UPDATE loan_installments SET retry_count = 0, status = 'failed', updated_at = NOW()
      WHERE id = ${instId}
    `);

    const result = await processInstallment(instId, loanId, inst.user_id, parseFloat(inst.amount_usd));
    res.json({ result });
  } catch (err) {
    req.log.error({ err }, "POST admin loans installment retry error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/loans/:id ────────────────────────────────────────────────
router.patch("/admin/loans/:id", requireAuth, async (req, res) => {
  try {
    const actor = (req as any).user;
    if (!actor.isAdmin && !actor.isSuperAdmin) {
      res.status(403).json({ error: "Admin only" }); return;
    }
    const loanId = parseInt(req.params.id as string, 10);

    if (!actor.isSuperAdmin) {
      const allowedCountries = resolveAdminCountries(actor);
      if (allowedCountries && allowedCountries.length > 0) {
        const appRes = await db.execute(sql`
          SELECT u.country FROM loan_applications la
          JOIN users u ON u.id = la.user_id
          WHERE la.id = ${loanId}
        `);
        const appCountry = (appRes.rows[0] as any)?.country;
        if (appCountry && !allowedCountries.includes(appCountry)) {
          res.status(403).json({ error: `Aksè refize: zòn "${appCountry}" pa nan pèmisyon ou (${allowedCountries.join(", ")})` });
          return;
        }
      }
    }

    const { status, reviewerNote } = req.body as { status: string; reviewerNote?: string };
    const validStatuses = ["pending_review", "under_verification", "approved", "active", "rejected", "more_info_required"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }

    // When admin approves → generate schedule and activate
    if (status === "approved" || status === "active") {
      const loanRes = await db.execute(sql`
        SELECT user_id, amount_requested, term_months, status FROM loan_applications WHERE id = ${loanId}
      `);
      const loan = loanRes.rows[0] as any;
      if (!loan) { res.status(404).json({ error: "Loan not found" }); return; }

      await db.execute(sql`
        UPDATE loan_applications SET
          reviewer_id = ${actor.id},
          reviewer_note = ${reviewerNote ?? null},
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${loanId}
      `);

      if (loan.status !== "active" && loan.status !== "completed") {
        await generateInstallmentSchedule(
          loanId,
          loan.user_id,
          parseFloat(loan.amount_requested),
          loan.term_months
        );
        await db.insert(notificationsTable).values({
          userId: loan.user_id, type: "loan_approved", isRead: false,
          meta: JSON.stringify({ loanId, message: "Felisitasyon! Prè ou a apwouve. Rembourseman otomatik kòmanse." }),
        } as any).catch(() => {});
      }

      res.json({ success: true, activated: true });
      return;
    }

    await db.execute(sql`
      UPDATE loan_applications SET
        status = ${status},
        reviewer_id = ${actor.id},
        reviewer_note = ${reviewerNote ?? null},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${loanId}
    `);

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "PATCH /api/admin/loans/:id error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
