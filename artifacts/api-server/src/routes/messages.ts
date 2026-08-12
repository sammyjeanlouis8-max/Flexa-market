import { Router } from "express";
import { db, conversationsTable, messagesTable, usersTable, listingsTable, notificationsTable } from "@workspace/db";
import { eq, and, or, desc, ne, sql, inArray, count } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireNotRestricted } from "../middlewares/auth";
import { CreateConversationBody } from "@workspace/api-zod";
import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { emitNewMessage, emitConvUpdate, emitAudioListened, emitMsgDeleted } from "../lib/socketServer";
import { z } from "zod";

const router = Router();

const SendMessageBody = z.object({
  content: z.string().default(""),
  messageType: z.enum(["text", "image", "video", "audio"]).default("text"),
  mediaUrl: z.string().optional(),
  imageUrl: z.string().optional(),
});

router.get("/conversations/unread-count", requireAuth, async (req, res): Promise<void> => {
  const myConvs = db.select({ id: conversationsTable.id }).from(conversationsTable)
    .where(or(eq(conversationsTable.buyerId, req.userId!), eq(conversationsTable.sellerId, req.userId!)));

  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(
      inArray(messagesTable.conversationId, myConvs),
      eq(messagesTable.isRead, false),
      ne(messagesTable.senderId, req.userId!),
    ));

  res.json({ count: row?.count ?? 0 });
});

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const buyerUser = alias(usersTable, "buyer_user");
  const sellerUser = alias(usersTable, "seller_user");

  const unreadSubquery = db.select({
    conversationId: messagesTable.conversationId,
    unreadCount: count().as("unread_count"),
  })
    .from(messagesTable)
    .where(and(eq(messagesTable.isRead, false), ne(messagesTable.senderId, userId)))
    .groupBy(messagesTable.conversationId)
    .as("unread_counts");

  const rows = await db
    .select({
      conv: conversationsTable,
      listing: {
        title: listingsTable.title,
        images: listingsTable.images,
        price: listingsTable.price,
      },
      buyer: {
        id: buyerUser.id,
        name: buyerUser.name,
        avatar: buyerUser.avatar,
        isAdmin: buyerUser.isAdmin,
        isSuperAdmin: buyerUser.isSuperAdmin,
      },
      seller: {
        id: sellerUser.id,
        name: sellerUser.name,
        avatar: sellerUser.avatar,
        isAdmin: sellerUser.isAdmin,
        isSuperAdmin: sellerUser.isSuperAdmin,
      },
      unreadCount: unreadSubquery.unreadCount,
    })
    .from(conversationsTable)
    .leftJoin(listingsTable, eq(conversationsTable.listingId, listingsTable.id))
    .leftJoin(buyerUser, eq(conversationsTable.buyerId, buyerUser.id))
    .leftJoin(sellerUser, eq(conversationsTable.sellerId, sellerUser.id))
    .leftJoin(unreadSubquery, eq(conversationsTable.id, unreadSubquery.conversationId))
    .where(or(eq(conversationsTable.buyerId, userId), eq(conversationsTable.sellerId, userId)))
    .orderBy(desc(conversationsTable.lastMessageAt));

  const result = rows.map((r) => {
    const isBuyer = r.conv.buyerId === userId;
    const otherUserId = isBuyer ? r.conv.sellerId : r.conv.buyerId;
    const otherUser = isBuyer ? r.seller : r.buyer;
    const otherIsAdmin = !!(otherUser?.isAdmin || otherUser?.isSuperAdmin);
    return {
      id: r.conv.id,
      listingId: r.conv.listingId,
      listingTitle: r.conv.conversationType === "agent_recharge"
        ? "💼 Agent Recharge"
        : (r.listing?.title ?? "Deleted listing"),
      listingImage: r.listing?.images?.[0] ?? null,
      listingPrice: r.listing?.price ?? 0,
      otherUserId,
      otherUserName: otherUser?.name ?? "Unknown",
      otherUserAvatar: otherUser?.avatar ?? null,
      lastMessage: r.conv.lastMessage ?? null,
      lastMessageAt: r.conv.lastMessageAt?.toISOString() ?? null,
      unreadCount: Number(r.unreadCount ?? 0),
    };
  });

  res.json(result);
});

router.post("/conversations", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { listingId, sellerId } = parsed.data;

  if (req.userId === sellerId) { res.status(400).json({ error: "Cannot chat with yourself" }); return; }

  const [existing] = await db.select().from(conversationsTable)
    .where(sql`${conversationsTable.listingId} = ${listingId} AND ${conversationsTable.buyerId} = ${Number(req.userId)} AND ${conversationsTable.sellerId} = ${sellerId}`);

  if (existing) {
    const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, existing.listingId!));
    const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, sellerId));
    res.json({
      id: existing.id, listingId: existing.listingId, listingTitle: listing?.title ?? "", listingImage: listing?.images?.[0] ?? null,
      listingPrice: listing?.price ?? 0, otherUserId: sellerId, otherUserName: otherUser?.name ?? "", otherUserAvatar: otherUser?.avatar ?? null,
      lastMessage: existing.lastMessage ?? null, lastMessageAt: existing.lastMessageAt?.toISOString() ?? null, unreadCount: 0,
    });
    return;
  }

  const [conv] = await db.insert(conversationsTable).values({ listingId, buyerId: req.userId!, sellerId }).returning();
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, sellerId));
  res.json({
    id: conv.id, listingId: conv.listingId, listingTitle: listing?.title ?? "", listingImage: listing?.images?.[0] ?? null,
    listingPrice: listing?.price ?? 0, otherUserId: sellerId, otherUserName: otherUser?.name ?? "", otherUserAvatar: otherUser?.avatar ?? null,
    lastMessage: null, lastMessageAt: null, unreadCount: 0,
  });
});

router.get("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.buyerId !== req.userId && conv.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(messagesTable)
    .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(eq(messagesTable.conversationId, id))
    .orderBy(desc(messagesTable.createdAt));

  const messages = rows.map(r => {
    const senderIsAdmin = !!(r.users?.isAdmin || r.users?.isSuperAdmin);
    return {
      id: r.messages.id, conversationId: r.messages.conversationId, senderId: r.messages.senderId,
      senderName: r.users?.name ?? "Unknown",
      senderAvatar: r.users?.avatar ?? null,
      senderIsAdmin,
      content: r.messages.content,
      messageType: r.messages.messageType ?? "text",
      mediaUrl: r.messages.mediaUrl ?? null,
      imageUrl: r.messages.imageUrl ?? null,
      isRead: r.messages.isRead,
      isListened: r.messages.isListened,
      createdAt: r.messages.createdAt.toISOString(),
    };
  }).reverse();

  await db.update(messagesTable).set({ isRead: true })
    .where(and(
      eq(messagesTable.conversationId, id),
      eq(messagesTable.isRead, false),
      ne(messagesTable.senderId, req.userId!),
    ));

  res.json(messages);
});

router.post("/conversations/:id/messages", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.buyerId !== req.userId && conv.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { content, messageType, mediaUrl, imageUrl } = parsed.data;

  const lastMessagePreview = messageType === "image" ? "📷 Photo"
    : messageType === "video" ? "🎥 Video"
    : messageType === "audio" ? "🎤 Mesaj vwa"
    : content;

  const [msg] = await db.insert(messagesTable).values({
    conversationId: id, senderId: req.userId!,
    content: content || "",
    messageType,
    mediaUrl: mediaUrl ?? null,
    imageUrl: imageUrl ?? null,
  }).returning();

  // Fraud: scan message for scam patterns + mass-messaging check (fire-and-forget)
  if (content && messageType === "text") {
    void import("../lib/fraudEngine").then(({ assessMessage, assessMassMessaging }) => {
      void assessMessage(req.userId!, content, id);
      void assessMassMessaging(req.userId!);
    });
  }

  await db.update(conversationsTable)
    .set({ lastMessage: lastMessagePreview, lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, id));

  const recipientId = conv.buyerId === req.userId ? conv.sellerId : conv.buyerId;
  await db.insert(notificationsTable).values({
    userId: recipientId, actorId: req.userId!, type: "message", listingId: conv.listingId ?? null,
  }).catch(() => {});

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const senderIsAdmin = !!(sender?.isAdmin || sender?.isSuperAdmin);

  const msgPayload = {
    id: msg.id, conversationId: msg.conversationId, senderId: msg.senderId,
    senderName: sender?.name ?? "Unknown",
    senderAvatar: sender?.avatar ?? null,
    content: msg.content, messageType: msg.messageType, mediaUrl: msg.mediaUrl ?? null,
    imageUrl: msg.imageUrl ?? null,
    isRead: msg.isRead, isListened: msg.isListened,
    createdAt: msg.createdAt.toISOString(),
  };

  emitNewMessage(id, msgPayload);
  emitConvUpdate(id, { lastMessage: lastMessagePreview, lastMessageAt: msg.createdAt.toISOString() });

  try {
    const pushBody = messageType === "image" ? "📷 Photo" : messageType === "video" ? "🎥 Video" : messageType === "audio" ? "🎤 Mesaj vwa" : content.slice(0, 120);
    const pushTitle = sender?.name ? `Mesaj nan men ${sender.name}` : "Nouvo mesaj";

    // Count all unread messages for the recipient across ALL conversations
    // (including the one we just inserted) so the badge reflects total unread.
    const recipientConvs = db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(or(eq(conversationsTable.buyerId, recipientId), eq(conversationsTable.sellerId, recipientId)));

    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(
        inArray(messagesTable.conversationId, recipientConvs),
        eq(messagesTable.isRead, false),
        ne(messagesTable.senderId, recipientId),
      ));
    const badgeCount = unreadRow?.count ?? 1;

    void sendPushToUser(recipientId, {
      title: pushTitle,
      body: pushBody,
      url: `/messages/${id}`,
      tag: `conv-${id}`,
    });
    void sendExpoPushToUser(recipientId, {
      title: pushTitle,
      body: pushBody,
      data: { url: `/messages/${id}`, screen: "messages", params: { conversationId: String(id) } },
      sound: "default",
      badge: badgeCount,
      channelId: "flexa-messages",
    });
  } catch {}

  res.status(201).json(msgPayload);
});

// Mark audio message as listened — called by the recipient when they play a voice note.
// Fires a real-time socket event so the sender's mic icon turns blue instantly.
router.patch("/conversations/:id/messages/:msgId/listened", requireAuth, async (req, res): Promise<void> => {
  const rawId    = Array.isArray(req.params.id)    ? req.params.id[0]    : req.params.id;
  const rawMsgId = Array.isArray(req.params.msgId) ? req.params.msgId[0] : req.params.msgId;
  const convId  = parseInt(rawId,    10);
  const msgId   = parseInt(rawMsgId, 10);
  if (isNaN(convId) || isNaN(msgId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.buyerId !== req.userId && conv.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  // Only the recipient (not the sender) should mark a message as listened
  const [msg] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.conversationId, convId)));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.senderId === req.userId) { res.status(403).json({ error: "Cannot mark own message" }); return; }
  if (msg.isListened) { res.json({ ok: true }); return; }

  await db.update(messagesTable).set({ isListened: true }).where(eq(messagesTable.id, msgId));
  emitAudioListened(convId, msgId);
  res.json({ ok: true });
});

// ─── Delete message (soft-delete) ────────────────────────────────────────────

router.delete("/conversations/:id/messages/:msgId", requireAuth, async (req, res): Promise<void> => {
  const rawId    = String(req.params.id);
  const rawMsgId = String(req.params.msgId);
  const convId   = parseInt(rawId, 10);
  const msgId    = parseInt(rawMsgId, 10);
  if (isNaN(convId) || isNaN(msgId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  if (conv.buyerId !== req.userId && conv.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [msg] = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.conversationId, convId)));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.senderId !== req.userId) { res.status(403).json({ error: "You can only delete your own messages" }); return; }
  if (msg.isDeleted) { res.json({ ok: true }); return; }

  await db.update(messagesTable)
    .set({ isDeleted: true, deletedAt: new Date(), content: "" })
    .where(eq(messagesTable.id, msgId));
  emitMsgDeleted(convId, msgId);
  res.json({ ok: true });
});

export default router;
