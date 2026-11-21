/**
 * Expo-web stand-in for MarketplaceWebView: embeds the live website so hybrid
 * Home / Inbox / PDP can be reviewed in the same viewport as native captures.
 * Android/iOS still use react-native-webview via MarketplaceWebView.
 */
import React, { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

const WEB_ORIGIN = "https://flexamarket.com";

type Props = {
  path: string;
};

export default function WebHybridFrame({ path }: Props) {
  const { token } = useAuth();
  const src = useMemo(() => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(normalized, WEB_ORIGIN);
    if (token) url.searchParams.set("nativeToken", token);
    return url.toString();
  }, [path, token]);

  if (Platform.OS !== "web") return null;

  return (
    <View style={styles.root}>
      <iframe
        title="Flexa Market"
        src={src}
        style={{
          border: "none",
          width: "100%",
          height: "100%",
          background: "#F8FAFC",
        }}
        onLoad={(e: any) => {
          try {
            const win = e?.target?.contentWindow;
            if (!win || !token) return;
            win.postMessage(
              JSON.stringify({ type: "FLEXA_TOKEN", token }),
              WEB_ORIGIN,
            );
          } catch {
            /* cross-origin — rely on cookie/session or query */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
});
