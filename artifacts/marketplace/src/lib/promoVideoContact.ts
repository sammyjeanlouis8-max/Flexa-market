/**
 * Shared helpers for promotional-video contact (WhatsApp + Flexa chat drafts)
 * and stable public watch URLs.
 */

export const FLEXA_PUBLIC_ORIGIN = "https://flexamarket.com";

/** Production-stable watch URL for a promotional / boosted video listing. */
export function getPublicPromoVideoUrl(videoId: number, origin?: string): string {
  const base = (origin && /^https?:\/\//i.test(origin) ? origin : FLEXA_PUBLIC_ORIGIN)
    .replace(/\/$/, "");
  // Prefer production domain in outbound contact messages so recipients open
  // the live ad even when the sender is on a preview / localhost host.
  const publicBase = base.includes("localhost") || base.includes("127.0.0.1")
    ? FLEXA_PUBLIC_ORIGIN
    : base;
  return `${publicBase}/videos/watch?video=${videoId}`;
}

export function buildPromoWhatsAppMessage(opts: {
  videoId: number;
  title?: string | null;
  origin?: string;
}): string {
  const link = getPublicPromoVideoUrl(opts.videoId, opts.origin);
  const title = (opts.title ?? "").trim();
  const lines = [
    "Hello, I am interested in this advertisement on Flexa Market.",
    "",
  ];
  if (title) lines.push(`Video: ${title}`);
  lines.push(`Link: ${link}`);
  return lines.join("\n");
}

export function buildPromoChatDraft(opts: {
  videoId: number;
  title?: string | null;
  origin?: string;
}): string {
  const link = getPublicPromoVideoUrl(opts.videoId, opts.origin);
  const title = (opts.title ?? "").trim();
  const lines = [
    "Hello, I am interested in this advertisement on Flexa Market.",
    "",
  ];
  if (title) lines.push(`Video: ${title}`);
  lines.push(`Link: ${link}`);
  return lines.join("\n");
}

export type PromoChatDraftPayload = {
  text: string;
  videoId: number;
  videoTitle: string;
  videoUrl: string;
  thumbnailUrl: string | null;
};

export function promoChatDraftKey(conversationId: number): string {
  return `fm_promo_chat_draft_${conversationId}`;
}

export function storePromoChatDraft(conversationId: number, payload: PromoChatDraftPayload): void {
  try {
    sessionStorage.setItem(promoChatDraftKey(conversationId), JSON.stringify(payload));
  } catch { /* ignore */ }
}

export function readPromoChatDraft(conversationId: number): PromoChatDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(promoChatDraftKey(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PromoChatDraftPayload;
    if (!parsed?.text || !parsed?.videoId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPromoChatDraft(conversationId: number): void {
  try {
    sessionStorage.removeItem(promoChatDraftKey(conversationId));
  } catch { /* ignore */ }
}

export function openWhatsAppWithPromoVideo(opts: {
  phone: string;
  videoId: number;
  title?: string | null;
  origin?: string;
}): void {
  const digits = opts.phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return;
  const msg = encodeURIComponent(
    buildPromoWhatsAppMessage({
      videoId: opts.videoId,
      title: opts.title,
      origin: opts.origin,
    }),
  );
  window.open(`https://wa.me/${digits}?text=${msg}`, "_blank", "noopener,noreferrer");
}
