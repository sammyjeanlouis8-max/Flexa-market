import { createHmac, timingSafeEqual } from "node:crypto";

const BAZIK_API_BASE_URL = "https://api.bazik.io";
const BAZIK_USER_AGENT = "FlexaMarket/1.0 (+https://flexamarket.com)";

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
  diagnostics?: {
    objectPaths: string[];
    leafPaths: string[];
    statusCandidates: Array<{ path: string; value: string }>;
    booleanCandidates: Array<{ path: string; value: boolean }>;
  };
}

export type BazikTransferStatus = "successful" | "processing" | "failed" | "cancelled" | "unknown";

export interface BazikTransfer {
  transactionId: string;
  status: BazikTransferStatus;
  provider: string;
  amountHtg: number;
  feesHtg: number;
  totalHtg: number;
  currency: string;
  wallet: string;
  referenceId: string;
  failureReason?: string;
}

export interface BazikTransferQuote {
  deliveryAmountHtg: number;
  feeHtg: number;
  totalCostHtg: number;
  currency: string;
  provider: string;
}

export interface BazikWalletBalance {
  availableHtg: number;
  reservedHtg: number;
  currency: string;
}

export interface BazikCustomerStatus {
  active: boolean;
  type: string;
  statuses: string[];
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

function summarizeBazikPayload(payload: unknown): NonNullable<BazikPayment["diagnostics"]> {
  const objectPaths: string[] = [];
  const leafPaths: string[] = [];
  const statusCandidates: Array<{ path: string; value: string }> = [];
  const booleanCandidates: Array<{ path: string; value: boolean }> = [];
  const statusKey = /(^|_)(status|state|result|message)$/i;
  const booleanKey = /(^|_)(paid|success|successful|completed|approved|confirmed)$/i;

  const visit = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) return;
    const record = value as Record<string, unknown>;
    if (path) objectPaths.push(path);
    for (const [key, child] of Object.entries(record)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === "string" && statusKey.test(key)) {
        statusCandidates.push({ path: childPath, value: child.trim().slice(0, 80) });
      } else if (typeof child === "boolean" && (statusKey.test(key) || booleanKey.test(key))) {
        booleanCandidates.push({ path: childPath, value: child });
      } else if (child && typeof child === "object" && !Array.isArray(child)) {
        visit(child, childPath, depth + 1);
      } else {
        leafPaths.push(childPath);
      }
    }
  };

  visit(payload, "", 0);
  return {
    objectPaths: objectPaths.slice(0, 30),
    leafPaths: leafPaths.slice(0, 50),
    statusCandidates: statusCandidates.slice(0, 20),
    booleanCandidates: booleanCandidates.slice(0, 20),
  };
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

async function fetchBazikJson(
  path: string,
  accessToken: string,
  operation: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BAZIK_API_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": BAZIK_USER_AGENT,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    return await readJsonResponse(res, operation);
  } catch (error) {
    if (error instanceof BazikApiError) throw error;
    throw new BazikApiError(`Bazik ${operation} request did not complete`, operation, 0);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBazikVerification(
  url: string,
  accessToken: string,
  operation: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": BAZIK_USER_AGENT,
        },
      });
      return await readJsonResponse(res, operation);
    } catch (error) {
      const retryable = !(error instanceof BazikApiError) || error.status >= 500;
      if (attempt === 2 || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`${operation} failed`);
}

export function bazikCreationDefinitelyRejected(error: unknown): boolean {
  return error instanceof BazikApiError
    && error.operation === "payment creation"
    && [400, 401, 403, 404, 422].includes(error.status);
}

export function bazikWithdrawalDefinitelyRejected(error: unknown): boolean {
  return error instanceof BazikApiError
    && error.operation === "withdrawal creation"
    && [400, 401, 402, 403, 404, 422].includes(error.status);
}

export async function getBazikAccessToken(config: BazikConfig): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BAZIK_API_BASE_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": BAZIK_USER_AGENT,
      },
      body: JSON.stringify({ userID: config.userId, secretKey: config.secretKey }),
      signal: controller.signal,
    });
    const data = await readJsonResponse(res, "authentication");
    const token = firstString(data.access_token, data.token);
    if (!token) throw new Error("Bazik authentication response did not include a token");
    return token;
  } catch (error) {
    if (error instanceof BazikApiError) throw error;
    throw new BazikApiError("Bazik authentication request did not complete", "authentication", 0);
  } finally {
    clearTimeout(timeout);
  }
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
      "User-Agent": BAZIK_USER_AGENT,
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
  const data = await fetchBazikVerification(
    `${BAZIK_API_BASE_URL}/order/${encodeURIComponent(orderId)}`,
    accessToken,
    "payment verification",
  );
  return normalizeBazikPayment(data);
}

export async function retrieveBazikMonCashPaymentByReference(
  config: BazikConfig,
  accessToken: string,
  referenceId: string,
): Promise<BazikPayment> {
  const data = await fetchBazikVerification(
    `${BAZIK_API_BASE_URL}/moncash/payments/${encodeURIComponent(referenceId)}`,
    accessToken,
    "MonCash payment verification",
  );
  return normalizeBazikPayment(data);
}

function normalizeBazikTransferStatus(value: unknown): BazikTransferStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (["successful", "succeeded", "completed"].includes(status)) return "successful";
  if (["pending", "processing", "created", "queued"].includes(status)) return "processing";
  if (["failed", "rejected", "expired"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "unknown";
}

export function normalizeBazikTransfer(payload: unknown): BazikTransfer {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const transfer = asRecord(root.transfer);
  const nestedTransfer = asRecord(data.transfer);
  const recipient = asRecord(root.recipient);
  const nestedRecipient = asRecord(data.recipient);
  const transferRecipient = asRecord(transfer.recipient);
  const nestedTransferRecipient = asRecord(nestedTransfer.recipient);
  return {
    transactionId: firstString(
      root.transactionId,
      root.transaction_id,
      data.transactionId,
      data.transaction_id,
      transfer.transactionId,
      transfer.transaction_id,
      nestedTransfer.transactionId,
      nestedTransfer.transaction_id,
    ),
    status: normalizeBazikTransferStatus(
      root.status ?? data.status ?? transfer.status ?? nestedTransfer.status,
    ),
    provider: firstString(
      root.provider,
      data.provider,
      transfer.provider,
      nestedTransfer.provider,
    ).toLowerCase(),
    amountHtg: firstNumber(
      root.amount,
      root.gdes,
      data.amount,
      data.gdes,
      transfer.amount,
      transfer.gdes,
      nestedTransfer.amount,
      nestedTransfer.gdes,
    ),
    feesHtg: firstNumber(
      root.fees,
      root.fee,
      data.fees,
      data.fee,
      transfer.fees,
      transfer.fee,
      nestedTransfer.fees,
      nestedTransfer.fee,
    ),
    totalHtg: firstNumber(
      root.total,
      root.total_cost,
      data.total,
      data.total_cost,
      transfer.total,
      transfer.total_cost,
      nestedTransfer.total,
      nestedTransfer.total_cost,
    ),
    currency: firstString(
      root.currency,
      data.currency,
      transfer.currency,
      nestedTransfer.currency,
    ).toUpperCase(),
    wallet: firstString(
      root.wallet,
      data.wallet,
      transfer.wallet,
      nestedTransfer.wallet,
      recipient.wallet,
      nestedRecipient.wallet,
      transferRecipient.wallet,
      nestedTransferRecipient.wallet,
    ).replace(/\D/g, ""),
    referenceId: firstString(
      root.referenceId,
      root.reference_id,
      data.referenceId,
      data.reference_id,
      transfer.referenceId,
      transfer.reference_id,
      nestedTransfer.referenceId,
      nestedTransfer.reference_id,
    ),
    failureReason: firstString(
      root.failureReason,
      root.failure_reason,
      data.failureReason,
      data.failure_reason,
      transfer.failureReason,
      transfer.failure_reason,
      nestedTransfer.failureReason,
      nestedTransfer.failure_reason,
    ) || undefined,
  };
}

export async function retrieveBazikCustomerStatus(
  accessToken: string,
  wallet: string,
): Promise<BazikCustomerStatus> {
  const data = await fetchBazikJson(
    "/moncash/customers/status",
    accessToken,
    "customer status",
    { method: "POST", body: { wallet } },
  );
  const customer = asRecord(data.customerStatus);
  const statuses = Array.isArray(customer.status)
    ? customer.status.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  const type = firstString(customer.type).toLowerCase();
  return {
    active: statuses.includes("registered") && statuses.includes("active"),
    type,
    statuses,
  };
}

export async function retrieveBazikWalletBalance(
  accessToken: string,
): Promise<BazikWalletBalance> {
  const data = await fetchBazikJson("/balance", accessToken, "wallet balance", { method: "GET" });
  const availableHtg = firstNumber(data.available);
  const reservedHtg = firstNumber(data.reserved);
  const currency = firstString(data.currency).toUpperCase();
  if (
    !Number.isFinite(availableHtg)
    || availableHtg < 0
    || !Number.isFinite(reservedHtg)
    || reservedHtg < 0
    || currency !== "HTG"
  ) {
    throw new BazikApiError("Bazik wallet balance returned an unexpected response", "wallet balance", 0);
  }
  return { availableHtg, reservedHtg, currency };
}

export async function createBazikTransferQuote(
  accessToken: string,
  amountHtg: number,
): Promise<BazikTransferQuote> {
  const data = await fetchBazikJson(
    "/transfers/quote",
    accessToken,
    "transfer quote",
    { method: "POST", body: { amount: amountHtg, provider: "moncash" } },
  );
  const quote = {
    deliveryAmountHtg: firstNumber(data.delivery_amount),
    feeHtg: firstNumber(data.fee),
    totalCostHtg: firstNumber(data.total_cost),
    currency: firstString(data.currency).toUpperCase(),
    provider: firstString(data.provider).toLowerCase(),
  };
  if (
    quote.deliveryAmountHtg !== amountHtg
    || !Number.isFinite(quote.feeHtg)
    || quote.feeHtg < 0
    || !Number.isFinite(quote.totalCostHtg)
    || quote.totalCostHtg < amountHtg
    || quote.currency !== "HTG"
    || quote.provider !== "moncash"
  ) {
    throw new BazikApiError("Bazik transfer quote returned an unexpected response", "transfer quote", 0);
  }
  return quote;
}

export async function createBazikMonCashWithdrawal(input: {
  accessToken: string;
  amountHtg: number;
  wallet: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  description: string;
  referenceId: string;
  webhookUrl: string;
}): Promise<BazikTransfer> {
  const data = await fetchBazikJson(
    "/moncash/withdraw",
    input.accessToken,
    "withdrawal creation",
    {
      method: "POST",
      body: {
        gdes: input.amountHtg,
        wallet: input.wallet,
        customerFirstName: input.customerFirstName,
        customerLastName: input.customerLastName,
        description: input.description,
        referenceId: input.referenceId,
        ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
        webhookUrl: input.webhookUrl,
      },
    },
  );
  return normalizeBazikTransfer(data);
}

export async function retrieveBazikTransfer(
  accessToken: string,
  transactionId: string,
): Promise<BazikTransfer> {
  const data = await fetchBazikJson(
    `/transfers/${encodeURIComponent(transactionId)}`,
    accessToken,
    "transfer status",
    { method: "GET" },
  );
  return normalizeBazikTransfer(data);
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
      root.gdes, root.gourdes, root.amount,
      data.gdes, data.gourdes, data.amount,
      payment.gdes, payment.gourdes, payment.amount,
      nestedPayment.gdes, nestedPayment.gourdes, nestedPayment.amount,
    ),
    currency: firstString(root.currency, data.currency, payment.currency, nestedPayment.currency).toUpperCase(),
    redirectUrl: firstString(root.redirectUrl, data.redirectUrl, payment.redirectUrl, nestedPayment.redirectUrl) || undefined,
    diagnostics: summarizeBazikPayload(payload),
  };
}

export function bazikPaymentSucceeded(status: string): boolean {
  return status === "completed" || status === "succeeded" || status === "successful";
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