declare global {
  interface Window {
    __flexaPlatform?: string;
    __iosWebView?: boolean;
  }
}

export function isLoanAllowed(country: string | null | undefined): boolean {
  if (typeof window !== "undefined") {
    if (window.__iosWebView || window.__flexaPlatform === "ios") return false;
    if (window.__flexaPlatform === "android") return country === "Haiti";
  }
  return country === "Haiti" || country === "Dominican Republic";
}