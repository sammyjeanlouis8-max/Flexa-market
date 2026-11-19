import { Redirect } from "expo-router";

/** WebView `/settings/videos` → native My Videos. */
export default function SettingsVideosRedirect() {
  return <Redirect href="/my-videos" />;
}
