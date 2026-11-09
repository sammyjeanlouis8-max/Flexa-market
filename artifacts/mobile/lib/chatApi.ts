/**
 * Flexa Chat — conversations + messages against DigitalOcean APIs.
 * Realtime is handled separately via socket.io (/api/socket.io).
 */
import { getApiBase } from "./api";

export type Conversation = {
  id: number;
  listingId: number | null;
  listingTitle: string;
  listingImage: string | null;
  listingPrice: number;
  listingIsVideoOnly?: boolean;
  otherUserId: number | null;
  otherUserName: string;
  otherUserAvatar: string | null;
  otherUserIsVerified?: boolean;
  conversationType?: string | null;
  myRole?: "buyer" | "seller";
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderAvatar: string | null;
  senderIsAdmin?: boolean;
  content: string;
  messageType: "text" | "image" | "video" | "audio" | string;
  mediaUrl: string | null;
  imageUrl: string | null;
  isRead: boolean;
  isListened?: boolean;
  isDeleted?: boolean;
  clientMessageId?: string | null;
  replyToMessageId?: number | null;
  createdAt: string;
  duplicate?: boolean;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authedFetch(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchConversations(opts: AuthOpts): Promise<Conversation[]> {
  const res = await authedFetch("/conversations", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Conversations failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchUnreadCount(opts: AuthOpts): Promise<number> {
  const res = await authedFetch("/conversations/unread-count", opts);
  const data = await readJson(res);
  if (!res.ok) return 0;
  return Number(data.count ?? 0);
}

export async function createConversation(
  input: { listingId: number; sellerId: number },
  opts: AuthOpts,
): Promise<Conversation> {
  const res = await authedFetch("/conversations", {
    ...opts,
    method: "POST",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Could not start chat (${res.status})`);
  return data as Conversation;
}

export async function fetchMessages(
  conversationId: number,
  opts: AuthOpts,
): Promise<ChatMessage[]> {
  const res = await authedFetch(`/conversations/${conversationId}/messages`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Messages failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function sendMessage(
  conversationId: number,
  body: {
    content?: string;
    messageType?: "text" | "image" | "video" | "audio";
    mediaUrl?: string;
    imageUrl?: string;
    clientMessageId?: string;
    replyToMessageId?: number;
  },
  opts: AuthOpts,
): Promise<ChatMessage> {
  const res = await authedFetch(`/conversations/${conversationId}/messages`, {
    ...opts,
    method: "POST",
    body: {
      content: body.content ?? "",
      messageType: body.messageType ?? "text",
      mediaUrl: body.mediaUrl,
      imageUrl: body.imageUrl,
      clientMessageId: body.clientMessageId,
      replyToMessageId: body.replyToMessageId,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
  return data as ChatMessage;
}

export async function translateMessage(
  messageId: number,
  targetLanguage: string,
  opts: AuthOpts,
): Promise<{ translatedText: string; detectedLanguage?: string } | null> {
  const res = await authedFetch(`/messages/${messageId}/translate`, {
    ...opts,
    method: "POST",
    body: { targetLanguage },
  });
  const data = await readJson(res);
  if (!res.ok) return null;
  if (!data.translatedText) return null;
  return {
    translatedText: String(data.translatedText),
    detectedLanguage: data.detectedLanguage,
  };
}

/** Upload image for chat attachment via existing Wasabi put-proxy flow. */
export async function uploadChatImage(
  localUri: string,
  opts: AuthOpts & { contentType?: string; fileName?: string },
): Promise<string> {
  const contentType = opts.contentType || "image/jpeg";
  const fileName = opts.fileName || "chat.jpg";
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const size = blob.size;
  if (!size) throw new Error("Could not read image");

  const reqRes = await authedFetch("/storage/uploads/request-url", {
    ...opts,
    method: "POST",
    body: { name: fileName, size, contentType },
  });
  const reqData = await readJson(reqRes);
  if (!reqRes.ok) throw new Error(reqData.error || "Upload request failed");
  const uploadURL: string = reqData.uploadURL;
  if (!uploadURL) throw new Error("No upload URL");

  const absolutePut = uploadURL.startsWith("http")
    ? uploadURL
    : `${getApiBase().replace(/\/api$/, "")}${uploadURL}`;

  const putRes = await fetch(absolutePut, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      Authorization: `Bearer ${opts.token}`,
    },
    body: blob,
    signal: opts.signal,
  });
  const putData = await readJson(putRes);
  if (!putRes.ok) throw new Error(putData.error || `Upload failed (${putRes.status})`);
  const url: string = putData.url || "";
  if (!url) throw new Error("Upload succeeded but no URL returned");
  if (url.startsWith("/")) return `https://flexamarket.com${url}`;
  return url;
}

export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
