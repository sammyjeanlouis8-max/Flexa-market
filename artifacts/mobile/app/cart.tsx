import { Redirect } from "expo-router";

/** Stack alias → bottom-tab Cart (web bottom nav parity). */
export default function CartRedirect() {
  return <Redirect href="/(tabs)/cart" />;
}
