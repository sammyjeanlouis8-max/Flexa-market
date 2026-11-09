/**
 * Native Support Center + FlexaBot APIs.
 * Voice messages are prohibited in support (server + client).
 */
import { getApiBase } from "./api";

export type SupportThread = {
  id: number;
  subject: string;
  status?: string;
  priority?: string;
  ticketRef?: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  [key: string]: unknown;
};

export type SupportMessage = {
  id: number;
  threadId?: number;
  senderId?: number;
  content: string;
  messageType?: string;
  mediaUrl?: string | null;
  isInternal?: boolean;
  createdAt?: string;
  senderName?: string;
  [key: string]: unknown;
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

export async function fetchSupportThreads(opts: AuthOpts): Promise<SupportThread[]> {
  const res = await authedFetch("/support/threads", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Support threads failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.threads)) return data.threads;
  return [];
}

export async function createSupportThread(
  input: { subject: string; message: string; botHistory?: { role: "bot" | "user"; content: string }[] },
  opts: AuthOpts,
): Promise<SupportThread> {
  const res = await authedFetch("/support/threads", {
    ...opts,
    method: "POST",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Create ticket failed (${res.status})`);
  return (data.thread ?? data) as SupportThread;
}

export async function fetchSupportThread(
  id: number,
  opts: AuthOpts,
): Promise<{ thread: SupportThread; messages: SupportMessage[] }> {
  const res = await authedFetch(`/support/threads/${id}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Ticket failed (${res.status})`);
  return {
    thread: (data.thread ?? data) as SupportThread,
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

export async function sendSupportMessage(
  threadId: number,
  body: {
    content?: string;
    messageType?: "text" | "image" | "video" | "document";
    mediaUrl?: string;
    clientMessageId?: string;
  },
  opts: AuthOpts,
): Promise<SupportMessage> {
  if (body.messageType === ("audio" as any) || body.messageType === ("voice" as any)) {
    throw new Error("Voice messages are not supported in support chat");
  }
  const res = await authedFetch(`/support/threads/${threadId}/messages`, {
    ...opts,
    method: "POST",
    body: {
      content: body.content ?? "",
      messageType: body.messageType ?? "text",
      mediaUrl: body.mediaUrl,
      clientMessageId: body.clientMessageId,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
  return (data.message ?? data) as SupportMessage;
}

export async function rateSupportThread(
  threadId: number,
  rating: number,
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/rate`, {
    ...opts,
    method: "POST",
    body: { rating },
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Rate failed (${res.status})`);
}

export async function sendChatbotMessage(
  messages: { role: string; content: string }[],
  opts: AuthOpts & { preferredLang?: string },
): Promise<{ reply?: string; message?: string; [key: string]: unknown }> {
  const res = await authedFetch("/chatbot/message", {
    ...opts,
    method: "POST",
    body: { messages, preferredLang: opts.preferredLang },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `FlexaBot failed (${res.status})`);
  return data;
}
