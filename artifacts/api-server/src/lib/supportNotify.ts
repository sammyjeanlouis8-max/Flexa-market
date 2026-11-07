/**
 * Support ticket confirmations + agent-reply fan-out:
 *  - Email (deduped)
 *  - Official Message System conversation (system_notifications)
 *  - In-app bell notification
 *  - Push (caller may also send)
 *
 * Deep links always open the exact ticket inside FlexaBot Support (/support/:id).
 */
import {
  db,
  usersTable,
  notificationsTable,
  conversationsTable,
  messagesTable,
  supportThreadsTable,
  supportNotificationLogTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { sendEmail } from "./email";
import { supportTicketReceivedEmail, supportAgentReplyEmail } from "./emailTemplates";
import { emitNewMessage, emitConvUpdate } from "./socketServer";
import { logger } from "./logger";
import { displayTicketRef } from "./supportTicketRef";

const SYSTEM_EMAIL = "system-notifications@flexamarket.internal";
const SYSTEM_NAME = "Message System";
export const MESSAGE_SYSTEM_TYPE = "system_notifications";
const APP_ORIGIN = process.env["PUBLIC_APP_URL"] || process.env["APP_URL"] || "https://flexamarket.com";

async function ensureMessageSystemUserId(): Promise<number> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SYSTEM_EMAIL))
    .limit(1);
  if (existing) {
    // Keep display name aligned with product language ("Message System")
    await db
      .update(usersTable)
      .set({ name: SYSTEM_NAME, avatar: "/flexa-logo-v2.png" } as any)
      .where(eq(usersTable.id, existing.id))
      .catch(() => {});
    return existing.id;
  }

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

async function ensureMessageSystemConversation(buyerId: number, systemUserId: number): Promise<number> {
  const [existing] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.buyerId, buyerId),
        eq(conversationsTable.sellerId, systemUserId),
        eq(conversationsTable.conversationType, MESSAGE_SYSTEM_TYPE),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [conv] = await db
    .insert(conversationsTable)
    .values({
      listingId: null,
      buyerId,
      sellerId: systemUserId,
      conversationType: MESSAGE_SYSTEM_TYPE,
    } as any)
    .returning({ id: conversationsTable.id });
  return conv.id;
}

async function claimNotificationSlot(threadId: number, channel: string, eventKey: string): Promise<boolean> {
  try {
    await db.insert(supportNotificationLogTable).values({ threadId, channel, eventKey });
    return true;
  } catch {
    return false; // unique violation → already sent
  }
}

function ticketDeepLink(threadId: number): string {
  return `${APP_ORIGIN.replace(/\/$/, "")}/support/${threadId}`;
}

function ticketPath(threadId: number): string {
  return `/support/${threadId}`;
}

export type TicketNotifyContext = {
  threadId: number;
  ticketRef: string;
  subject: string;
  description: string;
  status: string;
  estimatedLabel: string;
  agentsOnline: number;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  notifyEmail?: boolean | null;
  createdAt: Date;
};

export async function notifySupportTicketCreated(ctx: TicketNotifyContext): Promise<void> {
  const ref = displayTicketRef(ctx.ticketRef, ctx.threadId, ctx.createdAt);
  const path = ticketPath(ctx.threadId);
  const url = ticketDeepLink(ctx.threadId);
  const statusLabel = ctx.status === "open" ? "Pending Review" : ctx.status;

  const body =
    `Your support request has been received.\n\n` +
    `Ticket: #${ref}\n` +
    `Status: ${statusLabel}\n` +
    `Estimated Response: ${ctx.estimatedLabel}\n\n` +
    `Our support team will review your request.\n\n` +
    `[VIEW SUPPORT TICKET](${path})`;

  // 1) Message System (deduped)
  if (await claimNotificationSlot(ctx.threadId, "message_system", "ticket_created")) {
    try {
      const systemUserId = await ensureMessageSystemUserId();
      const conversationId = await ensureMessageSystemConversation(ctx.customerId, systemUserId);
      const [msg] = await db
        .insert(messagesTable)
        .values({
          conversationId,
          senderId: systemUserId,
          content: body,
          messageType: "text",
        })
        .returning();
      await db
        .update(conversationsTable)
        .set({
          lastMessage: `Ticket #${ref} received`,
          lastMessageAt: new Date(),
        })
        .where(eq(conversationsTable.id, conversationId));
      emitNewMessage(conversationId, {
        id: msg.id,
        conversationId,
        senderId: systemUserId,
        content: body,
        messageType: "text",
        isRead: false,
        createdAt: msg.createdAt.toISOString(),
      });
      emitConvUpdate(conversationId, {
        lastMessage: `Ticket #${ref} received`,
        lastMessageAt: new Date().toISOString(),
      });
      await db
        .update(supportThreadsTable)
        .set({ confirmationMessageSentAt: new Date() } as any)
        .where(eq(supportThreadsTable.id, ctx.threadId));
    } catch (err) {
      logger.warn({ err, threadId: ctx.threadId }, "Message System ticket confirmation failed");
    }
  }

  // 2) Bell notification
  if (await claimNotificationSlot(ctx.threadId, "bell", "ticket_created")) {
    await db
      .insert(notificationsTable)
      .values({
        userId: ctx.customerId,
        type: "support_ticket",
        message: `Support ticket #${ref} received — ${ctx.estimatedLabel}`,
        isRead: false,
      } as any)
      .catch(() => {});
  }

  // 3) Email (deduped + retries inside sendEmail)
  if (
    ctx.customerEmail &&
    ctx.notifyEmail !== false &&
    !ctx.customerEmail.endsWith(".internal") &&
    (await claimNotificationSlot(ctx.threadId, "email", "ticket_created"))
  ) {
    try {
      const tpl = supportTicketReceivedEmail({
        customerName: ctx.customerName || "Customer",
        ticketRef: ref,
        subject: ctx.subject,
        description: ctx.description,
        status: statusLabel,
        estimatedResponse: ctx.estimatedLabel,
        agentsOnline: ctx.agentsOnline,
        submittedAt: ctx.createdAt.toISOString(),
        ticketUrl: url,
      });
      const ok = await sendEmail({
        to: ctx.customerEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      if (ok) {
        await db
          .update(supportThreadsTable)
          .set({ confirmationEmailSentAt: new Date() } as any)
          .where(eq(supportThreadsTable.id, ctx.threadId));
      }
    } catch (err) {
      logger.warn({ err, threadId: ctx.threadId }, "Support confirmation email failed");
    }
  }
}

export type AgentReplyNotifyContext = {
  threadId: number;
  ticketRef: string;
  subject: string;
  agentName: string;
  preview: string;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  notifyEmail?: boolean | null;
  messageId: number;
};

export async function notifySupportAgentReply(ctx: AgentReplyNotifyContext): Promise<void> {
  const ref = displayTicketRef(ctx.ticketRef, ctx.threadId);
  const path = ticketPath(ctx.threadId);
  const url = ticketDeepLink(ctx.threadId);
  const eventKey = `agent_reply_${ctx.messageId}`;

  const body =
    `Flexa Market Support\n\n` +
    `Agent ${ctx.agentName} replied to your support request.\n\n` +
    `Ticket: #${ref}\n\n` +
    `[View Reply](${path})`;

  if (await claimNotificationSlot(ctx.threadId, "message_system", eventKey)) {
    try {
      const systemUserId = await ensureMessageSystemUserId();
      const conversationId = await ensureMessageSystemConversation(ctx.customerId, systemUserId);
      const [msg] = await db
        .insert(messagesTable)
        .values({
          conversationId,
          senderId: systemUserId,
          content: body,
          messageType: "text",
        })
        .returning();
      await db
        .update(conversationsTable)
        .set({
          lastMessage: `Agent ${ctx.agentName} replied — #${ref}`,
          lastMessageAt: new Date(),
        })
        .where(eq(conversationsTable.id, conversationId));
      emitNewMessage(conversationId, {
        id: msg.id,
        conversationId,
        senderId: systemUserId,
        content: body,
        messageType: "text",
        isRead: false,
        createdAt: msg.createdAt.toISOString(),
      });
      emitConvUpdate(conversationId, {
        lastMessage: `Agent ${ctx.agentName} replied — #${ref}`,
        lastMessageAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err, threadId: ctx.threadId }, "Message System agent-reply notify failed");
    }
  }

  if (await claimNotificationSlot(ctx.threadId, "bell", eventKey)) {
    await db
      .insert(notificationsTable)
      .values({
        userId: ctx.customerId,
        type: "support_reply",
        message: `Agent ${ctx.agentName} replied to ticket #${ref}`,
        isRead: false,
      } as any)
      .catch(() => {});
  }

  if (
    ctx.customerEmail &&
    ctx.notifyEmail !== false &&
    !ctx.customerEmail.endsWith(".internal") &&
    (await claimNotificationSlot(ctx.threadId, "email", eventKey))
  ) {
    try {
      const tpl = supportAgentReplyEmail({
        customerName: ctx.customerName || "Customer",
        ticketRef: ref,
        agentName: ctx.agentName,
        preview: ctx.preview.slice(0, 280),
        ticketUrl: url,
      });
      await sendEmail({
        to: ctx.customerEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      logger.warn({ err, threadId: ctx.threadId }, "Support agent-reply email failed");
    }
  }
}
