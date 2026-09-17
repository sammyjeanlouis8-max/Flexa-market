/**
 * MonCash Payment Gateway — Digicel Haiti
 *
 * API Reference:
 *   https://sandbox.moncashbutton.digicelgroup.com
 *   https://moncashbutton.digicelgroup.com
 *
 * Flow:
 *   1. Obtain an OAuth2 access token (client_credentials grant).
 *   2. Call CreatePayment → receive a short-lived payment_token.
 *   3. Redirect customer to the MonCash hosted page with that token.
 *   4. MonCash redirects back to our returnUrl with ?transactionId=xxx.
 *   5. Call RetrieveTransactionPayment to verify the amount and status.
 */

export type MonCashMode = "sandbox" | "live";

export interface MonCashConfig {
  mode: MonCashMode;
  clientId: string;
  clientSecret: string;
  /** The URL MonCash should redirect the customer back to after payment. */
  returnUrl: string;
}

const BASE_URLS: Record<MonCashMode, string> = {
  sandbox: "https://sandbox.moncashbutton.digicelgroup.com",
  live:    "https://moncashbutton.digicelgroup.com",
};

function base(cfg: MonCashConfig): string {
  return BASE_URLS[cfg.mode];
}

function basicAuth(cfg: MonCashConfig): string {
  return Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getAccessToken(cfg: MonCashConfig): Promise<string> {
  const res = await fetch(`${base(cfg)}/Api/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(cfg)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials&scope=read,write",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`MonCash token error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("MonCash: no access_token in response");
  return data.access_token;
}

// ── Create payment ─────────────────────────────────────────────────────────────

export interface CreatePaymentResult {
  /** Short-lived token; use to build the redirect URL. */
  paymentToken: string;
  /** Full URL to redirect the customer to. */
  redirectUrl: string;
}

export async function createPayment(
  cfg: MonCashConfig,
  token: string,
  orderId: string,
  /** Amount in HTG (Haitian Gourde) for local, or USD for Haitian diaspora. */
  amount: number,
): Promise<CreatePaymentResult> {
  const res = await fetch(`${base(cfg)}/Api/v1/CreatePayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ amount, orderId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`MonCash CreatePayment error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    payment_token?: { token?: string };
    status?: number;
    message?: string;
  };

  const paymentToken = data.payment_token?.token;
  if (!paymentToken) {
    throw new Error(`MonCash CreatePayment: no payment_token — ${data.message ?? JSON.stringify(data)}`);
  }

  const redirectUrl =
    `${base(cfg)}/Moncash-business/resources/index.php?token=${paymentToken}`;

  return { paymentToken, redirectUrl };
}

// ── Retrieve transaction (verify payment) ─────────────────────────────────────

export interface TransactionResult {
  reference: string;     // Our orderId we passed in
  transactionId: string; // MonCash's own transaction ID
  cost: number;          // Amount paid
  message: string;       // "successful" or similar
  payer: string;         // Customer's MonCash phone number
}

export function parseMonCashTransactionResult(data: unknown): TransactionResult {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : null;
  const p = root?.["payment"] && typeof root["payment"] === "object"
    ? root["payment"] as Record<string, unknown>
    : null;
  const rawTransactionId = p?.["transactionId"] ?? p?.["transaction_id"];
  const transactionId = rawTransactionId === undefined || rawTransactionId === null
    ? ""
    : String(rawTransactionId).trim();
  const reference = typeof p?.["reference"] === "string" ? p["reference"].trim() : "";
  const cost = Number(p?.["cost"]);
  const message = typeof p?.["message"] === "string" ? p["message"].trim() : "";
  const payer = typeof p?.["payer"] === "string" || typeof p?.["payer"] === "number"
    ? String(p["payer"]).trim()
    : "";

  if (!p || !transactionId || !reference || !Number.isFinite(cost) || cost <= 0 || !message) {
    throw new Error(`MonCash RetrieveTransaction: unexpected response — ${JSON.stringify(data)}`);
  }

  return {
    reference,
    transactionId,
    cost,
    message,
    payer,
  };
}

export async function retrieveTransactionByTransactionId(
  cfg: MonCashConfig,
  token: string,
  transactionId: string,
): Promise<TransactionResult> {
  const res = await fetch(`${base(cfg)}/Api/v1/RetrieveTransactionPayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ transactionId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`MonCash RetrieveTransaction error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    payment?: {
      reference?: string;
      transactionId?: string;
      transaction_id?: string;
      cost?: number;
      message?: string;
      payer?: string;
    };
    status?: number;
    message?: string;
  };

  return parseMonCashTransactionResult(data);
}

export async function retrieveTransactionByOrderId(
  cfg: MonCashConfig,
  token: string,
  orderId: string,
): Promise<TransactionResult> {
  const res = await fetch(`${base(cfg)}/Api/v1/RetrieveOrderPayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ orderId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`MonCash RetrieveOrder error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    payment?: {
      reference?: string;
      transactionId?: string;
      transaction_id?: string;
      cost?: number;
      message?: string;
      payer?: string;
    };
    status?: number;
    message?: string;
  };

  return parseMonCashTransactionResult(data);
}

export function monCashPaymentSucceeded(message: string): boolean {
  return message.trim().toLowerCase() === "successful";
}

export function monCashPaymentTerminalFailure(message: string): boolean {
  return ["failed", "cancelled", "canceled", "expired", "rejected"].includes(message.trim().toLowerCase());
}
