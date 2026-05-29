import { Router } from "express";
import { requireAdmin, requireSuperAdmin } from "../middlewares/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicApiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const ai = anthropicBaseURL && anthropicApiKey
  ? new Anthropic({ baseURL: anthropicBaseURL, apiKey: anthropicApiKey })
  : null;

// ─── GET /api/admin/wallet-monitor ────────────────────────────────────────────
// Returns per-user wallet audit: balance, sum_in, sum_out, expected, gap, flags
router.get("/admin/wallet-monitor", requireAdmin, async (req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        u.id                                                        AS user_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.is_flagged,
        u.is_banned,
        COALESCE(pw.balance_usd,   0)                              AS balance_usd,
        COALESCE(pw.promo_balance, 0)                              AS promo_balance,

        -- credit transactions
        COALESCE(SUM(wt.amount_usd) FILTER (WHERE wt.amount_usd > 0), 0) AS sum_in,
        -- debit transactions
        COALESCE(SUM(wt.amount_usd) FILTER (WHERE wt.amount_usd < 0), 0) AS sum_out,
        -- total count
        COUNT(wt.id)                                               AS tx_count,
        MAX(wt.created_at)                                         AS last_tx_at,

        -- breakdown by type for anomaly detection
        COALESCE(SUM(wt.amount_usd) FILTER (WHERE wt.type = 'admin_debit'),    0) AS admin_debit_total,
        COALESCE(SUM(wt.amount_usd) FILTER (WHERE wt.type = 'transfer_sent'),  0) AS transfer_sent_total,
        COUNT(wt.id)       FILTER (WHERE wt.type = 'admin_debit')               AS admin_debit_count,
        COUNT(wt.id)       FILTER (WHERE wt.type = 'transfer_sent')             AS transfer_count,

        -- large single debits (> $200 in last 30 days)
        COUNT(wt.id) FILTER (
          WHERE wt.amount_usd < -200
          AND wt.created_at > NOW() - INTERVAL '30 days'
        )                                                          AS large_debits_30d,

        -- velocity: transactions in last 24 h
        COUNT(wt.id) FILTER (
          WHERE wt.created_at > NOW() - INTERVAL '24 hours'
        )                                                          AS tx_last_24h

      FROM users u
      LEFT JOIN promo_wallets pw ON pw.user_id = u.id
      LEFT JOIN wallet_transactions wt ON wt.user_id = u.id
      WHERE u.is_deleted IS DISTINCT FROM true
      GROUP BY u.id, u.full_name, u.email, u.phone, u.country,
               u.is_flagged, u.is_banned, pw.balance_usd, pw.promo_balance
      HAVING COALESCE(pw.balance_usd, 0) > 0
          OR COUNT(wt.id) > 0
      ORDER BY ABS(COALESCE(pw.balance_usd, 0) - (
        COALESCE(SUM(wt.amount_usd) FILTER (WHERE wt.amount_usd > 0), 0)
        + COALESCE(SUM(wt.amount_usd) FILTER (WHERE wt.amount_usd < 0), 0)
      )) DESC, u.id
      LIMIT 500
    `);

    const accounts = (rows as unknown as any[]).map((r) => {
      const balance       = parseFloat(r.balance_usd)    ?? 0;
      const sumIn         = parseFloat(r.sum_in)         ?? 0;
      const sumOut        = parseFloat(r.sum_out)        ?? 0;
      const expected      = sumIn + sumOut;
      const gap           = parseFloat((balance - expected).toFixed(2));

      const adminDebitTotal   = parseFloat(r.admin_debit_total)   ?? 0;
      const transferSentTotal = parseFloat(r.transfer_sent_total) ?? 0;
      const largeDebits30d    = parseInt(r.large_debits_30d)      ?? 0;
      const txLast24h         = parseInt(r.tx_last_24h)           ?? 0;
      const adminDebitCount   = parseInt(r.admin_debit_count)     ?? 0;
      const transferCount     = parseInt(r.transfer_count)        ?? 0;

      const flags: string[] = [];
      if (Math.abs(gap) > 0.01)              flags.push("integrity_gap");
      if (adminDebitCount > 0)               flags.push("admin_debit");
      if (largeDebits30d > 0)                flags.push("large_debit_30d");
      if (txLast24h >= 10)                   flags.push("high_velocity_24h");
      if (transferCount >= 5)                flags.push("many_transfers");
      if (Math.abs(transferSentTotal) > 3000) flags.push("high_transfer_volume");

      const riskScore =
        (Math.abs(gap) > 0.01 ? 40 : 0) +
        (adminDebitCount > 0 ? 20 : 0) +
        (largeDebits30d > 2 ? 15 : largeDebits30d > 0 ? 5 : 0) +
        (txLast24h >= 10 ? 15 : txLast24h >= 5 ? 5 : 0) +
        (Math.abs(transferSentTotal) > 3000 ? 10 : 0);

      return {
        userId:            parseInt(r.user_id),
        fullName:          r.full_name,
        email:             r.email,
        phone:             r.phone,
        country:           r.country,
        isFlagged:         r.is_flagged,
        isBanned:          r.is_banned,
        balanceUsd:        balance,
        promoBalance:      parseFloat(r.promo_balance) ?? 0,
        sumIn,
        sumOut,
        expected:          parseFloat(expected.toFixed(2)),
        gap,
        txCount:           parseInt(r.tx_count) ?? 0,
        lastTxAt:          r.last_tx_at,
        adminDebitTotal,
        adminDebitCount,
        transferSentTotal,
        transferCount,
        largeDebits30d,
        txLast24h,
        flags,
        riskScore,
      };
    });

    // Global summary
    const totalBalance    = accounts.reduce((s, a) => s + a.balanceUsd, 0);
    const totalIn         = accounts.reduce((s, a) => s + a.sumIn, 0);
    const totalOut        = accounts.reduce((s, a) => s + a.sumOut, 0);
    const flaggedCount    = accounts.filter((a) => a.flags.length > 0).length;
    const integrityIssues = accounts.filter((a) => a.flags.includes("integrity_gap")).length;
    const highRisk        = accounts.filter((a) => a.riskScore >= 40).length;

    res.json({
      summary: {
        totalAccounts:  accounts.length,
        totalBalance:   parseFloat(totalBalance.toFixed(2)),
        totalIn:        parseFloat(totalIn.toFixed(2)),
        totalOut:       parseFloat(totalOut.toFixed(2)),
        flaggedCount,
        integrityIssues,
        highRisk,
      },
      accounts,
    });
  } catch (err: any) {
    req.log.error({ err }, "wallet-monitor list error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/admin/wallet-monitor/:userId/transactions ───────────────────────
router.get("/admin/wallet-monitor/:userId/transactions", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  try {
    const rows = await db.execute(sql`
      SELECT id, type, amount_usd, description, created_at, reference_id
      FROM wallet_transactions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ transactions: rows as unknown as any[] });
  } catch (err: any) {
    req.log.error({ err }, "wallet-monitor tx error");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/admin/wallet-monitor/:userId/analyze ───────────────────────────
// AI analysis of a user's wallet activity
router.post("/admin/wallet-monitor/:userId/analyze", requireSuperAdmin, async (req, res): Promise<void> => {
  if (!ai) { res.status(503).json({ error: "AI pa konfigire" }); return; }

  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  try {
    // Fetch user + their recent transactions
    const userRows = await db.execute(sql`
      SELECT u.id, u.full_name, u.email, u.country,
             COALESCE(pw.balance_usd, 0) AS balance_usd
      FROM users u
      LEFT JOIN promo_wallets pw ON pw.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `);
    if ((userRows as unknown as any[]).length === 0) { res.status(404).json({ error: "Kont pa jwenn" }); return; }
    const user = (userRows as unknown as any[])[0];

    const txRows = await db.execute(sql`
      SELECT type, amount_usd, description, created_at
      FROM wallet_transactions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 60
    `);
    const txs = txRows as unknown as any[];

    const sumIn  = txs.filter(t => parseFloat(t.amount_usd) > 0).reduce((s, t) => s + parseFloat(t.amount_usd), 0);
    const sumOut = txs.filter(t => parseFloat(t.amount_usd) < 0).reduce((s, t) => s + parseFloat(t.amount_usd), 0);
    const expected = sumIn + sumOut;
    const balance  = parseFloat(user.balance_usd);
    const gap      = (balance - expected).toFixed(2);

    const txSummary = txs.map(t =>
      `${new Date(t.created_at).toISOString().slice(0,10)} | ${t.type.padEnd(25)} | ${parseFloat(t.amount_usd) >= 0 ? "+" : ""}${parseFloat(t.amount_usd).toFixed(2)} USD | ${t.description ?? ""}`
    ).join("\n");

    const prompt = `Ou se yon ekspè analiz finansyè espesyalize nan deteksyon frod ak pwoteksyon kont itilizatè.

Analize kont pòtfèy sa a epi bay yon rapò kout an Kreyòl ayisyen:

**KONT:** ${user.full_name} (${user.email}) — ${user.country}
**Balans aktyèl:** $${balance.toFixed(2)} USD
**Total rantre (sum_in):** $${sumIn.toFixed(2)} USD
**Total soti (sum_out):** $${Math.abs(sumOut).toFixed(2)} USD
**Balans teyorik (sum_in + sum_out):** $${expected.toFixed(2)} USD
**Ekart (gap):** $${gap} USD ${Math.abs(parseFloat(gap)) > 0.01 ? "⚠️ PWOBLÈM ENTEGRITE" : "✓ OK"}

**60 dènye tranzaksyon:**
${txSummary || "Okenn tranzaksyon"}

---
Fè yon analiz kout (4-8 fraz) ki di:
1. Èske gen ekart balans ki pa nòmal? Si wi, eksplike poukisa sa enkyetan.
2. Ki tip tranzaksyon ki pi gwo risk pou kont sa a?
3. Èske gen patwon abi (transfer rapid, admin_debit, retrè gwo kòb)?
4. Rekòmandasyon pou admin an (bloke, surveye, ou kite?)

Repon an dwe kout, kler, ak pratik.`;

    const msg = await ai.messages.create({
      model:      "claude-opus-4-5",
      max_tokens: 800,
      messages:   [{ role: "user", content: prompt }],
    });

    const analysis = (msg.content[0] as any)?.text ?? "";
    res.json({
      userId,
      userName:  user.full_name,
      balance,
      expected:  parseFloat(expected.toFixed(2)),
      gap:       parseFloat(gap),
      analysis,
    });
  } catch (err: any) {
    req.log.error({ err }, "wallet-monitor analyze error");
    res.status(500).json({ error: "Analiz echwe" });
  }
});

export default router;
