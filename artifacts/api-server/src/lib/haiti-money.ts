import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
export {
  isHaitiPhone,
  makeHaitiQuote,
  monCashReady,
  natCashReady,
  parsePositiveMoney,
  roundMoney,
} from "./haiti-money-core";
import type { HaitiMoneyProvider, HaitiQuote, QuoteDirection } from "./haiti-money-core";

export type { HaitiMoneyProvider, HaitiQuote, QuoteDirection };

export interface MonCashRuntimeConfig {
  enabled: boolean;
  payoutEnabled: boolean;
  mode: "sandbox" | "live";
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  adapter: "bazik" | "digicel";
  bazikUserId: string;
  bazikSecretKey: string;
  bazikWebhookSecret: string;
  bazikWebhookUrl: string;
}

export interface NatCashRuntimeConfig {
  enabled: boolean;
  apiBaseUrl: string;
  merchantId: string;
  partnerId: string;
  username: string;
  password: string;
  privateKey: string;
  functionCode: string;
  callbackUrl: string;
}

const MONCASH_ENV = {
  enabled: "MONCASH_ENABLED",
  mode: "MONCASH_MODE",
  clientId: "MONCASH_CLIENT_ID",
  clientSecret: "MONCASH_CLIENT_SECRET",
  callbackUrl: "MONCASH_CALLBACK_URL",
} as const;

const BAZIK_ENV = {
  payoutEnabled: "MONCASH_PAYOUT_ENABLED",
  userId: "BAZIK_USER_ID",
  secretKey: "BAZIK_SECRET_KEY",
  webhookSecret: "BAZIK_WEBHOOK_SECRET",
  webhookUrl: "BAZIK_WEBHOOK_URL",
} as const;

/**
 * DigitalOcean App Platform/managed environment contract:
 * MONCASH_ENABLED, MONCASH_MODE, MONCASH_CLIENT_ID, MONCASH_CLIENT_SECRET,
 * MONCASH_CALLBACK_URL
 *
 * NatCash is deliberately a configuration-only contract until an official
 * adapter is supplied. These names must not be interpreted as an API.
 * NATCASH_API_BASE_URL, NATCASH_MERCHANT_ID, NATCASH_PARTNER_ID,
 * NATCASH_USERNAME, NATCASH_PASSWORD, NATCASH_PRIVATE_KEY,
 * NATCASH_FUNCTION_CODE, NATCASH_CALLBACK_URL
 */
const NATCASH_ENV = {
  enabled: "NATCASH_ENABLED",
  apiBaseUrl: "NATCASH_API_BASE_URL",
  merchantId: "NATCASH_MERCHANT_ID",
  partnerId: "NATCASH_PARTNER_ID",
  username: "NATCASH_USERNAME",
  password: "NATCASH_PASSWORD",
  privateKey: "NATCASH_PRIVATE_KEY",
  functionCode: "NATCASH_FUNCTION_CODE",
  callbackUrl: "NATCASH_CALLBACK_URL",
} as const;

async function readStoredProvider(provider: HaitiMoneyProvider): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, `payment_provider_${provider}`));
  if (!row) return {};
  try {
    const value = JSON.parse(row.value);
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function envString(name: string, fallback: string): string {
  return process.env[name] === undefined ? fallback : (process.env[name] ?? "").trim();
}

function envBoolean(name: string, fallback: boolean): boolean {
  if (process.env[name] === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
}

export async function getMonCashRuntimeConfig(): Promise<MonCashRuntimeConfig> {
  const stored = await readStoredProvider("moncash");
  const bazikUserId = envString(BAZIK_ENV.userId, "");
  const bazikSecretKey = envString(BAZIK_ENV.secretKey, "");
  const bazikWebhookSecret = envString(BAZIK_ENV.webhookSecret, "");
  const bazikWebhookUrl = envString(BAZIK_ENV.webhookUrl, "");
  const bazikConfigured = !!bazikUserId && !!bazikSecretKey && !!bazikWebhookSecret;
  const storedPayoutEnabled = typeof stored.payoutEnabled === "boolean"
    ? stored.payoutEnabled
    : bazikConfigured;
  return {
    enabled: envBoolean(MONCASH_ENV.enabled, stored.enabled === true || bazikConfigured),
    payoutEnabled: envBoolean(BAZIK_ENV.payoutEnabled, storedPayoutEnabled),
    mode: envString(MONCASH_ENV.mode, String(stored.mode ?? "sandbox")) === "live" ? "live" : "sandbox",
    clientId: envString(MONCASH_ENV.clientId, String(stored.clientId ?? "")),
    clientSecret: envString(MONCASH_ENV.clientSecret, String(stored.clientSecret ?? "")),
    callbackUrl: envString(MONCASH_ENV.callbackUrl, String(stored.callbackUrl ?? "")),
    adapter: bazikConfigured ? "bazik" : "digicel",
    bazikUserId,
    bazikSecretKey,
    bazikWebhookSecret,
    bazikWebhookUrl,
  };
}
export async function getNatCashRuntimeConfig(): Promise<NatCashRuntimeConfig> {
  const stored = await readStoredProvider("natcash");
  return {
    enabled: envBoolean(NATCASH_ENV.enabled, stored.enabled === true),
    apiBaseUrl: envString(NATCASH_ENV.apiBaseUrl, String(stored.apiBaseUrl ?? "")),
    merchantId: envString(NATCASH_ENV.merchantId, String(stored.merchantId ?? stored.merchantNumber ?? "")),
    partnerId: envString(NATCASH_ENV.partnerId, String(stored.partnerId ?? "")),
    username: envString(NATCASH_ENV.username, String(stored.username ?? "")),
    password: envString(NATCASH_ENV.password, String(stored.password ?? stored.merchantPassword ?? "")),
    privateKey: envString(NATCASH_ENV.privateKey, String(stored.privateKey ?? "")),
    functionCode: envString(NATCASH_ENV.functionCode, String(stored.functionCode ?? "")),
    callbackUrl: envString(NATCASH_ENV.callbackUrl, String(stored.callbackUrl ?? "")),
  };
}
// NatCash remains configuration-only until the official adapter contract is implemented.
