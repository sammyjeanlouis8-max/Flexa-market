import { Router } from "express";
import { db, conversationsTable, messagesTable, usersTable, listingsTable, notificationsTable } from "@workspace/db";
import { eq, and, or, desc, ne, sql, inArray, count } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireNotRestricted } from "../middlewares/auth";
import { CreateConversationBody } from "@workspace/api-zod";
import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { emitNewMessage, emitConvUpdate, emitAudioListened, emitMsgDeleted } from "../lib/socketServer";
import { publicDisplayName } from "../lib/publicDisplayName";
import { isDirectMessagingBlocked } from "../lib/catalogVisibility";
import { z } from "zod";

const SITE_BASE_URL = process.env["PUBLIC_BASE_URL"] ?? "https://flexamarket.com";

const router = Router();

const SendMessageBody = z.object({
  content: z.string().default(""),
  messageType: z.enum(["text", "image", "video", "audio"]).default("text"),
  mediaUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  clientMessageId: z.string().trim().min(1).max(64).optional(),
  replyToMessageId: z.number().int().positive().optional(),
});

    // The API starts listening before the full startup migration chain finishes.
    // Ensure the message columns used by voice playback and soft-delete exist
    // before a conversation request runs, so the first mobile fetch cannot fail
    // with "column does not exist" during a deploy or cold start.
    let messageSchemaReady: Promise<void> | null = null;
    function ensureMessageSchema(): Promise<void> {
    if (!messageSchemaReady) {
      messageSchemaReady = (async () => {
        await db.execute(sql.raw(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_listened boolean NOT NULL DEFAULT false",
        ));
        await db.execute(sql.raw(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false",
        ));
        await db.execute(sql.raw(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz",
        ));
        await db.execute(sql.raw(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id text",
        ));
        await db.execute(sql.raw(
          "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id integer",
        ));
        await db.execute(sql.raw(
          `CREATE UNIQUE INDEX IF NOT EXISTS messages_client_msg_uidx
            ON messages (conversation_id, sender_id, client_message_id)
            WHERE client_message_id IS NOT NULL`,
        ));
      })().catch((error) => {
        // Allow the next request to retry if the database was still waking up.
        messageSchemaReady = null;
        throw error;
      });
    }
    return messageSchemaReady;
    }

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
    .innerJoin(conversationsTable, and(
      eq(messagesTable.conversationId, conversationsTable.id),
      or(eq(conversationsTable.buyerId, userId), eq(conversationsTable.sellerId, userId)),
    ))
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
        status: listingsTable.status,
        boostImageUrl: listingsTable.boostImageUrl,
      },
      buyer: {
        id: buyerUser.id,
        name: buyerUser.name,
        avatar: buyerUser.avatar,
        isAdmin: buyerUser.isAdmin,
        isSuperAdmin: buyerUser.isSuperAdmin,
        isVerified: buyerUser.isVerified,
      },
      seller: {
        id: sellerUser.id,
        name: sellerUser.name,
        avatar: sellerUser.avatar,
        isAdmin: sellerUser.isAdmin,
        isSuperAdmin: sellerUser.isSuperAdmin,
        isVerified: sellerUser.isVerified,
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
    const isSystemNotifications = r.conv.conversationType === "system_notifications";
    return {
      id: r.conv.id,
      listingId: r.conv.listingId,
      listingTitle: r.conv.conversationType === "agent_recharge"
        ? "💼 Agent Recharge"
        : isSystemNotifications
          ? "Message System"
          : (r.listing?.title ?? "Deleted listing"),
      listingImage: r.listing?.images?.[0] ?? r.listing?.boostImageUrl ?? null,
      listingPrice: r.listing?.price ?? 0,
      listingIsVideoOnly: r.listing?.status === "hidden",
      otherUserId,
      otherUserName: isSystemNotifications
        ? "Message System"
        : publicDisplayName(otherUser?.name),
      otherUserAvatar: isSystemNotifications
        ? (otherUser?.avatar || "/flexa-logo-v2.png")
        : (otherUser?.avatar ?? null),
      otherUserIsVerified: isSystemNotifications ? true : !!otherUser?.isVerified,
      conversationType: r.conv.conversationType ?? "listing",
      /** Role of the current user in this conversation — drives Buyers/Sellers inbox tabs. */
      myRole: (isBuyer ? "buyer" : "seller") as "buyer" | "seller",
      lastMessage: r.conv.lastMessage ?? null,
      lastMessageAt: r.conv.lastMessageAt?.toISOString() ?? null,
      unreadCount: Number(r.unreadCount ?? 0),
    };
  });

  // Keep official System Notifications near the top of the inbox.
  result.sort((a, b) => {
    const aSys = a.conversationType === "system_notifications" ? 1 : 0;
    const bSys = b.conversationType === "system_notifications" ? 1 : 0;
    if (aSys !== bSys) return bSys - aSys;
    const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bTime - aTime;
  });

  res.json(result);
});

router.post("/conversations", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { listingId, sellerId } = parsed.data;

  const [listingOwner] = await db
    .select({ sellerId: listingsTable.sellerId })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  if (!listingOwner?.sellerId) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listingOwner.sellerId !== sellerId) {
    res.status(400).json({ error: "Seller does not own this listing" });
    return;
  }

  if (req.userId === sellerId) { res.status(400).json({ error: "Cannot chat with yourself" }); return; }

  if (await isDirectMessagingBlocked(req.userId!, sellerId)) {
    res.status(403).json({ error: "Messaging is blocked between these users", code: "MESSAGING_BLOCKED" });
    return;
  }

  const [existing] = await db.select().from(conversationsTable)
    .where(sql`${conversationsTable.listingId} = ${listingId} AND ${conversationsTable.buyerId} = ${Number(req.userId)} AND ${conversationsTable.sellerId} = ${sellerId}`);

  const listingPreview = (listing: typeof listingsTable.$inferSelect | undefined) => {
    const isVideoOnly = listing?.status === "hidden";
    const listingImage = listing?.images?.[0]
      ?? listing?.boostImageUrl
      ?? null;
    return {
      listingTitle: listing?.title ?? "",
      listingImage,
      listingPrice: listing?.price ?? 0,
      listingIsVideoOnly: isVideoOnly,
    };
  };

  if (existing) {
    const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, existing.listingId!));
    const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, sellerId));
    res.json({
      id: existing.id, listingId: existing.listingId, ...listingPreview(listing),
      otherUserId: sellerId, otherUserName: publicDisplayName(otherUser?.name, ""), otherUserAvatar: otherUser?.avatar ?? null,
      lastMessage: existing.lastMessage ?? null, lastMessageAt: existing.lastMessageAt?.toISOString() ?? null, unreadCount: 0,
    });
    return;
  }

  const [conv] = await db.insert(conversationsTable).values({ listingId, buyerId: req.userId!, sellerId }).returning();
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, sellerId));
  res.json({
    id: conv.id, listingId: conv.listingId, ...listingPreview(listing),
    otherUserId: sellerId, otherUserName: publicDisplayName(otherUser?.name, ""), otherUserAvatar: otherUser?.avatar ?? null,
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
    const deleted = !!(r.messages as any).isDeleted;
    return {
      id: r.messages.id, conversationId: r.messages.conversationId, senderId: r.messages.senderId,
      senderName: publicDisplayName(r.users?.name),
      senderAvatar: r.users?.avatar ?? null,
      senderIsAdmin,
      content: deleted ? "" : r.messages.content,
      messageType: r.messages.messageType ?? "text",
      mediaUrl: deleted ? null : (r.messages.mediaUrl ?? null),
      imageUrl: deleted ? null : (r.messages.imageUrl ?? null),
      isRead: r.messages.isRead,
      isListened: r.messages.isListened,
      isDeleted: deleted,
      clientMessageId: (r.messages as any).clientMessageId ?? null,
      replyToMessageId: (r.messages as any).replyToMessageId ?? null,
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

  const peerId = conv.buyerId === req.userId ? conv.sellerId : conv.buyerId;
  if (await isDirectMessagingBlocked(req.userId!, peerId)) {
    res.status(403).json({ error: "Messaging is blocked between these users", code: "MESSAGING_BLOCKED" });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { content, messageType, mediaUrl, imageUrl, clientMessageId, replyToMessageId } = parsed.data;

  const formatExisting = async (existing: typeof messagesTable.$inferSelect) => {
    const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    return {
      id: existing.id, conversationId: existing.conversationId, senderId: existing.senderId,
      senderName: publicDisplayName(sender?.name), senderAvatar: sender?.avatar ?? null,
      content: existing.content, messageType: existing.messageType, mediaUrl: existing.mediaUrl ?? null,
      imageUrl: existing.imageUrl ?? null, isRead: existing.isRead, isListened: existing.isListened,
      isDeleted: !!(existing as any).isDeleted,
      clientMessageId: (existing as any).clientMessageId ?? null,
      replyToMessageId: (existing as any).replyToMessageId ?? null,
      createdAt: existing.createdAt.toISOString(),
      duplicate: true as const,
    };
  };

  // Idempotent retry via clientMessageId
  if (clientMessageId) {
    const [existing] = await db.select().from(messagesTable).where(and(
      eq(messagesTable.conversationId, id),
      eq(messagesTable.senderId, req.userId!),
      eq(messagesTable.clientMessageId, clientMessageId),
    )).limit(1);
    if (existing) {
      res.json(await formatExisting(existing));
      return;
    }
  }

  // The uploaded media URL is stable across retries, so it acts as an idempotency key.
  if (messageType === "audio" && mediaUrl) {
    const [existing] = await db.select().from(messagesTable).where(and(
      eq(messagesTable.conversationId, id),
      eq(messagesTable.senderId, req.userId!),
      eq(messagesTable.messageType, "audio"),
      eq(messagesTable.mediaUrl, mediaUrl),
    )).limit(1);
    if (existing) {
      res.json(await formatExisting(existing));
      return;
    }
  }

  let replyParent: number | null = null;
  if (replyToMessageId) {
    const [parent] = await db.select({ id: messagesTable.id, conversationId: messagesTable.conversationId })
      .from(messagesTable)
      .where(eq(messagesTable.id, replyToMessageId))
      .limit(1);
    if (parent && parent.conversationId === id) replyParent = parent.id;
  }

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
    clientMessageId: clientMessageId ?? null,
    replyToMessageId: replyParent,
  } as any).returning();

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
    senderName: publicDisplayName(sender?.name),
    senderAvatar: sender?.avatar ?? null,
    senderIsAdmin,
    content: msg.content, messageType: msg.messageType, mediaUrl: msg.mediaUrl ?? null,
    imageUrl: msg.imageUrl ?? null,
    isRead: msg.isRead, isListened: msg.isListened,
    isDeleted: false,
    clientMessageId: (msg as any).clientMessageId ?? clientMessageId ?? null,
    replyToMessageId: (msg as any).replyToMessageId ?? replyParent,
    createdAt: msg.createdAt.toISOString(),
  };

  emitNewMessage(id, msgPayload);
  emitConvUpdate(id, { lastMessage: lastMessagePreview, lastMessageAt: msg.createdAt.toISOString() });

  try {
    // Localize the push notification to the recipient's preferred language
    // (en / fr / ht — same set as PATCH /auth/language). Default: Kreyòl.
    const [recipient] = await db
      .select({ preferredLanguage: usersTable.preferredLanguage })
      .from(usersTable)
      .where(eq(usersTable.id, recipientId));
    const lang = "en"; // always English — language detection removed per product decision
    const L = {
      ht: { from: (n: string) => `Mesaj nan men ${n}`, newMsg: "Nouvo mesaj", voice: "🎤 Mesaj vwa" },
      fr: { from: (n: string) => `Message de ${n}`,    newMsg: "Nouveau message", voice: "🎤 Message vocal" },
      en: { from: (n: string) => `Message from ${n}`,  newMsg: "New message",     voice: "🎤 Voice message" },
    }[lang];
    const pushBody = messageType === "image" ? "📷 Photo" : messageType === "video" ? "🎥 Video" : messageType === "audio" ? L.voice : content.slice(0, 120);
    const pushSenderName = publicDisplayName(sender?.name, "");
    const pushTitle = pushSenderName ? L.from(pushSenderName) : L.newMsg;

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

    // Fire-and-forget: translate the body into the recipient's language (only
      // when sender/recipient languages differ), then send the pushes. Runs off
      // the request path so message sending is never delayed by translation.
      void (async () => {
        let finalBody = pushBody;
        const senderLang = sender?.preferredLanguage === "en" || sender?.preferredLanguage === "fr" ? sender.preferredLanguage : "ht";
        if (messageType === "text" && content?.trim() && senderLang !== lang) {
          try {
            const { translateForPush } = await import("../lib/pushTranslate");
            const translated = await translateForPush(content.slice(0, 300), lang);
            if (translated) finalBody = translated.slice(0, 120);
          } catch { /* keep original */ }
        }
        void sendPushToUser(recipientId, {
          title: pushTitle,
          body: finalBody,
          url: `${SITE_BASE_URL}/messages/${id}`,
          tag: `conv-${id}`,
        });
        void sendExpoPushToUser(recipientId, {
          title: pushTitle,
          body: finalBody,
          data: { url: `${SITE_BASE_URL}/messages/${id}`, screen: "messages", params: { conversationId: String(id) } },
          sound: "default",
          badge: badgeCount,
          channelId: "default",
        });
      })();
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
