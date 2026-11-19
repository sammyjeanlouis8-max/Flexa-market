import { Redirect, useLocalSearchParams } from "expo-router";

/** WebView `/profile/:id` (shop / reviews) → native shop screen. */
export default function ProfileIdRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/shop/${id}`} />;
}
