/** Shared chat theme + message types for Messages shell + lazy MessageThread. */
export type Conversation = {
  id: number;
  listingId?: number | null;
  listingTitle: string;
  listingImage?: string | null;
  listingPrice?: number | null;
  /** Video-only / hidden promo ghost — open watch URL instead of PDP. */
  listingIsVideoOnly?: boolean | null;
  otherUserId: number;
  otherUserName: string;
  otherUserAvatar?: string | null;
  /** Real KYC/verified flag from users.is_verified */
  otherUserIsVerified?: boolean;
  /** listing | agent_recharge | system_notifications | … */
  conversationType?: string;
  /** Current user's role in this conversation */
  myRole?: "buyer" | "seller";
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
};

export type MsgType = "text" | "image" | "video" | "audio";

export type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderAvatar?: string | null;
  senderIsAdmin?: boolean;
  content: string;
  messageType: MsgType;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  isRead: boolean;
  isListened: boolean;
  isDeleted?: boolean;
  /** Client idempotency key — used to clear the local Sending… outbox */
  clientMessageId?: string | null;
  createdAt: string;
};

export type ChatTheme = "sunlight" | "night";
export const THEME_KEY = "flexamarket_chat_theme_v2";

/** Flexa brand tokens — dark green / orange / white */
export const FLEXA = {
  green: "hsl(152,65%,18%)",
  greenDeep: "hsl(152,65%,14%)",
  greenMid: "hsl(152,55%,28%)",
  orange: "#F97316",
  orangeSoft: "#FFF7ED",
} as const;

export const T = {
  sunlight: {
    isDark: false,
    pageBg: "#F7F8F7",
    listBg: "#FFFFFF",
    listItemHover: "#F3F6F4",
    listItemActive: "rgba(4, 77, 44, 0.06)",
    listBorder: "#E8ECE9",
    headerBg: FLEXA.green,
    headerBorder: FLEXA.greenDeep,
    msgAreaBg: "#F7F8F7",
    // Outgoing = Flexa dark green; incoming = white
    bubbleOut: FLEXA.green,
    bubbleIn: "#FFFFFF",
    textOut: "#FFFFFF",
    textIn: "#1A1F1C",
    timeOut: "rgba(255,255,255,0.72)",
    timeIn: "#8B958E",
    seenColor: "#93C5FD",
    inputWrapBg: "#FFFFFF",
    inputBg: "#F3F5F4",
    inputText: "#1A1F1C",
    inputPlaceholder: "#9CA3AF",
    iconColor: "rgba(255,255,255,0.92)",
    iconActiveBg: "rgba(255,255,255,0.12)",
    nameColor: "#FFFFFF",
    presenceOn: "#22C55E",
    presenceOff: "#94A3B8",
    typingBg: "#FFFFFF",
    typingDot: "#94A3B8",
    contextBg: "#FFFFFF",
    contextBorder: "#E8ECE9",
    contextText: "#1A1F1C",
    contextDestructive: "#DC2626",
    listName: "#111827",
    listSub: "#6B7280",
    listTime: "#9CA3AF",
    emptyIcon: "#D1D5DB",
    emptyText: "#9CA3AF",
    toggleBg: "rgba(255,255,255,0.12)",
    toggleIcon: "#FCD34D",
    sendBg: FLEXA.orange,
    bubbleOutBorder: "transparent",
    bubbleInBorder: "rgba(0,0,0,0.06)",
  },
  night: {
    isDark: true,
    pageBg: "#0B1410",
    listBg: "#0F1A15",
    listItemHover: "#15241D",
    listItemActive: "rgba(249, 115, 22, 0.12)",
    listBorder: "#1E2E26",
    headerBg: FLEXA.greenDeep,
    headerBorder: "#0A120E",
    msgAreaBg: "#0B1410",
    bubbleOut: FLEXA.greenMid,
    bubbleIn: "#1A2620",
    textOut: "#FFFFFF",
    textIn: "#E5E7EB",
    timeOut: "rgba(255,255,255,0.55)",
    timeIn: "#94A3B8",
    seenColor: "#93C5FD",
    inputWrapBg: "#0F1A15",
    inputBg: "#1A2620",
    inputText: "#F1F5F9",
    inputPlaceholder: "#94A3B8",
    iconColor: "#E5E7EB",
    iconActiveBg: "rgba(255,255,255,0.08)",
    nameColor: "#F1F5F9",
    presenceOn: "#22C55E",
    presenceOff: "#64748B",
    typingBg: "#1A2620",
    typingDot: "#475569",
    contextBg: "#15241D",
    contextBorder: "#1E2E26",
    contextText: "#F1F5F9",
    contextDestructive: "#EF4444",
    listName: "#F1F5F9",
    listSub: "#94A3B8",
    listTime: "#64748B",
    emptyIcon: "#334155",
    emptyText: "#94A3B8",
    toggleBg: "rgba(255,255,255,0.08)",
    toggleIcon: "#FCD34D",
    sendBg: FLEXA.orange,
    bubbleOutBorder: "transparent",
    bubbleInBorder: "rgba(255,255,255,0.08)",
  },
} as const;
