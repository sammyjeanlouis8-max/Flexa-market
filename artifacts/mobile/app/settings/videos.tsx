import { Redirect } from "expo-router";

/** WebView `/settings/videos` → native promotional / my videos feed. */
export default function SettingsVideosRedirect() {
  return <Redirect href="/videos" />;
}
