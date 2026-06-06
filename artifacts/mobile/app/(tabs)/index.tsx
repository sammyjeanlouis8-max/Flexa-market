import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import WebView from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePushNotifications } from "../../hooks/usePushNotifications";

const WEBSITE = "https://flexamarket.com";

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

// Max file size we can safely pass through the postMessage bridge (40 MB)
const MAX_BRIDGE_BYTES = 40 * 1024 * 1024;

/**
 * Injected into the WebView on iOS to intercept <input type="file" accept="video*">
 * clicks before they open the native iOS file picker (which silently drops
 * camera-recorded videos in WKWebView).  Instead we post a message to React Native,
 * let it open expo-image-picker, and receive the video back as base64 via
 * window.__flexaReceiveVideo().
 *
 * On Android the WebView file picker works correctly, so we skip the intercept.
 */
function buildVideoInterceptorScript(isIOS: boolean): string {
  if (!isIOS) return "true;";
  return `
(function() {
  if (window.__flexaVideoInterceptInit) return;
  window.__flexaVideoInterceptInit = true;

  var _pendingInput = null;

  function _isVideoInput(el) {
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return false;
    return /video/i.test(el.accept || '');
  }

  function _intercept(el) {
    if (!el || el.__flexaIntercepted) return;
    if (!_isVideoInput(el)) return;
    el.__flexaIntercepted = true;
    el.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      _pendingInput = el;
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'PICK_VIDEO' })
      );
    }, true);
  }

  // Intercept inputs already in the DOM
  document.querySelectorAll('input[type="file"]').forEach(_intercept);

  // Intercept future inputs added by the SPA router
  new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'INPUT') _intercept(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('input[type="file"]').forEach(_intercept);
        }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Intercept programmatic .click() calls (e.g. videoFileInputRef.current?.click())
  var _origClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function() {
    if (_isVideoInput(this) && window.ReactNativeWebView) {
      _pendingInput = this;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PICK_VIDEO' }));
      return;
    }
    _origClick.call(this);
  };

  // Called by React Native with the base64-encoded video to inject into the input
  window.__flexaReceiveVideo = function(b64, mimeType, fileName) {
    var inp = _pendingInput;
    _pendingInput = null;
    if (!inp) return;
    try {
      var byteStr = atob(b64);
      var bytes = new Uint8Array(byteStr.length);
      for (var i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      var blob = new Blob([bytes], { type: mimeType });
      var file = new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
      var dt = new DataTransfer();
      dt.items.add(file);
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(err) {
      console.error('[FlexaVideo] inject error', err);
    }
  };

  // Called when RN encounters an error or cancellation
  window.__flexaVideoCancel = function() {
    _pendingInput = null;
  };

  true;
})();
  `.trim();
}

type PermStatus = "checking" | "granted" | "denied" | "undetermined";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<any>(null);
  const [navState, setNavState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [offline, setOffline] = useState(false);
  const [permStatus, setPermStatus] = useState<PermStatus>("checking");

  const injectJs = useCallback((script: string) => {
    webRef.current?.injectJavaScript(script);
  }, []);

  usePushNotifications(injectJs);

  const canGoBack = navState?.canGoBack ?? false;

  useEffect(() => {
    checkAndRequestPermission();
  }, []);

  async function checkAndRequestPermission() {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") { setPermStatus("granted"); return; }
    if (status === "undetermined") {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      setPermStatus(newStatus === "granted" ? "granted" : "denied");
    } else {
      setPermStatus("denied");
    }
  }

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // ── Native video picker bridge (iOS only) ──────────────────────────────────

  const cancelVideoPick = useCallback(() => {
    webRef.current?.injectJavaScript("window.__flexaVideoCancel && window.__flexaVideoCancel(); true;");
  }, []);

  const deliverVideoToWebView = useCallback(async (uri: string) => {
    try {
      // Check size before reading
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      const fileSize = (info as any).size ?? 0;

      if (fileSize > MAX_BRIDGE_BYTES) {
        webRef.current?.injectJavaScript(`
          window.__flexaVideoCancel && window.__flexaVideoCancel();
          alert('Vidéo a twò gwo (limite: 40 MB). Tanpri chwazi yon vidéo pi kout oswa konprese l dabò.');
          true;
        `);
        return;
      }

      const ext = (uri.split(".").pop() ?? "mp4").toLowerCase().split("?")[0];
      const mimeType =
        ext === "mov" ? "video/quicktime" :
        ext === "webm" ? "video/webm" : "video/mp4";
      const fileName = `video_${Date.now()}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Inject in chunks to stay well under WKWebView script-size limits
      const CHUNK = 256 * 1024; // 256 KB per chunk
      const chunks = [];
      for (let i = 0; i < base64.length; i += CHUNK) {
        chunks.push(base64.slice(i, i + CHUNK));
      }

      webRef.current?.injectJavaScript("window.__flexaB64=[];true;");
      for (const chunk of chunks) {
        webRef.current?.injectJavaScript(
          `window.__flexaB64.push(${JSON.stringify(chunk)});true;`
        );
      }
      webRef.current?.injectJavaScript(
        `window.__flexaReceiveVideo(window.__flexaB64.join(''),${JSON.stringify(mimeType)},${JSON.stringify(fileName)});window.__flexaB64=null;true;`
      );
    } catch (err) {
      console.error("[FlexaVideo] deliverVideoToWebView error:", err);
      cancelVideoPick();
    }
  }, [cancelVideoPick]);

  const pickVideoFromCamera = useCallback(async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) { cancelVideoPick(); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "videos",
      videoMaxDuration: 180,
    });
    if (result.canceled || !result.assets?.[0]?.uri) { cancelVideoPick(); return; }
    await deliverVideoToWebView(result.assets[0].uri);
  }, [cancelVideoPick, deliverVideoToWebView]);

  const pickVideoFromLibrary = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { cancelVideoPick(); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "videos",
      videoMaxDuration: 180,
    });
    if (result.canceled || !result.assets?.[0]?.uri) { cancelVideoPick(); return; }
    await deliverVideoToWebView(result.assets[0].uri);
  }, [cancelVideoPick, deliverVideoToWebView]);

  const handleNativeVideoPick = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Anile", "Anrejistre yon Vidéo", "Chwazi nan Galeri"],
          cancelButtonIndex: 0,
          title: "Ajoute Vidéo",
        },
        (idx) => {
          if (idx === 1) pickVideoFromCamera();
          else if (idx === 2) pickVideoFromLibrary();
          else cancelVideoPick();
        }
      );
    } else {
      // Android WebView handles file inputs natively; this path is not reached
      pickVideoFromLibrary();
    }
  }, [pickVideoFromCamera, pickVideoFromLibrary, cancelVideoPick]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "PICK_VIDEO") {
        handleNativeVideoPick();
        return;
      }
    } catch {
      // Not our message — ignore
    }
  }, [handleNativeVideoPick]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (permStatus === "checking") {
    return (
      <View style={[styles.center, { backgroundColor: "#0F172A", paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (permStatus === "denied") {
    return (
      <View style={[styles.center, { backgroundColor: "#0F172A", paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.logoBox, { backgroundColor: "#F97316" }]}>
          <Text style={styles.logoText}>FM</Text>
        </View>
        <Text style={styles.gateTitle}>Aktive Notifikasyon</Text>
        <Text style={styles.gateSub}>
          FlexaMarket itilize notifikasyon pou voye mesaj, lòd, ak alèt enpòtan ba ou.{"\n\n"}
          Notifikasyon yo obligatwa pou itilize app la.
        </Text>
        <View style={styles.iconRow}>
          <View style={styles.iconItem}>
            <Text style={styles.iconEmoji}>💬</Text>
            <Text style={styles.iconLabel}>Mesaj</Text>
          </View>
          <View style={styles.iconItem}>
            <Text style={styles.iconEmoji}>📦</Text>
            <Text style={styles.iconLabel}>Lòd</Text>
          </View>
          <View style={styles.iconItem}>
            <Text style={styles.iconEmoji}>💰</Text>
            <Text style={styles.iconLabel}>Peman</Text>
          </View>
        </View>
        <Pressable
          style={[styles.settingsBtn, { backgroundColor: "#F97316" }]}
          onPress={() => Linking.openSettings()}
        >
          <Feather name="settings" size={18} color="#fff" />
          <Text style={styles.settingsBtnText}>Ouvri Paramèt</Text>
        </Pressable>
        <Pressable
          style={styles.recheckBtn}
          onPress={async () => {
            setPermStatus("checking");
            const { status } = await Notifications.getPermissionsAsync();
            setPermStatus(status === "granted" ? "granted" : "denied");
          }}
        >
          <Text style={styles.recheckText}>M aktive li — kontinye</Text>
        </Pressable>
      </View>
    );
  }

  if (offline) {
    return (
      <View style={[styles.center, { backgroundColor: "#0F172A" }]}>
        <Text style={{ fontSize: 56 }}>📡</Text>
        <Text style={[styles.offlineTitle, { color: "#fff" }]}>Pa gen entènèt</Text>
        <Text style={[styles.offlineSub, { color: "#94a3b8" }]}>Verifye koneksyon ou epi eseye ankò.</Text>
        <Pressable
          style={[styles.retryBtn, { backgroundColor: "#F97316" }]}
          onPress={() => { setOffline(false); setLoading(true); webRef.current?.reload(); }}
        >
          <Feather name="refresh-cw" size={16} color="#fff" />
          <Text style={styles.retryText}>Eseye Ankò</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={[styles.progressTrack, { top: insets.top }]}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        overScrollMode="never"
        onNavigationStateChange={setNavState}
        onLoadStart={() => { setLoading(true); setOffline(false); }}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }: any) => setProgress(nativeEvent.progress)}
        onError={() => { setOffline(true); setLoading(false); }}
        onHttpError={({ nativeEvent }: any) => { if (nativeEvent.statusCode >= 500) setOffline(true); }}
        userAgent="FlexaMarket/1.0 (Mobile App)"
        injectedJavaScript={buildVideoInterceptorScript(Platform.OS === "ios")}
        injectedJavaScriptForMainFrameOnly
        onMessage={handleMessage}
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
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  progressTrack: { position: "absolute", left: 0, right: 0, height: 3, zIndex: 10, backgroundColor: "#1e293b" },
  progressFill: { height: 3, backgroundColor: "#F97316" },
  logoBox: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  offlineTitle: { fontSize: 22, fontWeight: "700" },
  offlineSub: { fontSize: 14, textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  gateTitle: { fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center" },
  gateSub: { fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 22 },
  iconRow: { flexDirection: "row", gap: 24, marginVertical: 8 },
  iconItem: { alignItems: "center", gap: 4 },
  iconEmoji: { fontSize: 32 },
  iconLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, width: "100%" },
  settingsBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  recheckBtn: { paddingVertical: 12 },
  recheckText: { color: "#F97316", fontSize: 14, fontWeight: "600" },
});
