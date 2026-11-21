/**
 * Flexa Market WebView for Home, Product Details, and Messages inbox list.
 * Native bottom tabs stay outside this view. Intercepts:
 *  - /messages/:id → native chat thread (session preserved)
 *  - /search, /cart, /checkout → native routes
 * Syncs website cart localStorage into native CartContext.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { useAuth } from "@/context/AuthContext";
import { useCart, type CartItem } from "@/context/CartContext";
import { makeTokenScript } from "@/components/SafeWebView";
import {
  ANDROID_UA_SUFFIX,
  classifyWebUrl,
} from "@/security/webviewPolicy";

const WEB_ORIGIN = "https://flexamarket.com";

const HIDE_WEB_CHROME = `
(function(){
  if (window.__flexaHideChrome) return;
  window.__flexaHideChrome = true;
  var css = document.createElement('style');
  css.id = 'flexa-native-chrome-hide';
  css.textContent = [
    '.mobile-bottom-nav{display:none!important;visibility:hidden!important;height:0!important;pointer-events:none!important;}',
    'body{padding-bottom:0!important;}'
  ].join('');
  document.documentElement.appendChild(css);
})();
true;
`;

const BRIDGE_SCRIPT = `
(function(){
  if (window.__flexaMarketBridge) return;
  window.__flexaMarketBridge = true;
  function post(msg){
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    } catch (e) {}
  }
  function syncCart(){
    try {
      post({ type: 'CART_SYNC', cart: localStorage.getItem('flexamarket_cart') });
    } catch (e) {}
  }
  syncCart();
  setInterval(syncCart, 1000);
  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    try {
      var u = new URL(href, location.origin);
      if (u.origin !== location.origin) return;
      var path = u.pathname;
      var m = path.match(/^\\/messages\\/(\\d+)\\/?$/);
      if (m) {
        ev.preventDefault();
        ev.stopPropagation();
        try { sessionStorage.setItem('flexa_inbox_scroll', String(window.scrollY||0)); } catch(e){}
        post({ type: 'OPEN_CHAT', conversationId: Number(m[1]) });
        return false;
      }
      if (path === '/search' || path.indexOf('/search?') === 0) {
        ev.preventDefault();
        post({ type: 'OPEN_NATIVE', path: '/search' + (u.search||'') });
        return false;
      }
      if (path === '/cart') {
        ev.preventDefault();
        post({ type: 'OPEN_NATIVE', path: '/(tabs)/cart' });
        return false;
      }
      if (path.indexOf('/checkout') === 0) {
        ev.preventDefault();
        post({ type: 'OPEN_NATIVE', path: '/checkout' });
        return false;
      }
    } catch (e) {}
  }, true);
})();
true;
`;

function parseMessagesId(url: string): number | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/messages\/(\d+)\/?$/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function normalizeCartPayload(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: any) => {
      const listingId = Number(row?.listingId);
      const sellerId = Number(row?.sellerId);
      const price = Number(row?.price);
      if (!listingId || !sellerId || !Number.isFinite(price)) return null;
      return {
        listingId,
        title: String(row?.title ?? "Listing"),
        price,
        currency: row?.currency ?? "USD",
        image: row?.image ?? null,
        country: row?.country ?? null,
        city: row?.city ?? null,
        sellerId,
        quantity: Math.max(1, Math.min(30, Number(row?.quantity) || 1)),
        variant: row?.variant ? String(row.variant) : null,
      } as CartItem;
    })
    .filter(Boolean) as CartItem[];
}

type Props = {
  path: string;
  /** When true, no native back chevron (tab roots). */
  isTabRoot?: boolean;
};

export default function MarketplaceWebView({ path, isTabRoot = false }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isLoading: authLoading } = useAuth();
  const { replaceFromWeb } = useCart();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const uri = useMemo(() => {
    if (path.startsWith("http")) return path;
    return `${WEB_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
  }, [path]);

  const injected = useMemo(
    () => `${makeTokenScript(token)}\n${HIDE_WEB_CHROME}\n${BRIDGE_SCRIPT}`,
    [token],
  );

  useEffect(() => {
    if (token && webRef.current) {
      webRef.current.injectJavaScript(makeTokenScript(token));
    }
  }, [token]);

  // Restore inbox scroll after returning from native chat.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        webRef.current?.injectJavaScript(`
          (function(){
            try {
              var y = Number(sessionStorage.getItem('flexa_inbox_scroll')||0);
              if (y > 0) window.scrollTo(0, y);
            } catch(e){}
            true;
          })();
        `);
      }, 400);
      return () => clearTimeout(t);
    }, []),
  );

  useEffect(() => {
    if (Platform.OS !== "android" || isTabRoot) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, isTabRoot]);

  const openChat = useCallback(
    (conversationId: number) => {
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      router.push(`/chat/${conversationId}`);
    },
    [router],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type === "OPEN_CHAT" && data.conversationId) {
          openChat(Number(data.conversationId));
          return;
        }
        if (data?.type === "OPEN_NATIVE" && typeof data.path === "string") {
          router.push(data.path as any);
          return;
        }
        if (data?.type === "CART_SYNC") {
          let parsed: unknown = [];
          try {
            parsed = data.cart ? JSON.parse(data.cart) : [];
          } catch {
            parsed = [];
          }
          replaceFromWeb(normalizeCartPayload(parsed));
        }
      } catch {
        /* ignore non-JSON */
      }
    },
    [openChat, replaceFromWeb, router],
  );

  const onShouldStart = useCallback(
    (request: { url: string }) => {
      const url = request.url;
      const chatId = parseMessagesId(url);
      if (chatId) {
        openChat(chatId);
        return false;
      }
      try {
        const u = new URL(url);
        if (u.origin === WEB_ORIGIN || u.hostname.endsWith(".flexamarket.com")) {
          if (u.pathname === "/search" || u.pathname.startsWith("/search")) {
            router.push(("/search" + u.search) as any);
            return false;
          }
          if (u.pathname === "/cart") {
            router.push("/(tabs)/cart");
            return false;
          }
          if (u.pathname.startsWith("/checkout")) {
            router.push("/checkout");
            return false;
          }
          return true;
        }
      } catch {
        /* fall through */
      }
      const route = classifyWebUrl(url);
      if (route === "stripe") {
        router.push("/stripe-checkout?url=" + encodeURIComponent(url));
        return false;
      }
      if (route === "external") {
        Linking.openURL(url).catch(() => {});
        return false;
      }
      return route === "flexa" || route === "moncash";
    },
    [openChat, router],
  );

  if (authLoading) {
    return (
      <View style={[styles.root, { paddingTop: isTabRoot ? insets.top : 0 }]}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: isTabRoot ? insets.top : 0 }]}>
      {!isTabRoot ? (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
          <Pressable
            onPress={() => {
              if (canGoBack) webRef.current?.goBack();
              else router.back();
            }}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Feather name="chevron-left" size={26} color="#F97316" />
          </Pressable>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : null}
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={injected}
        injectedJavaScript={`${HIDE_WEB_CHROME}\n${BRIDGE_SCRIPT}`}
        injectedJavaScriptForMainFrameOnly
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={(state) => {
          setCanGoBack(state.canGoBack);
          const chatId = parseMessagesId(state.url);
          if (chatId) {
            openChat(chatId);
            webRef.current?.goBack();
          }
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        originWhitelist={["https://*"]}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        applicationNameForUserAgent={
          Platform.OS === "android" ? ANDROID_UA_SUFFIX : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    backgroundColor: "#0F172A",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  webview: { flex: 1, backgroundColor: "#fff" },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    backgroundColor: "#0F172A",
  },
});
