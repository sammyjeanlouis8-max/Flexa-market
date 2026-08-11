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
  sent:   number;
  failed: number;
  errors: string[];          // first unique error messages for display
  firstError?: string;       // human-readable hint for the UI
}

/** Translate a Twilio error code/message into a user-friendly hint */
function friendlyTwilioError(e: any): string {
  const code: number | undefined = e?.code;
  const msg: string = e?.message ?? String(e);

  // Trial account: unverified destination
  if (code === 21608 || msg.includes("unverified")) {
    return "Kont Twilio ou a se TRIAL — li sèlman ka voye SMS bay nimewo ou verifye nan console.twilio.com. Depoze $20 pou retire restriksyon an.";
  }
  // Toll-free not yet approved
  if (code === 21614 || msg.toLowerCase().includes("toll-free")) {
    return "Nimewo toll-free ou a (+1844…) pa ankò apwouve pa Twilio. Tann 1–3 jou oswa itilize yon nimewo lokal.";
  }
  // Invalid from number
  if (code === 21606 || msg.includes("from")) {
    return "TWILIO_FROM_NUMBER pa valid. Verifye nimewo a nan Twilio console.";
  }
  // Auth
  if (code === 20003 || msg.includes("authenticate")) {
    return "TWILIO_ACCOUNT_SID oswa TWILIO_AUTH_TOKEN pa kòrèk.";
  }
  // Geo permission
  if (code === 21408) {
    return "Twilio pa otorize voye nan peyi sa a. Aktive pèmisyon jewografik nan console Twilio.";
  }
  return msg;
}

/**
 * Send a single SMS. Returns { ok, error }.
 */
export async function sendSms(
  to: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getClient();
    await client.messages.create({ from: getFrom(), to, body });
    return { ok: true };
  } catch (e: any) {
    const hint = friendlyTwilioError(e);
    console.error("[SMS] Failed to send to", to, ":", hint);
    return { ok: false, error: hint };
  }
}

/**
 * Send an SMS to many recipients in parallel batches of 10.
 * Returns { sent, failed, errors, firstError }.
 */
export async function sendSmsBatch(
  recipients: SmsRecipient[],
  body: string,
): Promise<SmsSendResult> {
  const BATCH = 10;
  let sent = 0;
  let failed = 0;
  const errorSet = new Set<string>();

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(r => sendSms(r.phone, body)),
    );
    for (const res of results) {
      if (res.status === "fulfilled" && res.value.ok) {
        sent++;
      } else {
        failed++;
        const errMsg =
          res.status === "rejected"
            ? friendlyTwilioError(res.reason)
            : res.value.error;
        if (errMsg) errorSet.add(errMsg);
      }
    }
  }

  const errors = Array.from(errorSet).slice(0, 3);
  return { sent, failed, errors, firstError: errors[0] };
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
