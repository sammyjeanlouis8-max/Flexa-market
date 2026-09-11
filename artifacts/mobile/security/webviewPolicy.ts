export const ANDROID_UA_SUFFIX = "FlexaMarketAndroid/1.0";

export type WebRoute = "flexa" | "stripe" | "external" | "blocked";

const FLEXA_HOST = "flexamarket.com";

export function isTrustedFlexaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === FLEXA_HOST || parsed.hostname.endsWith(`.${FLEXA_HOST}`))
    );
  } catch {
    return false;
  }
}

export function isTrustedStripeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "stripe.com" ||
        parsed.hostname.endsWith(".stripe.com") ||
        parsed.hostname === "stripe.network" ||
        parsed.hostname.endsWith(".stripe.network"))
    );
  } catch {
    return false;
  }
}

export function classifyWebUrl(url: string): WebRoute {
  if (isTrustedFlexaUrl(url)) return "flexa";
  if (isTrustedStripeUrl(url)) return "stripe";
  try {
    const { protocol } = new URL(url);
    if (protocol === "tel:" || protocol === "mailto:") return "external";
  } catch {
    // Invalid and relative URLs must never escape into a browser or WebView.
  }
  return "blocked";
}

export function platformBridgeScript(platform: string): string {
  const value = platform === "android" ? "android" : "ios";
  return `(function(){try{if(location.protocol==="https:"&&(location.hostname==="flexamarket.com"||location.hostname.endsWith(".flexamarket.com"))){window.__flexaPlatform=${JSON.stringify(value)};}}catch(e){}})();true;`;
}