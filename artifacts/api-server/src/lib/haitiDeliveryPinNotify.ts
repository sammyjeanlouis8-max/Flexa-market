/**
 * Fan-out the SAME Haiti domestic delivery PIN to:
 * 1) In-app notifications (bell)
 * 2) Official "System Notifications" Messages conversation
 * 3) Customer email (when registered)
 *
 * Never generates a new PIN — callers pass the existing deliveries.verification_code.
 * Never used for international carrier / POD flows.
 */
import { db, usersTable, notificationsTable, conversationsTable, messagesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { sendEmail } from "./email";
import { deliveryPinEmail } from "./emailTemplates";
import { isDomesticHaitiPinDelivery, type DeliveryConfirmationInput } from "./deliveryConfirmationPolicy";
import { logger } from "./logger";

const SYSTEM_EMAIL = "system-notifications@flexamarket.internal";
const SYSTEM_NAME = "Message System";
export const SYSTEM_NOTIFICATIONS_TYPE = "system_notifications";

async function ensureSystemNotificationsUserId(): Promise<number> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SYSTEM_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  // Unusable password hash — this account is message-only.
  const [created] = await db
    .insert(usersTable)
    .values({
      name: SYSTEM_NAME,
      email: SYSTEM_EMAIL,
      passwordHash: "system-notifications-no-login",
      isVerified: true,
      isTrusted: true,
      role: "system",
      avatar: "/flexa-logo-v2.png",
      country: "Haiti",
      notifyEmail: false,
      notifySms: false,
      notifyPush: false,
    } as any)
    .returning({ id: usersTable.id });
  return created.id;
}

async function ensureSystemConversation(buyerId: number, systemUserId: number): Promise<number> {
  const [existing] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.buyerId, buyerId),
      eq(conversationsTable.sellerId, systemUserId),
      eq(conversationsTable.conversationType, SYSTEM_NOTIFICATIONS_TYPE),
    ))
    .limit(1);
  if (existing) return existing.id;

  const [conv] = await db
    .insert(conversationsTable)
    .values({
      listingId: null,
      buyerId,
      sellerId: systemUserId,
      conversationType: SYSTEM_NOTIFICATIONS_TYPE,
    } as any)
    .returning({ id: conversationsTable.id });
  return conv.id;
}

export type HaitiPinNotifyInput = {
  buyerId: number;
  code: string;
  deliveryId: number;
  orderRef?: string | null;
  deliveryCity?: string | null;
  listingTitle?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  /** Destination + method fields for policy gate */
  policy: DeliveryConfirmationInput;
};

/**
 * Deliver the existing PIN across Haiti customer channels.
 * Idempotent enough for retries: posts a new message/email each time the PIN
 * is (re)issued (accept / reschedule), always using the provided code string.
 */
export async function notifyBuyerHaitiDeliveryPin(input: HaitiPinNotifyInput): Promise<void> {
  if (!input.buyerId || !input.code) return;
  if (!isDomesticHaitiPinDelivery(input.policy)) {
    logger.info({ deliveryId: input.deliveryId }, "Skipping PIN fan-out — not Haiti domestic PIN mode");
    return;
  }

  const code = String(input.code).trim();
  const orderLabel = input.orderRef || (input.trackingNumber ? `#${input.trackingNumber}` : `#FL-${input.deliveryId}`);
  const preview = `Kòd PIN livrezon ou: ${code}`;
  const fullMessage =
    `Kòd PIN livrezon ou: ${code}\n\n` +
    `Bay kòd sa a bay chofè Flexa Market la SÈLMAN lè li rive avèk pakè a.\n` +
    `Pa pataje kòd la ak pèsonn lòt.\n` +
    `Kòmand: ${orderLabel}` +
    (input.deliveryCity ? `\nAdrès: ${input.deliveryCity}` : "");

  // 1) Typed bell notification with the same PIN (DeliveryCodeAlert / inbox)
  await db.insert(notificationsTable).values({
    userId: input.buyerId,
    type: "delivery_pin",
    isRead: false,
    message: fullMessage,
  } as any).catch((err) => {
    logger.warn({ err, deliveryId: input.deliveryId }, "Failed to insert delivery_pin notification");
  });

  // 2) System Notifications conversation (Messages inbox)
  try {
    const systemUserId = await ensureSystemNotificationsUserId();
    const conversationId = await ensureSystemConversation(input.buyerId, systemUserId);
    await db.insert(messagesTable).values({
      conversationId,
      senderId: systemUserId,
      content: fullMessage,
      messageType: "text",
    });
    await db.update(conversationsTable).set({
      lastMessage: preview.slice(0, 120),
      lastMessageAt: new Date(),
    }).where(eq(conversationsTable.id, conversationId));
  } catch (err) {
    logger.warn({ err, deliveryId: input.deliveryId }, "Failed to post System Notifications PIN message");
  }

  // 3) Registered customer email (same PIN)
  try {
    const [buyer] = await db
      .select({ email: usersTable.email, name: usersTable.name, notifyEmail: usersTable.notifyEmail })
      .from(usersTable)
      .where(eq(usersTable.id, input.buyerId))
      .limit(1);
    if (buyer?.email && buyer.notifyEmail !== false && !buyer.email.endsWith(".internal")) {
      const tpl = deliveryPinEmail({
        buyerName: buyer.name || "Customer",
        code,
        orderRef: orderLabel,
        deliveryCity: input.deliveryCity || "—",
        listingTitle: input.listingTitle || undefined,
        trackingUrl: input.trackingUrl || `https://flexamarket.com/delivery/tracking/${input.deliveryId}`,
      });
      await sendEmail({ to: buyer.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    }
  } catch (err) {
    logger.warn({ err, deliveryId: input.deliveryId }, "Failed to email delivery PIN");
  }
}

/** Latest System Notifications conversation id for a buyer (optional helper). */
export async function getSystemNotificationsConversationId(buyerId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.buyerId, buyerId),
      eq(conversationsTable.conversationType, SYSTEM_NOTIFICATIONS_TYPE),
    ))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(1);
  return row?.id ?? null;
}
