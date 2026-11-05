/**
 * Shared Flexa AI client — reuses the existing Anthropic / OpenAI / Groq
 * credentials already used by FlexaBot and related features.
 *
 * Credentials are server-side only. Never import this module from the browser.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

export const FLEXA_AI_HAIKU = "claude-haiku-4-5";
export const FLEXA_AI_OPUS = "claude-opus-4-5";
export const FLEXA_AI_GROQ_MODEL = "llama-3.1-8b-instant";
export const FLEXA_AI_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type FlexaAiCapability =
  | "support"
  | "descriptions"
  | "translation"
  | "boost"
  | "analytics"
  | "admin";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type CompleteOptions = {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** Prefer Haiku. Opus only when FLEXA_AI_ALLOW_OPUS=1 and allowOpus is true. */
  allowOpus?: boolean;
  timeoutMs?: number;
};

let anthropicSingleton: Anthropic | null | undefined;

function readAnthropicCreds(): { apiKey: string; baseURL?: string } | null {
  const apiKey =
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    "";
  if (!apiKey) return null;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL?.trim() || undefined;
  return { apiKey, baseURL };
}

/** Lazy shared Anthropic client (same keys as FlexaBot / translation / guardian). */
export function getAnthropicClient(): Anthropic | null {
  if (anthropicSingleton !== undefined) return anthropicSingleton;
  const creds = readAnthropicCreds();
  if (!creds) {
    anthropicSingleton = null;
    return null;
  }
  anthropicSingleton = new Anthropic({
    ...(creds.baseURL ? { baseURL: creds.baseURL } : {}),
    apiKey: creds.apiKey,
    timeout: 25_000,
  });
  return anthropicSingleton;
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicClient() !== null;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function isOpenAiConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() &&
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim(),
  );
}

/** Master switch — default enabled so existing Anthropic keys keep working. */
export function isFlexaAiMasterEnabled(): boolean {
  const raw = (process.env.FLEXA_AI_ENABLED ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function isOpusAllowed(): boolean {
  const raw = (process.env.FLEXA_AI_ALLOW_OPUS ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

const DEFAULT_CAPABILITIES: FlexaAiCapability[] = [
  "support",
  "descriptions",
  "translation",
  "boost",
  "analytics",
  "admin",
];

export function getEnabledCapabilities(): FlexaAiCapability[] {
  const raw = process.env.FLEXA_AI_CAPABILITIES?.trim();
  if (!raw) return DEFAULT_CAPABILITIES;
  const allowed = new Set(DEFAULT_CAPABILITIES);
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is FlexaAiCapability => allowed.has(s as FlexaAiCapability));
}

export function isCapabilityEnabled(cap: FlexaAiCapability): boolean {
  return isFlexaAiMasterEnabled() && getEnabledCapabilities().includes(cap);
}

export function getProviderStatus() {
  return {
    masterEnabled: isFlexaAiMasterEnabled(),
    anthropic: isAnthropicConfigured(),
    groq: isGroqConfigured(),
    openai: isOpenAiConfigured(),
    opusAllowed: isOpusAllowed(),
    defaultModel: FLEXA_AI_HAIKU,
    capabilities: getEnabledCapabilities(),
    primaryProvider: isAnthropicConfigured()
      ? "anthropic"
      : isGroqConfigured()
        ? "groq"
        : null,
  };
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function completeWithAnthropic(opts: CompleteOptions): Promise<{ text: string; model: string; provider: "anthropic" }> {
  const client = getAnthropicClient();
  if (!client) throw Object.assign(new Error("Anthropic not configured"), { code: "AI_NOT_CONFIGURED" });

  const useOpus = Boolean(opts.allowOpus) && isOpusAllowed();
  const model = useOpus ? FLEXA_AI_OPUS : FLEXA_AI_HAIKU;

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return { text: extractText(response), model, provider: "anthropic" };
}

async function completeWithGroq(opts: CompleteOptions): Promise<{ text: string; model: string; provider: "groq" }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw Object.assign(new Error("Groq not configured"), { code: "AI_NOT_CONFIGURED" });

  const res = await fetch(FLEXA_AI_GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: FLEXA_AI_GROQ_MODEL,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw Object.assign(new Error(err?.error?.message ?? `Groq ${res.status}`), { status: res.status });
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return {
    text: (json.choices?.[0]?.message?.content ?? "").trim(),
    model: FLEXA_AI_GROQ_MODEL,
    provider: "groq",
  };
}

/**
 * Complete a chat using Anthropic Haiku when available, else Groq backup.
 * Does not invent credentials; fails with AI_NOT_CONFIGURED when none exist.
 */
export async function completeChat(opts: CompleteOptions): Promise<{
  text: string;
  model: string;
  provider: "anthropic" | "groq";
}> {
  if (isAnthropicConfigured()) {
    try {
      return await completeWithAnthropic(opts);
    } catch (err) {
      logger.warn({ err: (err as Error)?.message }, "Flexa AI Anthropic call failed");
      if (!isGroqConfigured()) throw err;
    }
  }
  if (isGroqConfigured()) {
    return completeWithGroq(opts);
  }
  throw Object.assign(new Error("No AI provider configured"), { code: "AI_NOT_CONFIGURED" });
}

export async function completeText(system: string, user: string, options?: Omit<CompleteOptions, "system" | "messages">) {
  return completeChat({
    system,
    messages: [{ role: "user", content: user }],
    ...options,
  });
}

/** Safe public status — never includes keys. */
export function publicAiStatus() {
  const status = getProviderStatus();
  return {
    available: Boolean(status.primaryProvider) && status.masterEnabled,
    provider: status.primaryProvider,
    model: status.defaultModel,
    capabilities: status.capabilities,
    opusAllowed: status.opusAllowed,
  };
}
