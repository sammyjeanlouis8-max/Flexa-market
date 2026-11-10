/**
 * Native Support Center + FlexaBot + agent desk APIs.
 * Voice messages are prohibited in support (server + client).
 * Server RBAC is authoritative for staff actions.
 */
import { getApiBase } from "./api";

export type SupportThread = {
  id: number;
  subject: string;
  status?: string;
  priority?: string;
  category?: string;
  ticketRef?: string;
  userId?: number;
  userName?: string | null;
  assignedAdminId?: number | null;
  assignedAdminName?: string | null;
  estimatedResponseLabel?: string | null;
  estimatedResponseMinutes?: number | null;
  relatedOrderId?: number | null;
  rating?: number | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadByUser?: number;
  unreadByAdmin?: number;
  createdAt?: string;
  closedAt?: string | null;
  [key: string]: unknown;
};

export type SupportMessage = {
  id: number;
  threadId?: number;
  senderId?: number;
  content: string;
  messageType?: string;
  mediaUrl?: string | null;
  isAdminReply?: boolean;
  isInternal?: boolean;
  isRead?: boolean;
  createdAt?: string;
  senderName?: string;
  senderRole?: string;
  [key: string]: unknown;
};

export type SupportAvailability = {
  agentsOnline: number;
  agents: { id: number; name: string; avatar?: string | null; role?: string }[];
  pendingTickets?: number;
  estimatedResponse?: {
    label?: string;
    minutesMin?: number;
    minutesMax?: number;
    band?: string;
  };
  avgFirstResponseMin?: number | null;
};

export type SupportAnalytics = {
  total: number;
  open: number;
  pendingFirstResponse?: number;
  activeTickets?: number;
  waitingForCustomer?: number;
  closed?: number;
  resolved?: number;
  overdue?: number;
  closedToday?: number;
  avgResponseMin?: number | null;
  avgFirstResponseMin?: number | null;
  agentsOnline?: number;
  estimatedResponseLabel?: string;
  customerSatisfaction?: { average: number | null; responses: number };
};

export type KnowledgeItem = {
  id?: number;
  slug?: string;
  title: string;
  body: string;
  topics?: string[];
  deepLink?: string | null;
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

export async function fetchSupportThreads(
  opts: AuthOpts & {
    all?: boolean;
    status?: string;
    category?: string;
    q?: string;
    adminId?: string | number;
  },
): Promise<SupportThread[]> {
  const q = new URLSearchParams();
  if (opts.all) q.set("all", "1");
  if (opts.status) q.set("status", opts.status);
  if (opts.category) q.set("category", opts.category);
  if (opts.q) q.set("q", opts.q);
  if (opts.adminId != null) q.set("adminId", String(opts.adminId));
  const qs = q.toString();
  const res = await authedFetch(`/support/threads${qs ? `?${qs}` : ""}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Support threads failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.threads)) return data.threads;
  return [];
}

export async function createSupportThread(
  input: {
    subject: string;
    message: string;
    botHistory?: { role: "bot" | "user"; content: string }[];
  },
  opts: AuthOpts,
): Promise<
  SupportThread & {
    agentsOnline?: number;
    deepLink?: string;
  }
> {
  const res = await authedFetch("/support/threads", {
    ...opts,
    method: "POST",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Create ticket failed (${res.status})`);
  return (data.thread ?? data) as SupportThread & {
    agentsOnline?: number;
    deepLink?: string;
  };
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
    mediaName?: string;
    mediaMime?: string;
    mediaSize?: number;
    isInternal?: boolean;
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
      mediaName: body.mediaName,
      mediaMime: body.mediaMime,
      mediaSize: body.mediaSize,
      isInternal: body.isInternal,
      clientMessageId: body.clientMessageId,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
  return (data.message ?? data) as SupportMessage;
}

export async function closeSupportThread(threadId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/close`, {
    ...opts,
    method: "POST",
    body: {},
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Close failed (${res.status})`);
}

export async function reopenSupportThread(threadId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/reopen`, {
    ...opts,
    method: "POST",
    body: {},
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Reopen failed (${res.status})`);
}

export async function claimSupportThread(
  threadId: number,
  opts: AuthOpts,
): Promise<{ assignedAdminId?: number; assignedAdminName?: string }> {
  const res = await authedFetch(`/support/threads/${threadId}/claim`, {
    ...opts,
    method: "POST",
    body: {},
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Claim failed (${res.status})`);
  return data;
}

export async function releaseSupportThread(threadId: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/release`, {
    ...opts,
    method: "POST",
    body: {},
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Release failed (${res.status})`);
}

export async function assignSupportThread(
  threadId: number,
  adminId: number | null,
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/assign`, {
    ...opts,
    method: "POST",
    body: { adminId },
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Assign failed (${res.status})`);
}

export async function setSupportPriority(
  threadId: number,
  priority: "normal" | "high" | "urgent",
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/priority`, {
    ...opts,
    method: "POST",
    body: { priority },
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Priority failed (${res.status})`);
}

export async function rateSupportThread(
  threadId: number,
  rating: number,
  opts: AuthOpts & { feedback?: string },
): Promise<void> {
  const res = await authedFetch(`/support/threads/${threadId}/rate`, {
    ...opts,
    method: "POST",
    body: { rating, feedback: opts.feedback },
  });
  if (res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Rate failed (${res.status})`);
}

export async function fetchSupportAvailability(opts: AuthOpts): Promise<SupportAvailability> {
  const res = await authedFetch("/support/availability", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Availability failed (${res.status})`);
  return data as SupportAvailability;
}

export async function setMySupportAvailability(
  available: boolean,
  opts: AuthOpts,
): Promise<{ agentsOnline?: number }> {
  const res = await authedFetch("/support/availability", {
    ...opts,
    method: "POST",
    body: { available },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Availability update failed (${res.status})`);
  return data;
}

export async function lookupSupportTicketByRef(
  ref: string,
  opts: AuthOpts,
): Promise<{ id: number; ticketRef: string; deepLink?: string }> {
  const res = await authedFetch(`/support/tickets/by-ref/${encodeURIComponent(ref)}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
  return data;
}

export async function fetchSupportCustomer(
  threadId: number,
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch(`/support/threads/${threadId}/customer`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Customer context failed (${res.status})`);
  return data;
}

export async function fetchSupportAnalytics(opts: AuthOpts): Promise<SupportAnalytics> {
  const res = await authedFetch("/admin/support/analytics", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Analytics failed (${res.status})`);
  return data as SupportAnalytics;
}

export async function fetchSupportKnowledge(
  opts: AuthOpts & { q?: string },
): Promise<KnowledgeItem[]> {
  const q = opts.q ? `?q=${encodeURIComponent(opts.q)}` : "";
  const res = await authedFetch(`/support/knowledge${q}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Knowledge failed (${res.status})`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.knowledge)) return data.knowledge;
  return [];
}

export async function fetchSupportUnreadCount(opts: AuthOpts): Promise<number> {
  const res = await authedFetch("/support/unread-count", opts);
  const data = await readJson(res);
  if (!res.ok) return 0;
  return Number(data.count ?? 0);
}

export type ChatbotReply = {
  content?: string;
  reply?: string;
  message?: string;
  intent?: string;
  deepLinks?: { label?: string; href?: string; path?: string }[];
  escalateSuggested?: boolean;
  verified?: boolean;
  [key: string]: unknown;
};

export async function sendChatbotMessage(
  messages: { role: string; content: string }[],
  opts: AuthOpts & { preferredLang?: string },
): Promise<ChatbotReply> {
  const res = await authedFetch("/chatbot/message", {
    ...opts,
    method: "POST",
    body: { messages, preferredLang: opts.preferredLang },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `FlexaBot failed (${res.status})`);
  return data as ChatbotReply;
}

export async function fetchChatbotStatus(): Promise<{ configured?: boolean; mode?: string }> {
  const res = await fetch(`${getApiBase()}/chatbot/status`, {
    headers: { Accept: "application/json" },
  });
  const data = await readJson(res);
  if (!res.ok) return {};
  return data;
}
