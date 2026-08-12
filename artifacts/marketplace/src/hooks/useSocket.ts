import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  // Never recreate the socket if it already exists — socket.io's built-in
  // reconnection will bring it back when internet returns.  Creating a new
  // instance while the old one is still alive causes TWO sockets to connect
  // at the same time, doubling every event and freezing the React tree.
  if (!globalSocket) {
    globalSocket = io("/", {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5,
    });
  }
  return globalSocket;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    return () => {};
  }, []);

  // ── Marketplace conversation helpers ────────────────────────────────────────

  const joinConv = useCallback((convId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("join-conv", convId);
  }, []);

  const leaveConv = useCallback((convId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("leave-conv", convId);
  }, []);

  const emitTyping = useCallback((convId: number, userId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("typing", { convId, userId });
  }, []);

  const emitStopTyping = useCallback((convId: number, userId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("stop-typing", { convId, userId });
  }, []);

  const onNewMessage = useCallback((cb: (msg: any) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("new-message", cb);
    return () => { socket.off("new-message", cb); };
  }, []);

  const onAudioListened = useCallback((cb: (data: { convId: number; msgId: number }) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("audio-listened", cb);
    return () => { socket.off("audio-listened", cb); };
  }, []);

  const onMsgDeleted = useCallback((cb: (data: { convId: number; msgId: number }) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("msg_deleted", cb);
    return () => { socket.off("msg_deleted", cb); };
  }, []);

  const onTyping = useCallback((cb: (data: { convId: number; userId: number }) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("typing", cb);
    return () => { socket.off("typing", cb); };
  }, []);

  const onStopTyping = useCallback((cb: (data: { convId: number; userId: number }) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("stop-typing", cb);
    return () => { socket.off("stop-typing", cb); };
  }, []);

  // ── Support chat helpers ────────────────────────────────────────────────────

  const joinSupport = useCallback((threadId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("join-support", threadId);
  }, []);

  const leaveSupport = useCallback((threadId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("leave-support", threadId);
  }, []);

  const joinSupportAdmin = useCallback(() => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("join-support-admin");
  }, []);

  const leaveSupportAdmin = useCallback(() => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("leave-support-admin");
  }, []);

  const emitSupportTyping = useCallback(
    (threadId: number, userId: number, userName: string) => {
      const socket = socketRef.current ?? getSocket();
      socket.emit("support-typing", { threadId, userId, userName });
    },
    [],
  );

  const emitSupportStopTyping = useCallback((threadId: number, userId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("support-stop-typing", { threadId, userId });
  }, []);

  const onSupportMessage = useCallback(
    (cb: (msg: any) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("support-new-message", cb);
      return () => { socket.off("support-new-message", cb); };
    },
    [],
  );

  const onSupportTyping = useCallback(
    (cb: (data: { threadId: number; userId: number; userName: string }) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("support-typing", cb);
      return () => { socket.off("support-typing", cb); };
    },
    [],
  );

  const onSupportStopTyping = useCallback(
    (cb: (data: { threadId: number; userId: number }) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("support-stop-typing", cb);
      return () => { socket.off("support-stop-typing", cb); };
    },
    [],
  );

  const onSupportUpdate = useCallback(
    (cb: (data: any) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("support-update", cb);
      return () => { socket.off("support-update", cb); };
    },
    [],
  );

  const onNewSupportThread = useCallback(
    (cb: (data: any) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("support-new-thread", cb);
      return () => { socket.off("support-new-thread", cb); };
    },
    [],
  );

  // ── Listing video post helpers ────────────────────────────────────────────

  const joinListing = useCallback((listingId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("join-listing", listingId);
  }, []);

  const leaveListing = useCallback((listingId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("leave-listing", listingId);
  }, []);

  const onNewListingComment = useCallback((cb: (comment: any) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("listing-new-comment", cb);
    return () => { socket.off("listing-new-comment", cb); };
  }, []);

  const onListingEngagement = useCallback((cb: (data: any) => void) => {
    const socket = socketRef.current ?? getSocket();
    socket.on("listing-engagement", cb);
    return () => { socket.off("listing-engagement", cb); };
  }, []);

  // ── Delivery GPS tracking helpers ────────────────────────────────────────

  const joinDelivery = useCallback((deliveryId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("join-delivery", deliveryId);
  }, []);

  const leaveDelivery = useCallback((deliveryId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("leave-delivery", deliveryId);
  }, []);

  const onDriverLocation = useCallback(
    (cb: (data: { lat: number; lng: number; deliveryId: number; updatedAt: string }) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("driver:location", cb);
      return () => { socket.off("driver:location", cb); };
    },
    [],
  );

  const onDeliveryStatus = useCallback(
    (cb: (data: { deliveryId: number; status: string; verificationCode?: string }) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("delivery:status", cb);
      return () => { socket.off("delivery:status", cb); };
    },
    [],
  );

  const onAdminDriverUpdate = useCallback(
    (cb: (data: { userId: number; lat: number; lng: number; updatedAt: string }) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("admin:driver-update", cb);
      return () => { socket.off("admin:driver-update", cb); };
    },
    [],
  );

  // ── Presence helpers ─────────────────────────────────────────────────────

  const emitPresenceJoin = useCallback((userId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("presence:join", userId);
  }, []);

  const queryPresence = useCallback((userId: number) => {
    const socket = socketRef.current ?? getSocket();
    socket.emit("presence:query", userId);
  }, []);

  const onPresenceStatus = useCallback(
    (cb: (data: { userId: number; isOnline: boolean; lastSeenAt?: string | null }) => void) => {
      const socket = socketRef.current ?? getSocket();
      socket.on("presence:status", cb);
      return () => { socket.off("presence:status", cb); };
    },
    [],
  );

  return {
    // Marketplace conversations
    joinConv, leaveConv, emitTyping, emitStopTyping,
    onNewMessage, onAudioListened, onMsgDeleted, onTyping, onStopTyping,
    // Listing video posts
    joinListing, leaveListing, onNewListingComment, onListingEngagement,
    // Support
    joinSupport, leaveSupport,
    joinSupportAdmin, leaveSupportAdmin,
    emitSupportTyping, emitSupportStopTyping,
    onSupportMessage, onSupportTyping, onSupportStopTyping,
    onSupportUpdate, onNewSupportThread,
    // Delivery GPS
    joinDelivery, leaveDelivery, onDriverLocation, onDeliveryStatus, onAdminDriverUpdate,
    // Presence
    emitPresenceJoin, queryPresence, onPresenceStatus,
  };
}
