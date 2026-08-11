/**
 * sms.ts — Twilio SMS sending library for FlexaMarket
 * Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER from env.
 */
import twilio from "twilio";

function getClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN manke nan env");
  return twilio(sid, token);
}

function getFrom(): string {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error("TWILIO_FROM_NUMBER manke nan env");
  return from;
}

export interface SmsRecipient {
  phone: string;
  name?: string | null;
}

export interface SmsSendResult {
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Send a single SMS. Returns true on success.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    const client = getClient();
    await client.messages.create({ from: getFrom(), to, body });
    return true;
  } catch (e: any) {
    console.error("[SMS] Failed to send to", to, ":", e?.message);
    return false;
  }
}

/**
 * Send an SMS to many recipients in parallel batches of 10.
 * Returns { sent, failed, errors }.
 */
export async function sendSmsBatch(
  recipients: SmsRecipient[],
  body: string,
): Promise<SmsSendResult> {
  const BATCH = 10;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(r => sendSms(r.phone, body)),
    );
    for (const res of results) {
      if (res.status === "fulfilled" && res.value) {
        sent++;
      } else {
        failed++;
        if (res.status === "rejected") errors.push(String(res.reason));
      }
    }
  }

  return { sent, failed, errors };
}

/**
 * Check if Twilio is configured (credentials + from number present).
 */
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}
