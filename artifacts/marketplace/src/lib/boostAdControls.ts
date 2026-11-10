/**
 * Pure helpers for the interstitial boost ad player controls.
 * Keeps CTA / skip label selection and Home promo strip selection testable
 * without mounting the React overlay.
 */

export type BoostCtaType =
  | "message"
  | "whatsapp"
  | "link"
  | "buy_now"
  | "none"
  | string
  | null
  | undefined;

export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/** Resolve the short in-player CTA pill label (no product title banner). */
export function resolveBoostAdCtaLabel(opts: {
  ctaType: BoostCtaType;
  customText?: string | null;
  t: TranslateFn;
}): string {
  const custom = opts.customText?.trim();
  if (custom) return custom;

  switch (opts.ctaType) {
    case "message":
      return opts.t("boostAd.messageOnFlexa", {
        defaultValue: opts.t("booster.cta.message", {
          defaultValue: "Message on Flexa",
        }),
      });
    case "whatsapp":
      return opts.t("boostAd.chatWhatsApp", { defaultValue: "Chat on WhatsApp" });
    case "link":
      return opts.t("boostAd.visitLink", { defaultValue: "Visit" });
    case "buy_now":
      return opts.t("buttons.buyNow", { defaultValue: "Buy Now" });
    default:
      return opts.t("boostAd.viewListing", { defaultValue: "View listing" });
  }
}

/** Skip-ready label (visible + aria). */
export function resolveBoostAdSkipLabel(t: TranslateFn): string {
  return t("boostAd.skipAd", {
    defaultValue: t("boostAd.skip", { defaultValue: "Skip Ad" }),
  });
}

/**
 * Countdown label with i18next pluralization (`count`) and English fallbacks.
 * Prefer `boostAd.skipInSeconds` / `_one` / `_other`; fall back to legacy keys.
 */
export function resolveBoostAdSkipInLabel(
  t: TranslateFn,
  seconds: number,
): string {
  const count = Math.max(0, Math.floor(seconds));
  const plural = t("boostAd.skipInSeconds", {
    count,
    seconds: count,
    defaultValue: "",
  });
  if (plural && plural !== "boostAd.skipInSeconds") return plural;

  const labeled = t("boostAd.skipInLabel", {
    count,
    seconds: count,
    defaultValue: "",
  });
  if (labeled && labeled !== "boostAd.skipInLabel") return labeled;

  const legacy = t("boostAd.skipIn", {
    count,
    seconds: count,
    defaultValue: "",
  });
  if (legacy && legacy !== "boostAd.skipIn") return legacy;

  return count === 1 ? `Skip in ${count} s` : `Skip in ${count} s`;
}

export type HomePromoCandidate = {
  id: number;
  boostEndAt?: string | null;
  createdAt?: string | null;
  boostStartAt?: string | null;
};

/** Live (non-expired) promos, newest first, capped at `limit` (default 2). */
export function selectHomePromoVideos<T extends HomePromoCandidate>(
  videos: T[],
  limit = 2,
  nowMs: number = Date.now(),
): T[] {
  const live = videos.filter((v) => {
    if (!v.boostEndAt) return true;
    const end = new Date(v.boostEndAt).getTime();
    return Number.isFinite(end) ? end > nowMs : true;
  });

  const rank = (v: T): number => {
    const start = v.boostStartAt ? new Date(v.boostStartAt).getTime() : NaN;
    const created = v.createdAt ? new Date(v.createdAt).getTime() : NaN;
    if (Number.isFinite(start)) return start;
    if (Number.isFinite(created)) return created;
    return v.id;
  };

  return [...live]
    .sort((a, b) => rank(b) - rank(a) || b.id - a.id)
    .slice(0, Math.max(0, limit));
}
