import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INTERNAL_HOSTS = [
  "flexamarket.com",
  "www.flexamarket.com",
  "bonjour-tool.replit.app",
];

function isInternal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return INTERNAL_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return true;
  }
}

interface IOSRedirectProps {
  icon: string;
  title: string;
  body: string;
  buttonText: string;
  url: string;
  note?: string;
}

interface SafeWebViewProps {
  uri: string;
  iosRedirect?: IOSRedirectProps;
}

function IOSRedirectScreen({ icon, title, body, buttonText, url, note }: IOSRedirectProps) {
  const [status, setStatus] = useState<"idle" | "opening" | "returned">("idle");

  async function handleOpen() {
    setStatus("opening");
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: "#F97316",
      dismissButtonStyle: "done",
    });
    setStatus("returned");
  }

  return (
    <View style={styles.iosContainer}>
      <Text style={styles.iosIcon}>{icon}</Text>
      <Text style={styles.iosTitle}>{title}</Text>

      {status === "returned" ? (
        <>
          <View style={styles.successBadge}>
            <Text style={styles.successText}>✓ Browser closed</Text>
          </View>
          <Text style={styles.iosBody}>
            If you completed your payment, your account will be updated shortly.
          </Text>
          <Pressable style={styles.iosButton} onPress={handleOpen}>
            <Text style={styles.iosButtonText}>Reopen to Check</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.iosBody}>{body}</Text>
          <Pressable
            style={[styles.iosButton, status === "opening" && styles.iosButtonDisabled]}
            onPress={handleOpen}
            disabled={status === "opening"}
          >
            {status === "opening" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.iosButtonText}>{buttonText}</Text>
            )}
          </Pressable>
          {note ? <Text style={styles.iosNote}>{note}</Text> : null}
          <Text style={styles.iosReturnNote}>
            After paying, tap "Done" in the browser to return to the app.
          </Text>
        </>
      )}
    </View>
  );
}

export default function SafeWebView({ uri, iosRedirect }: SafeWebViewProps) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === "ios" && iosRedirect) {
    return <IOSRedirectScreen {...iosRedirect} />;
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        contentInsetAdjustmentBehavior="automatic"
        userAgent="FlexaMarket/1.0 (Mobile App)"
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url;
          if (isInternal(url)) return true;
          Linking.openURL(url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  iosContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  iosIcon: { fontSize: 64, marginBottom: 20 },
  iosTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 16,
    textAlign: "center",
  },
  iosBody: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  iosButton: {
    backgroundColor: "#F97316",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
    minWidth: 220,
    alignItems: "center",
  },
  iosButtonDisabled: {
    opacity: 0.7,
  },
  iosButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  iosNote: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  iosReturnNote: {
    fontSize: 12,
    color: "#CBD5E1",
    textAlign: "center",
    lineHeight: 18,
    fontStyle: "italic",
    marginTop: 4,
  },
  successBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  successText: {
    color: "#16A34A",
    fontSize: 14,
    fontWeight: "600",
  },
});
