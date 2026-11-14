import { Redirect } from "expo-router";

/** WebView `/booster` → native Boost Video flow. */
export default function BoosterRedirect() {
  return <Redirect href="/boost-video" />;
}
