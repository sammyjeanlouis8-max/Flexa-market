import { Router, Request, Response } from "express";
import { db, offersTable, listingsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateOfferBody } from "@workspace/api-zod";
import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { z } from "zod";

const router = Router();

// ── Server-Sent Events: per-user client registry ───────────────────────────
const sseClients = new Map<number, Set<Response>>();

function addSseClient(userId: number, res: Response) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);
}
function removeSseClient(userId: number, res: Response) {
  sseClients.get(userId)?.delete(res);
}
export function notifyUser(userId: number, event: string, data: unknown) {
  const clients = sseClients.get(userId);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { removeSseClient(userId, res); }
  }
}

// ── Format helper ───────────────────────────────────────────────────────────
async function formatOffer(offer: typeof offersTable.$inferSelect) {
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, offer.listingId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, offer.buyerId));
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, offer.sellerId));
  return {
    id: offer.id,
    listingId: offer.listingId,
    listingTitle: listing?.title ?? "",
    listingImage: listing?.images?.[0] ?? null,
    listingPrice: listing?.price ?? null,
    buyerId: offer.buyerId,
    buyerName: buyer?.name ?? "",
    buyerAvatar: buyer?.avatar ?? null,
    sellerId: offer.sellerId,
    sellerName: seller?.name ?? "",
    sellerAvatar: seller?.avatar ?? null,
    amount: offer.amount,
    counterAmount: offer.counterAmount ?? null,
    counterMessage: offer.counterMessage ?? null,
    status: offer.status,
    message: offer.message ?? null,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

// ── SSE stream ─────────────────────────────────────────────────────────────
// EventSource can't set custom headers, so we accept the JWT via query param
router.get("/offers/stream", async (req: Request, res: Response): Promise<void> => {
  // Auth: accept Bearer from Authorization header OR ?token= query param
  const rawToken =
    (typeof req.query.token === "string" ? req.query.token : null) ??
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);

  if (!rawToken) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { verifyToken } = await import("../lib/auth");
  const payload = verifyToken(rawToken);
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
  const userId = payload.userId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addSseClient(userId, res);

  // Heartbeat every 25 seconds to keep alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(userId, res);
  });
});

// ── GET /offers ────────────────────────────────────────────────────────────
router.get("/offers", requireAuth, async (req, res): Promise<void> => {
  const sentRows = await db.select().from(offersTable)
    .where(eq(offersTable.buyerId, req.userId!))
    .orderBy(desc(offersTable.updatedAt));
  const receivedRows = await db.select().from(offersTable)
    .where(eq(offersTable.sellerId, req.userId!))
    .orderBy(desc(offersTable.updatedAt));
  const sent = await Promise.all(sentRows.map(formatOffer));
  const received = await Promise.all(receivedRows.map(formatOffer));
  res.json({ sent, received });
});

// ── POST /offers ───────────────────────────────────────────────────────────
router.post("/offers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { listingId, amount, message } = parsed.data;

  if (amount <= 0) { res.status(400).json({ error: "Pri a twò ba. Tanpri mete yon montan valab." }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Lis sa a pa jwenn" }); return; }
  if (listing.sellerId === req.userId) { res.status(400).json({ error: "Ou pa ka fè yon òf sou pwòp lis ou" }); return; }

  req.log.info({ listingId, amount, userId: req.userId }, "Offer submission received");

  // Rate limit: max 3 pending offers per buyer per listing
  const existing = await db.select({ id: offersTable.id, buyerId: offersTable.buyerId, status: offersTable.status })
    .from(offersTable)
    .where(eq(offersTable.listingId, listingId))
    .orderBy(desc(offersTable.createdAt));
  const myPending = existing.filter((o) => o.buyerId === req.userId && o.status === "pending");
  if (myPending.length >= 3) {
    res.status(429).json({ error: "Ou gen twòp òf annatant sou lis sa a. Tann yon repons anvan ou soumèt yon lòt." }); return;
  }

  const [offer] = await db.insert(offersTable).values({
    listingId, buyerId: req.userId!, sellerId: listing.sellerId, amount, message: message ?? null,
  }).returning();

  const formatted = await formatOffer(offer);

  // In-app notification
  await db.insert(notificationsTable).values({
    userId: listing.sellerId, actorId: req.userId!, type: "offer_received", listingId,
  }).catch(() => {});

  // Push notification
  void sendPushToUser(listing.sellerId, {
    title: "Nouvo òf resevwa",
    body: `Yon moun fè yon òf $${amount} sou "${listing.title}"`,
    url: `/offers`,
    tag: `offer-${offer.id}`,
  });
  void sendExpoPushToUser(listing.sellerId, {
    title: "Nouvo òf resevwa 💰",
    body: `Yon moun fè yon òf $${amount} sou "${listing.title}"`,
    data: { url: "https://flexamarket.com/offers", screen: "offers" },
  });

  // SSE: notify seller in real-time
  notifyUser(listing.sellerId, "offer_created", formatted);

  res.status(201).json(formatted);
});

// ── POST /offers/:id/accept ────────────────────────────────────────────────
router.post("/offers/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  if (offer.sellerId !== req.userId) { res.status(403).json({ error: "Only the seller can accept an offer" }); return; }
  if (offer.status !== "pending") { res.status(400).json({ error: `Cannot accept an offer with status "${offer.status}"` }); return; }

  const [updated] = await db.update(offersTable).set({ status: "accepted" }).where(eq(offersTable.id, id)).returning();
  const formatted = await formatOffer(updated);

  await db.insert(notificationsTable).values({
    userId: offer.buyerId, actorId: req.userId!, type: "offer_accepted", listingId: offer.listingId,
  }).catch(() => {});

  void sendPushToUser(offer.buyerId, {
    title: "Òf ou aksepte!",
    body: `Mèt machandiz lan aksepte òf $${offer.amount} ou a.`,
    url: `/offers`,
    tag: `offer-${offer.id}`,
  });
  void sendExpoPushToUser(offer.buyerId, {
    title: "Òf ou aksepte! ✅",
    body: `Mèt machandiz lan aksepte òf $${offer.amount} ou a.`,
    data: { url: "https://flexamarket.com/offers", screen: "offers" },
  });

  notifyUser(offer.buyerId, "offer_updated", formatted);
  res.json(formatted);
});

// ── POST /offers/:id/reject ────────────────────────────────────────────────
router.post("/offers/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  if (offer.sellerId !== req.userId) { res.status(403).json({ error: "Only the seller can reject an offer" }); return; }
  if (!["pending", "counter"].includes(offer.status)) {
    res.status(400).json({ error: `Cannot reject an offer with status "${offer.status}"` }); return;
  }

  const [updated] = await db.update(offersTable).set({ status: "rejected" }).where(eq(offersTable.id, id)).returning();
  const formatted = await formatOffer(updated);

  await db.insert(notificationsTable).values({
    userId: offer.buyerId, actorId: req.userId!, type: "offer_rejected", listingId: offer.listingId,
  }).catch(() => {});

  void sendPushToUser(offer.buyerId, {
    title: "Òf ou refize",
    body: `Òf $${offer.amount} ou a pa aksepte.`,
    url: `/offers`,
    tag: `offer-${offer.id}`,
  });
  void sendExpoPushToUser(offer.buyerId, {
    title: "Òf ou refize ❌",
    body: `Òf $${offer.amount} ou a pa aksepte.`,
    data: { url: "https://flexamarket.com/offers", screen: "offers" },
  });

  notifyUser(offer.buyerId, "offer_updated", formatted);
  res.json(formatted);
});

// ── POST /offers/:id/counter ───────────────────────────────────────────────
const CounterBody = z.object({
  counterAmount: z.number().positive("Counter amount must be greater than 0"),
  counterMessage: z.string().optional(),
});

router.post("/offers/:id/counter", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const parsed = CounterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }); return; }

  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  if (offer.sellerId !== req.userId) { res.status(403).json({ error: "Only the seller can counter an offer" }); return; }
  if (offer.status !== "pending") { res.status(400).json({ error: `Cannot counter an offer with status "${offer.status}"` }); return; }

  const { counterAmount, counterMessage } = parsed.data;
  const [updated] = await db.update(offersTable)
    .set({ status: "counter", counterAmount, counterMessage: counterMessage ?? null })
    .where(eq(offersTable.id, id))
    .returning();
  const formatted = await formatOffer(updated);

  await db.insert(notificationsTable).values({
    userId: offer.buyerId, actorId: req.userId!, type: "offer_counter", listingId: offer.listingId,
  }).catch(() => {});

  const [listing] = await db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.id, offer.listingId));
  void sendPushToUser(offer.buyerId, {
    title: "Kont-òf resevwa",
    body: `Mèt machandiz la fè yon kont-òf $${counterAmount} sou "${listing?.title ?? ""}"`,
    url: `/offers`,
    tag: `offer-${offer.id}`,
  });

  notifyUser(offer.buyerId, "offer_updated", formatted);
  res.json(formatted);
});

// ── POST /offers/:id/accept-counter ───────────────────────────────────────
router.post("/offers/:id/accept-counter", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  if (offer.buyerId !== req.userId) { res.status(403).json({ error: "Only the buyer can accept a counter offer" }); return; }
  if (offer.status !== "counter") { res.status(400).json({ error: "No active counter offer to accept" }); return; }

  // Promote counter price as the agreed price
  const [updated] = await db.update(offersTable)
    .set({ status: "accepted", amount: offer.counterAmount ?? offer.amount })
    .where(eq(offersTable.id, id))
    .returning();
  const formatted = await formatOffer(updated);

  await db.insert(notificationsTable).values({
    userId: offer.sellerId, actorId: req.userId!, type: "offer_accepted", listingId: offer.listingId,
  }).catch(() => {});

  void sendPushToUser(offer.sellerId, {
    title: "Kont-òf ou aksepte!",
    body: `Acheteur an aksepte kont-òf $${offer.counterAmount ?? offer.amount} ou a.`,
    url: `/offers`,
    tag: `offer-${offer.id}`,
  });

  notifyUser(offer.sellerId, "offer_updated", formatted);
  res.json(formatted);
});

export default router;
