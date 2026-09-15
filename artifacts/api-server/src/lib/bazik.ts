import { createHmac, timingSafeEqual } from "node:crypto";

const BAZIK_API_BASE_URL = "https://api.bazik.io";

export class BazikApiError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BazikApiError";
  }
}

export interface BazikConfig {
  userId: string;
  secretKey: string;
  webhookSecret: string;
}

export interface BazikPayment {
  orderId: string;
  referenceId: string;
  transactionId: string;
  status: string;
  amountHtg: number;
  currency: string;
  redirectUrl?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(...values: unknown[]): string {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : "";
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

async function readJsonResponse(res: Response, operation: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = asRecord(text ? JSON.parse(text) : {});
  } catch {
    if (!res.ok) {
      throw new BazikApiError(`Bazik ${operation} failed with HTTP ${res.status}`, operation, res.status);
    }
    throw new Error(`Bazik ${operation} returned an invalid response`);
  }
  if (!res.ok) {
    const message = firstString(data.error, data.message) || `HTTP ${res.status}`;
    throw new BazikApiError(`Bazik ${operation} failed: ${message}`, operation, res.status);
  }
  return data;
}

export function bazikCreationDefinitelyRejected(error: unknown): boolean {
  return error instanceof BazikApiError
    && error.operation === "payment creation"
    && [400, 401, 403, 404, 422].includes(error.status);
}

export async function getBazikAccessToken(config: BazikConfig): Promise<string> {
  const res = await fetch(`${BAZIK_API_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userID: config.userId, secretKey: config.secretKey }),
  });
  const data = await readJsonResponse(res, "authentication");
  const token = firstString(data.access_token, data.token);
  if (!token) throw new Error("Bazik authentication response did not include a token");
  return token;
}

export async function createBazikMonCashPayment(input: {
  config: BazikConfig;
  accessToken: string;
  amountHtg: number;
  referenceId: string;
  description: string;
  successUrl: string;
  errorUrl: string;
  webhookUrl: string;
}): Promise<BazikPayment> {
  const res = await fetch(`${BAZIK_API_BASE_URL}/moncash/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      gdes: input.amountHtg,
      description: input.description,
      referenceId: input.referenceId,
      successUrl: input.successUrl,
      errorUrl: input.errorUrl,
      webhookUrl: input.webhookUrl,
      metadata: { source: "flexa_market" },
    }),
  });
  const data = await readJsonResponse(res, "payment creation");
  const payment = normalizeBazikPayment(data);
  if (!payment.orderId || !payment.redirectUrl) {
    throw new Error("Bazik payment response did not include orderId and redirectUrl");
  }
  return payment;
}

export async function retrieveBazikPayment(
  config: BazikConfig,
  accessToken: string,
  orderId: string,
): Promise<BazikPayment> {
  const res = await fetch(`${BAZIK_API_BASE_URL}/order/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await readJsonResponse(res, "payment verification");
  const payment = normalizeBazikPayment(data);
  if (!payment.orderId) payment.orderId = orderId;
  return payment;
}

export function normalizeBazikPayment(payload: unknown): BazikPayment {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const payment = asRecord(root.payment);
  const nestedPayment = asRecord(data.payment);
  return {
    orderId: firstString(root.orderId, data.orderId, payment.orderId, nestedPayment.orderId),
    referenceId: firstString(root.referenceId, data.referenceId, payment.referenceId, nestedPayment.referenceId),
    transactionId: firstString(root.transactionId, data.transactionId, payment.transactionId, nestedPayment.transactionId),
    status: firstString(root.status, data.status, payment.status, nestedPayment.status).toLowerCase(),
    amountHtg: firstNumber(
      root.gourdes, root.amount, data.gourdes, data.amount,
      payment.gourdes, payment.amount, nestedPayment.gourdes, nestedPayment.amount,
    ),
    currency: firstString(root.currency, data.currency, payment.currency, nestedPayment.currency).toUpperCase(),
    redirectUrl: firstString(root.redirectUrl, data.redirectUrl, payment.redirectUrl, nestedPayment.redirectUrl) || undefined,
  };
}

export function bazikPaymentSucceeded(status: string): boolean {
  return status === "succeeded" || status === "successful";
}

export function verifyBazikWebhookSignature(input: {
  config: BazikConfig;
  rawBody: Buffer;
  timestamp: string;
  eventId: string;
  signature: string;
  now?: number;
}): boolean {
  if (!input.timestamp || !input.eventId || !input.signature || !input.rawBody.length) return false;
  const timestampMs = Number(input.timestamp) * (input.timestamp.length <= 10 ? 1000 : 1);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", input.config.webhookSecret)
    .update(`${input.timestamp}.${input.eventId}.${input.rawBody.toString("utf8")}`)
    .digest("hex");
  const actualBuffer = Buffer.from(input.signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}