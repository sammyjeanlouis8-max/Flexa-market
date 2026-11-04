/** Shared chat theme + message types for Messages shell + lazy MessageThread. */
export type Conversation = {
  id: number; listingId?: number | null; listingTitle: string; listingImage?: string | null;
  listingPrice?: number | null;
  otherUserId: number; otherUserName: string; otherUserAvatar?: string | null;
  lastMessage?: string | null; lastMessageAt?: string | null; unreadCount: number;
};

export type MsgType = "text" | "image" | "video" | "audio";

export type ChatMessage = {
  id: number; conversationId: number; senderId: number;
  senderName: string; senderAvatar?: string | null;
  senderIsAdmin?: boolean;
  content: string; messageType: MsgType;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  isRead: boolean;
  isListened: boolean;
  isDeleted?: boolean;
  createdAt: string;
};

export type ChatTheme = "sunlight" | "night";
export const THEME_KEY = "flexamarket_chat_theme_v2";

export const T = {
  sunlight: {
    isDark: false,
    pageBg: "#f8f8f3",
    listBg: "#FFFFFF",
    listItemHover: "#F3F4F6",
    listItemActive: "#EBF4FF",
    listBorder: "#E5E7EB",
    headerBg: "rgba(255,254,250,0.94)",
    headerBorder: "#e5e9e2",
    msgAreaBg: "#f8f8f3",
    // Warm ivory/mint modern bubbles
    bubbleOut: "#dff3d4",
    bubbleIn: "#fffefa",
    textOut: "#26332e",
    textIn: "#26332e",
    timeOut: "#8e9b93",
    timeIn: "#8e9b93",
    seenColor: "#2a76d8",
    inputWrapBg: "rgba(255,254,250,0.98)",
    inputBg: "#f7f3eb",
    inputText: "#202434",
    inputPlaceholder: "#9CA3AF",
    iconColor: "#647084",
    iconActiveBg: "#f0f3ed",
    nameColor: "#202434",
    presenceOn: "#55ab76",
    presenceOff: "#74877c",
    typingBg: "#fffefa",
    typingDot: "#93a39a",
    contextBg: "#fffefa",
    contextBorder: "#e5e9e2",
    contextText: "#202434",
    contextDestructive: "#e55646",
    listName: "#111827",
    listSub: "#6B7280",
    listTime: "#9CA3AF",
    emptyIcon: "#D1D5DB",
    emptyText: "#9CA3AF",
    toggleBg: "#f0f3ed",
    toggleIcon: "#818CF8",
    sendBg: "#e96d57",
    // bubble borders
    bubbleOutBorder: "#c9e7be",
    bubbleInBorder: "rgba(223,230,221,0.9)",
  },
  night: {
    isDark: true,
    pageBg: "#0F172A",
    listBg: "#0F172A",
    listItemHover: "#1E293B",
    listItemActive: "#1E293B",
    listBorder: "#1E293B",
    headerBg: "#0F172A",
    headerBorder: "#1E293B",
    msgAreaBg: "#0F172A",
    bubbleOut: "linear-gradient(135deg, #4f7cff, #3b82f6)",
    bubbleIn: "rgba(255, 255, 255, 0.08)",
    textOut: "#FFFFFF",
    textIn: "#E5E7EB",
    timeOut: "rgba(255,255,255,0.55)",
    timeIn: "#94A3B8",
    seenColor: "#A78BFA",
    inputWrapBg: "#0F172A",
    inputBg: "#1E293B",
    inputText: "#F1F5F9",
    inputPlaceholder: "#94A3B8",
    iconColor: "#94A3B8",
    iconActiveBg: "#1E293B",
    nameColor: "#F1F5F9",
    presenceOn: "#22C55E",
    presenceOff: "#64748B",
    typingBg: "#1E293B",
    typingDot: "#475569",
    contextBg: "#1E293B",
    contextBorder: "#334155",
    contextText: "#F1F5F9",
    contextDestructive: "#EF4444",
    listName: "#F1F5F9",
    listSub: "#94A3B8",
    listTime: "#64748B",
    emptyIcon: "#334155",
    emptyText: "#94A3B8",
    toggleBg: "#1E293B",
    toggleIcon: "#818CF8",
    sendBg: "#7C3AED",
    // bubble borders (night — subtle)
    bubbleOutBorder: "rgba(79,124,255,0.30)",
    bubbleInBorder: "rgba(255,255,255,0.10)",
  },
} as const;

