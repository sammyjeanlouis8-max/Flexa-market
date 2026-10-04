import { isTrustedMonCashUrl } from "./webviewPolicy.ts";

export type HostedPaymentRoute = "payment" | "verify" | "return" | "blocked";

/** A return only closes payment UI; it never authorizes a wallet credit. */
export function classifyHostedPaymentUrl(raw: string): HostedPaymentRoute {
  if (isTrustedMonCashUrl(raw)) return "payment";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "flexamarket.com" ||
        url.username || url.password || (url.port && url.port !== "443")) return "blocked";
    if (["/api/bazik/return", "/api/moncash/return"].includes(url.pathname)) return "verify";
    if (url.pathname !== "/" && url.pathname !== "/wallet") return "blocked";
    const topup = url.searchParams.get("wallet_topup");
    const moncash = url.searchParams.get("moncash");
    if ((topup && ["paid", "already_processed"].includes(topup)) ||
        (moncash && ["cancelled", "error", "pending", "amount_mismatch", "success"].includes(moncash))) {
      return "return";
    }
  } catch {
    // Invalid URLs and unsupported schemes must not launch another app.
  }
  return "blocked";
}