import { Router, type IRouter } from "express";
import { db, platformSettingsTable, adminLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * Payment-provider configuration.
 *
 * The platform supports three payment rails:
 *   - stripe   → international cards
 *   - moncash  → Digicel (Haiti) mobile money
 *   - natcash  → Natcom  (Haiti) mobile money
 *
 * Each provider's config is stored as a single JSON blob in the existing
 * `platform_settings` key/value table. We do not introduce a new table —
 * keeping things in one place mirrors how `commission_rate_default` is
 * already stored there.
 *
 * Secret fields (API secret keys, client secrets, merchant passwords) are
 * NEVER returned to the client in plaintext. Reads return a masked
 * representation showing only the last 4 chars plus a `*Set` boolean so
 * the admin UI can show "•••• 4f3a (configured)" without leaking the
 * actual credential. Writes only update the fields that are sent — an
 * empty string for a secret field is treated as "leave it alone" so the
 * admin can update one field (e.g. publishable key) without having to
 * re-enter all credentials.
 */

type ProviderId = "stripe" | "moncash" | "natcash";
const PROVIDERS: ProviderId[] = ["stripe", "moncash", "natcash"];
const SETTING_KEY = (p: ProviderId) => `payment_provider_${p}`;

// ── Default empty configs ─────────────────────────────────────────────────

const DEFAULT_CONFIG: Record<ProviderId, Record<string, unknown>> = {
  stripe: {
    enabled: false,
    mode: "test",          // "test" | "live"
    publishableKey: "",
    secretKey: "",
    webhookSecret: "",
  },
  moncash: {
    enabled: false,
    mode: "sandbox",       // "sandbox" | "live"
    clientId: "",
    clientSecret: "",
    callbackUrl: "",
    // Phone number customers send manual boost / checkout payments to.
    phoneNumber: "+509 3600-3636",
  },
  natcash: {
    enabled: false,
    mode: "sandbox",       // "sandbox" | "live"
    apiBaseUrl: "",
    merchantNumber: "",
    merchantPassword: "",
    // Phone number customers send manual boost / checkout payments to.
    phoneNumber: "+509 3900-3636",
  },
};

// Which fields are secrets (must be masked when read, leave-alone-on-empty when written).
const SECRET_FIELDS: Record<ProviderId, string[]> = {
  stripe: ["secretKey", "webhookSecret"],
  moncash: ["clientSecret"],
  natcash: ["merchantPassword"],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function isProvider(p: string): p is ProviderId {
  return (PROVIDERS as string[]).includes(p);
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

async function readConfig(provider: ProviderId): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, SETTING_KEY(provider)));
  if (!row) return { ...DEFAULT_CONFIG[provider] };
  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_CONFIG[provider], ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG[provider] };
  }
}

async function writeConfig(provider: ProviderId, cfg: Record<string, unknown>): Promise<void> {
  const value = JSON.stringify(cfg);
  const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, SETTING_KEY(provider)));
  if (existing.length === 0) {
    await db.insert(platformSettingsTable).values({ key: SETTING_KEY(provider), value });
  } else {
    await db.update(platformSettingsTable).set({ value, updatedAt: new Date() }).where(eq(platformSettingsTable.key, SETTING_KEY(provider)));
  }
}

/** Strip secret values and replace with masked-display + *Set boolean. */
function publicizeForAdmin(provider: ProviderId, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SECRET_FIELDS[provider].includes(k)) {
      const s = typeof v === "string" ? v : "";
      out[k] = maskSecret(s);     // masked display
      out[`${k}Set`] = s.length > 0;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/payment-providers
 * Returns config for all 3 providers with secrets masked.
 */
router.get("/admin/payment-providers", requireAuth, requireSuperAdmin, async (_req, res): Promise<void> => {
  const result: Record<string, unknown> = {};
  for (const p of PROVIDERS) {
    const cfg = await readConfig(p);
    result[p] = publicizeForAdmin(p, cfg);
  }
  res.json(result);
});

/**
 * PUT /api/admin/payment-providers/:provider
 * Body: partial config object. Empty-string secret fields are ignored
 * (so the admin can update non-secret fields without re-entering keys).
 */
router.put("/admin/payment-providers/:provider", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const provider = req.params.provider;
  if (!isProvider(provider)) { res.status(400).json({ error: "Unknown provider" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  const current = await readConfig(provider);
  const next: Record<string, unknown> = { ...current };

  // Only allow writing keys that exist in the default schema for this
  // provider — prevents accidental injection of arbitrary settings.
  for (const key of Object.keys(DEFAULT_CONFIG[provider])) {
    if (!(key in body)) continue;
    const v = body[key];

    // Booleans — STRICT: reject anything that isn't a real boolean.
    // (Boolean("false") === true; we don't want a misbehaving client to
    // accidentally enable a provider by sending the string "false".)
    if (typeof DEFAULT_CONFIG[provider][key] === "boolean") {
      if (typeof v !== "boolean") {
        res.status(400).json({ error: `Field "${key}" must be a boolean` });
        return;
      }
      next[key] = v;
      continue;
    }

    // Mode is restricted to a known set per provider.
    if (key === "mode") {
      const allowed = provider === "stripe" ? ["test", "live"] : ["sandbox", "live"];
      if (typeof v !== "string" || !allowed.includes(v)) {
        res.status(400).json({ error: `Field "mode" must be one of: ${allowed.join(", ")}` });
        return;
      }
      next[key] = v;
      continue;
    }

    // Strings
    if (typeof v !== "string") {
      res.status(400).json({ error: `Field "${key}" must be a string` });
      return;
    }
    const trimmed = v.trim();
    // Secret fields: ignore empty (means "leave existing value alone").
    if (SECRET_FIELDS[provider].includes(key) && trimmed === "") continue;
    next[key] = trimmed;
  }

  // Cannot enable a provider that is missing required credentials.
  if (next.enabled === true) {
    const missing = checkMissingCredentials(provider, next);
    if (missing.length > 0) {
      res.status(400).json({ error: `Cannot enable: missing required credentials — ${missing.join(", ")}` });
      return;
    }
  }

  await writeConfig(provider, next);

  res.json({ provider, config: publicizeForAdmin(provider, next) });
});

function checkMissingCredentials(provider: ProviderId, cfg: Record<string, unknown>): string[] {
  const required: Record<ProviderId, string[]> = {
    stripe: ["publishableKey", "secretKey"],
    moncash: ["clientId", "clientSecret"],
    natcash: ["apiBaseUrl", "merchantNumber", "merchantPassword"],
  };
  return required[provider].filter((f) => {
    const v = cfg[f];
    return typeof v !== "string" || v.trim() === "";
  });
}

// ── USDT TRX Wallet ───────────────────────────────────────────────────────

const USDT_WALLET_KEY = "usdt_trx_wallet_address";

/**
 * GET /api/admin/usdt-wallet
 * Super-admin only. Returns the current USDT TRX wallet address.
 */
router.get("/admin/usdt-wallet", requireAuth, requireSuperAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, USDT_WALLET_KEY));
  res.json({ address: row?.value ?? "" });
});

/**
 * PUT /api/admin/usdt-wallet
 * Super-admin only. Updates the USDT TRX wallet address.
 * Body: { address: string }
 */
router.put("/admin/usdt-wallet", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.address !== "string") {
    res.status(400).json({ error: "address must be a string" });
    return;
  }
  const address = body.address.trim();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, USDT_WALLET_KEY));
    const oldAddress = existing[0]?.value ?? "";
    if (existing.length === 0) {
      await tx.insert(platformSettingsTable).values({ key: USDT_WALLET_KEY, value: address });
    } else {
      await tx.update(platformSettingsTable).set({ value: address, updatedAt: new Date() }).where(eq(platformSettingsTable.key, USDT_WALLET_KEY));
    }
    await tx.insert(adminLogsTable).values({
      adminId: req.userId!,
      action: "update_usdt_wallet",
      targetType: "platform_settings",
      targetId: null,
      details: JSON.stringify({ oldAddress, newAddress: address }),
    });
  });
  res.json({ address });
});

/**
 * GET /api/payment-providers/enabled
 * Public, unauthenticated. Returns which providers are currently enabled
 * so the checkout / boost UI can show only the relevant payment buttons.
 * NEVER includes secret material.
 */
router.get("/payment-providers/enabled", async (_req, res): Promise<void> => {
  const out: Record<string, { enabled: boolean; mode: string }> = {};
  for (const p of PROVIDERS) {
    const cfg = await readConfig(p);
    out[p] = {
      enabled: Boolean(cfg.enabled),
      mode: typeof cfg.mode === "string" ? cfg.mode : "",
    };
  }
  res.json(out);
});

/**
 * GET /api/payment-providers/usdt-wallet
 * Public, unauthenticated. Returns the current USDT TRX wallet address
 * so the boost / checkout UI can display it to customers without requiring auth.
 */
router.get("/payment-providers/usdt-wallet", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, USDT_WALLET_KEY));
  res.json({ address: row?.value ?? "" });
});

/**
 * GET /api/payment-providers/numbers
 * Public, unauthenticated. Returns the MonCash and NatCash phone numbers
 * that the boost / checkout UI shows to customers for manual transfers.
 * Only phone numbers are returned — no secret credentials.
 */
router.get("/payment-providers/numbers", async (_req, res): Promise<void> => {
  const [mc, nc] = await Promise.all([readConfig("moncash"), readConfig("natcash")]);
  res.json({
    moncash: typeof mc.phoneNumber === "string" && mc.phoneNumber.trim()
      ? mc.phoneNumber.trim()
      : (DEFAULT_CONFIG.moncash.phoneNumber as string),
    natcash: typeof nc.phoneNumber === "string" && nc.phoneNumber.trim()
      ? nc.phoneNumber.trim()
      : (DEFAULT_CONFIG.natcash.phoneNumber as string),
  });
});

export default router;
