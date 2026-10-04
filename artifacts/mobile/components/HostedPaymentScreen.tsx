import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import Colors from "../constants/colors";
import { classifyHostedPaymentUrl } from "../security/hostedPaymentPolicy";

const palette = Colors.light;
const RECOVERY_MESSAGE = "Paj peman an pa chaje. Peze Retounen pou verifye bous ou. Pa repete yon peman ou deja valide.";

/** Provider-only view: no message bridge, injected scripts, or auth headers. */
export function HostedPaymentScreen({ url, onClose }: { url: string; onClose: () => void }) {
  const paymentRef = useRef<WebView>(null);
  const finishedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  // Stable source across loading/error renders: never reload a submitted form.
  const source = useMemo(() => ({ uri: popupUrl ?? url }), [popupUrl, url]);
  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimer();
    paymentRef.current?.stopLoading();
    onClose();
  }, [clearTimer, onClose]);

  const fail = useCallback((message = RECOVERY_MESSAGE) => {
    if (finishedRef.current) return;
    clearTimer();
    setLoading(false);
    setProblem(message);
  }, [clearTimer]);

  const startLoading = useCallback(() => {
    if (finishedRef.current) return;
    clearTimer();
    setLoading(true);
    setProblem(null);
    timerRef.current = setTimeout(() => {
      // The provider may have accepted a submission. No automatic retry.
      fail();
    }, 45_000);
  }, [clearTimer, fail]);

  return (
    <Modal visible animationType="slide" onRequestClose={finish} testID="moncash-payment-modal">
      <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="Retounen nan Flexa"
            testID="moncash-payment-back" style={styles.back}>
            <Text style={styles.backText}>‹ Retounen</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>Peman MonCash</Text>
          <View style={styles.progress}>{loading && <ActivityIndicator color={palette.accent} />}</View>
        </View>
        <Text style={[styles.notice, problem && styles.problem]} accessibilityLiveRegion="polite">
          {problem ?? "PIN lan antre sèlman sou paj ofisyèl MonCash la."}
        </Text>
        {classifyHostedPaymentUrl(url) === "payment" ? (
          <WebView
            ref={paymentRef}
            testID="moncash-payment-webview"
            style={styles.webview}
            source={source}
            javaScriptEnabled
            domStorageEnabled
            // Android incognito clears the global cookie jar, including Flexa.
            // Keep origin isolation without erasing the authenticated wallet.
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            cacheEnabled={false}
            cacheMode="LOAD_NO_CACHE"
            mixedContentMode="never"
            // "*" prevents the library's automatic Linking.openURL fallback;
            // every scheme is explicitly accepted/rejected by the policy below.
            originWhitelist={["*"]}
            // Popups/forms stay in this unprivileged provider view, not a browser.
            setSupportMultipleWindows={false}
            allowsLinkPreview={false}
            onShouldStartLoadWithRequest={(request) => {
              const route = classifyHostedPaymentUrl(request.url);
              if (route === "return") { finish(); return false; }
              if (route === "payment" || route === "verify") return true;
              fail("Lyen sa a pa otorize nan peman an. Peze Retounen pou verifye bous ou.");
              return false;
            }}
            onOpenWindow={(event) => {
              const target = event.nativeEvent.targetUrl;
              const route = classifyHostedPaymentUrl(target);
              if (route === "return") finish();
              else if (route === "payment" || route === "verify") setPopupUrl(target);
              else fail("Lyen sa a pa otorize nan peman an. Peze Retounen.");
            }}
            onNavigationStateChange={(state) => {
              if (state.url === "about:blank") return;
              const route = classifyHostedPaymentUrl(state.url);
              if (route === "return") finish();
              else if (route === "blocked") {
                paymentRef.current?.stopLoading();
                fail("Lyen sa a pa otorize nan peman an. Peze Retounen.");
              }
            }}
            onLoadStart={startLoading}
            onLoadEnd={() => { clearTimer(); setLoading(false); }}
            onError={() => fail()}
            onHttpError={() => fail()}
            onRenderProcessGone={() => fail()}
            renderError={() => <View style={styles.webview} />}
          />
        ) : <Text style={[styles.notice, styles.problem]}>Lyen peman sa a pa otorize. Peze Retounen.</Text>}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.card },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  back: { minHeight: 48, minWidth: 94, justifyContent: "center", paddingHorizontal: 12 },
  backText: { color: palette.accent, fontSize: 15, fontWeight: "600" },
  title: { flex: 1, textAlign: "center", color: palette.text, fontSize: 17, fontWeight: "600" },
  progress: { width: 94, alignItems: "flex-end", paddingRight: 16 },
  notice: { color: palette.mutedForeground, fontSize: 12, textAlign: "center", paddingHorizontal: 16, paddingVertical: 10 },
  problem: { color: palette.destructive },
  webview: { flex: 1, backgroundColor: palette.card },
});