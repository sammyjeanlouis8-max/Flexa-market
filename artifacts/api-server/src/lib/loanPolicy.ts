const IOS_APP_UA = "FlexaMarketiOS/";
const ANDROID_APP_UA = "FlexaMarketAndroid/";

/** App markers are deliberately exact product markers, not generic mobile UA detection. */
export function loanAccessPolicy(country: string | null | undefined, userAgent: string | undefined): boolean {
  const ua = userAgent ?? "";
  if (ua.includes(IOS_APP_UA)) return false;
  if (ua.includes(ANDROID_APP_UA)) return country === "Haiti";
  return country === "Haiti" || country === "Dominican Republic";
}