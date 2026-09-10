type ChatDate = string | number | null | undefined;
type Translate = (key: string) => string;

function parseDate(value: ChatDate): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localeFor(language: string): string {
  return language.toLowerCase().startsWith("ht") ? "fr-FR" : language;
}

// A calendar-day ordinal, not elapsed 24-hour periods: DST days may have
// 23 or 25 hours. Group by the reader's local date, never by UTC midnight.
export function chatDayKey(value: ChatDate): number | null {
  const date = parseDate(value);
  return date ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000 : null;
}

export function formatChatTime(value: ChatDate, language: string): string {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
}

export function formatChatDay(value: ChatDate, language: string, t: Translate, now = Date.now()): string {
  const date = parseDate(value);
  if (!date) return "";
  const difference = chatDayKey(now)! - chatDayKey(value)!;
  if (difference === 0) return t("messages.timeToday");
  if (difference === 1) return t("messages.timeYesterday");
  return new Intl.DateTimeFormat(localeFor(language), {
    day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

type SentMessage = { id: number; senderId: number; createdAt: string };
type QueuedMessage = { id: string; createdAt: number };

export type ChatTimelineEntry<M extends SentMessage, P extends QueuedMessage> =
  | { kind: "message"; key: string; item: M; createdAt: string; day: number | null }
  | { kind: "pending"; key: string; item: P; createdAt: number; day: number | null };

export function buildChatTimeline<M extends SentMessage, P extends QueuedMessage>(
  messages: readonly M[], pending: readonly P[],
): ChatTimelineEntry<M, P>[] {
  const entries: ChatTimelineEntry<M, P>[] = [
    ...messages.map(item => ({
      kind: "message" as const, key: `message-${item.id}`, item,
      createdAt: item.createdAt, day: chatDayKey(item.createdAt),
    })),
    ...pending.map(item => ({
      kind: "pending" as const, key: item.id, item,
      createdAt: item.createdAt, day: chatDayKey(item.createdAt),
    })),
  ];
  // Keep failed older voice notes on their actual day, rather than appending
  // them beneath newer replies with an incorrect date heading.
  return entries.sort((a, b) =>
    (parseDate(a.createdAt)?.getTime() ?? Infinity) -
    (parseDate(b.createdAt)?.getTime() ?? Infinity),
  );
}

export function sameChatGroup<M extends SentMessage, P extends QueuedMessage>(
  first: ChatTimelineEntry<M, P> | undefined,
  second: ChatTimelineEntry<M, P> | undefined,
  currentUserId: number,
): boolean {
  if (!first || !second || first.day == null || first.day !== second.day) return false;
  const sender = (entry: ChatTimelineEntry<M, P>) =>
    entry.kind === "pending" ? currentUserId : Number(entry.item.senderId);
  const firstTime = parseDate(first.createdAt)!.getTime();
  const secondTime = parseDate(second.createdAt)!.getTime();
  return sender(first) === sender(second) && Math.abs(secondTime - firstTime) <= 5 * 60_000;
}