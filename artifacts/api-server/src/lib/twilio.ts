/**
 * Twilio stub — SMS delivery replaced by email (Resend).
 *
 * All functions return false / empty results so existing callers in
 * delivery.ts compile and run without Twilio credentials.
 * Delivery status notifications are handled by push + in-app notifications.
 */

import { logger } from "./logger";

export async function sendSms(_to: string, _body: string): Promise<boolean> {
  logger.debug("[twilio-stub] sendSms called but Twilio is disabled — use email instead");
  return false;
}

export async function sendWhatsApp(_to: string, _body: string): Promise<boolean> {
  return false;
}

export async function sendOtpDual(
  _to: string,
  _otpCode: string
): Promise<{ smsSent: boolean; whatsappSent: boolean; anyDelivered: boolean }> {
  return { smsSent: false, whatsappSent: false, anyDelivered: false };
}

export async function getTwilioClient(): Promise<never> {
  throw new Error("Twilio is disabled — use email (Resend) instead");
}

export async function getTwilioFromNumber(): Promise<string> {
  return "";
}
