import { Redirect } from "expo-router";

/** WebView `/saved` → native Favorites. */
export default function SavedRedirect() {
  return <Redirect href="/favorites" />;
}
