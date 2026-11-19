/**
 * Flexa eSIM — OUT OF SCOPE for this Android native phase.
 * Disabled via menus and direct links: always redirect home.
 */
import { Redirect } from "expo-router";

export default function EsimDisabled() {
  return <Redirect href="/" />;
}
