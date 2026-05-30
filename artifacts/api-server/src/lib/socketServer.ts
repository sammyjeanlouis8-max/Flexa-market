import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { messagesTable, usersTable, agentApplicationsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

let io: SocketIOServer | null = null;

// ── In-memory presence tracking ───────────────────────────────────────────────
// Maps userId → Set of connected socketIds. A user is "online" as long as they
// have at least one active socket connection.
const onlineUsers = new Map<number, Set<string>>();

export function isUserOnline(userId: number): boolean {
  return (onlineUsers.get(userId)?.size ?? 0) > 0;
}

export async function setLastSeen(userId: number): Promise<void> {
  await db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, userId));
}

async function setAgentOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
  await db
    .update(agentApplicationsTable)
    .set({ isOnline, lastSeenAt: new Date(), updatedAt: new Date() } as any)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")));
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "[socket] client connected");

    // ── Presence ──────────────────────────────────────────────────────────────
    socket.on("presence:join", (userId: number) => {
      if (!userId || typeof userId !== "number") return;
      socket.data.userId = userId;
      if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
      onlineUsers.get(userId)!.add(socket.id);
      setLastSeen(userId).catch(() => {});
      // Agent availability (isOnline) is controlled ONLY via PATCH /agents/set-online.
      // Socket connect/disconnect must NOT override the agent's manual toggle.
      socket.broadcast.emit("presence:status", { userId, isOnline: true });
    });

    socket.on("presence:query", (userId: number) => {
      socket.emit("presence:status", { userId, isOnline: isUserOnline(userId) });
    });

    // ── Marketplace conversation rooms ────────────────────────────────────────
    socket.on("join-conv", (convId: number) => {
      socket.join(`conv:${convId}`);
      logger.info({ socketId: socket.id, room: `conv:${convId}` }, "[socket] joined conv room");
    });

    socket.on("leave-conv", (convId: number) => {
      socket.leave(`conv:${convId}`);
    });

    socket.on("typing", ({ convId, userId }: { convId: number; userId: number }) => {
      socket.to(`conv:${convId}`).emit("typing", { convId, userId });
    });

    socket.on("stop-typing", ({ convId, userId }: { convId: number; userId: number }) => {
      socket.to(`conv:${convId}`).emit("stop-typing", { convId, userId });
    });

    // ── Support chat rooms ────────────────────────────────────────────────────
    socket.on("join-support", (threadId: number) => {
      socket.join(`support:${threadId}`);
      logger.info({ socketId: socket.id, threadId }, "[socket] joined support thread room");
    });

    socket.on("leave-support", (threadId: number) => {
      socket.leave(`support:${threadId}`);
    });

    socket.on("join-support-admin", () => {
      socket.join("support-admin");
      logger.info({ socketId: socket.id }, "[socket] joined support-admin room");
    });

    socket.on("leave-support-admin", () => {
      socket.leave("support-admin");
    });

    socket.on(
      "support-typing",
      ({ threadId, userId, userName }: { threadId: number; userId: number; userName: string }) => {
        socket.to(`support:${threadId}`).emit("support-typing", { threadId, userId, userName });
      },
    );

    socket.on(
      "support-stop-typing",
      ({ threadId, userId }: { threadId: number; userId: number }) => {
        socket.to(`support:${threadId}`).emit("support-stop-typing", { threadId, userId });
      },
    );

    // ── Delivery tracking rooms (GPS) ─────────────────────────────────────────
    socket.on("join-delivery", (deliveryId: number) => {
      socket.join(`delivery:${deliveryId}`);
      logger.info({ socketId: socket.id, room: `delivery:${deliveryId}` }, "[socket] joined delivery room");
    });

    socket.on("leave-delivery", (deliveryId: number) => {
      socket.leave(`delivery:${deliveryId}`);
    });

    // ── Listing video post rooms ───────────────────────────────────────────────
    socket.on("join-listing", (listingId: number) => {
      socket.join(`listing:${listingId}`);
    });

    socket.on("leave-listing", (listingId: number) => {
      socket.leave(`listing:${listingId}`);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "[socket] client disconnected");
      const userId = socket.data.userId as number | undefined;
      if (userId) {
        const sockets = onlineUsers.get(userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineUsers.delete(userId);
            const lastSeenAt = new Date();
            db.update(usersTable).set({ lastSeenAt }).where(eq(usersTable.id, userId)).catch(() => {});
            // Do NOT call setAgentOnlineStatus(false) here — agent availability
            // persists through disconnects and is only changed via PATCH /agents/set-online.
            if (io) io.emit("presence:status", { userId, isOnline: false, lastSeenAt: lastSeenAt.toISOString() });
          }
        }
      }
    });
  });

  return io;
}

// ── Delivery GPS helper ───────────────────────────────────────────────────────

export function emitDriverLocation(
  deliveryId: number,
  data: { lat: number; lng: number; deliveryId: number; updatedAt: string },
): void {
  if (!io) return;
  io.to(`delivery:${deliveryId}`).emit("driver:location", data);
}

// ── Delivery status change (e.g. picked_up with verification code) ────────────

export function emitDeliveryStatus(
  deliveryId: number,
  data: { status: string; verificationCode?: string },
): void {
  if (!io) return;
  io.to(`delivery:${deliveryId}`).emit("delivery:status", { deliveryId, ...data });
}

// ── Admin live drivers broadcast ──────────────────────────────────────────────

export function emitAdminDriverUpdate(data: object): void {
  if (!io) return;
  io.to("admin-drivers-live").emit("admin:driver-update", data);
}

// ── Listing video post helpers ────────────────────────────────────────────────

export function emitNewListingComment(listingId: number, comment: object): void {
  if (!io) return;
  io.to(`listing:${listingId}`).emit("listing-new-comment", comment);
}

export function emitListingEngagement(listingId: number, data: object): void {
  if (!io) return;
  io.to(`listing:${listingId}`).emit("listing-engagement", data);
}

// ── Marketplace helpers ───────────────────────────────────────────────────────

export function emitNewMessage(convId: number, message: object): void {
  if (!io) return;
  io.to(`conv:${convId}`).emit("new-message", message);
}

export function emitConvUpdate(convId: number, data: object): void {
  if (!io) return;
  io.to(`conv:${convId}`).emit("conv-update", data);
}

export function emitAudioListened(convId: number, msgId: number): void {
  if (!io) return;
  io.to(`conv:${convId}`).emit("audio-listened", { convId, msgId });
}

// ── Support helpers ───────────────────────────────────────────────────────────

export function emitSupportMessage(threadId: number, msg: object): void {
  if (!io) return;
  io.to(`support:${threadId}`).emit("support-new-message", msg);
}

export function emitSupportUpdate(threadId: number, data: object): void {
  if (!io) return;
  io.to(`support:${threadId}`).emit("support-update", data);
}

export function emitNewSupportThread(data: object): void {
  if (!io) return;
  io.to("support-admin").emit("support-new-thread", data);
}

export function emitMsgDeleted(convId: number, msgId: number): void {
  if (!io) return;
  io.to(`conv_${convId}`).emit("msg_deleted", { convId, msgId });
}

export { io };
