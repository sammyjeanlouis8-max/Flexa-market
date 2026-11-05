/**
 * Per-user daily usage limits for Flexa AI capabilities.
 * Durable log when DB is available; always enforces an in-process quota.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import type { FlexaAiCapability } from "./flexaAi";

type UsageKey = string;

const memoryCounts = new Map<UsageKey, { day: string; count: number }>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function memoryKey(userId: number, capability: FlexaAiCapability): UsageKey {
  return `${userId}:${capability}`;
}

function dailyLimitFor(capability: FlexaAiCapability, isAdmin: boolean): number {
  if (isAdmin && capability === "admin") {
    return Number(process.env.FLEXA_AI_DAILY_ADMIN_LIMIT ?? 80) || 80;
  }
  const defaults: Record<FlexaAiCapability, number> = {
    support: Number(process.env.FLEXA_AI_DAILY_SUPPORT_LIMIT ?? 60) || 60,
    descriptions: Number(process.env.FLEXA_AI_DAILY_DESCRIPTIONS_LIMIT ?? 40) || 40,
    translation: Number(process.env.FLEXA_AI_DAILY_TRANSLATION_LIMIT ?? 80) || 80,
    boost: Number(process.env.FLEXA_AI_DAILY_BOOST_LIMIT ?? 30) || 30,
    analytics: Number(process.env.FLEXA_AI_DAILY_ANALYTICS_LIMIT ?? 30) || 30,
    admin: Number(process.env.FLEXA_AI_DAILY_ADMIN_LIMIT ?? 80) || 80,
  };
  return defaults[capability];
}

async function countFromDb(userId: number, capability: FlexaAiCapability, day: string): Promise<number | null> {
  try {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM flexa_ai_usage
      WHERE user_id = ${userId}
        AND capability = ${capability}
        AND day = ${day}::date
    `);
    const row = (rows as unknown as { rows?: Array<{ c: number }> }).rows?.[0]
      ?? (rows as unknown as Array<{ c: number }>)[0];
    return Number(row?.c ?? 0);
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "flexa_ai_usage count skipped");
    return null;
  }
}

async function insertUsage(params: {
  userId: number;
  capability: FlexaAiCapability;
  day: string;
  model: string;
  provider: string;
  inputChars: number;
  outputChars: number;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO flexa_ai_usage
        (user_id, capability, day, model, provider, input_chars, output_chars)
      VALUES
        (${params.userId}, ${params.capability}, ${params.day}::date,
         ${params.model}, ${params.provider}, ${params.inputChars}, ${params.outputChars})
    `);
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "flexa_ai_usage insert skipped");
  }
}

export async function assertWithinDailyQuota(opts: {
  userId: number;
  capability: FlexaAiCapability;
  isAdmin?: boolean;
}): Promise<{ limit: number; used: number; remaining: number }> {
  const day = utcDay();
  const limit = dailyLimitFor(opts.capability, Boolean(opts.isAdmin));
  const key = memoryKey(opts.userId, opts.capability);

  const mem = memoryCounts.get(key);
  if (!mem || mem.day !== day) memoryCounts.set(key, { day, count: 0 });

  const dbCount = await countFromDb(opts.userId, opts.capability, day);
  const used = dbCount ?? memoryCounts.get(key)!.count;

  if (used >= limit) {
    throw Object.assign(
      new Error(`Daily Flexa AI limit reached for ${opts.capability} (${limit}/day). Try again tomorrow.`),
      { code: "AI_QUOTA_EXCEEDED", status: 429, limit, used },
    );
  }

  return { limit, used, remaining: Math.max(0, limit - used) };
}

export async function recordAiUsage(opts: {
  userId: number;
  capability: FlexaAiCapability;
  model: string;
  provider: string;
  inputChars: number;
  outputChars: number;
}): Promise<void> {
  const day = utcDay();
  const key = memoryKey(opts.userId, opts.capability);
  const mem = memoryCounts.get(key);
  if (!mem || mem.day !== day) memoryCounts.set(key, { day, count: 1 });
  else mem.count += 1;

  await insertUsage({ ...opts, day });
}
