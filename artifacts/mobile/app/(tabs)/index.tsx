/**
 * 100% WebView shell — loads flexamarket.com with native push notifications.
 *
 * Features:
 *  - Full-screen WebView (no native navigation screens)
 *  - Push notifications injected into the web page via usePushNotifications
 *  - Stripe checkout opens inside the same WebView (fixes missing buttons)
 *  - iOS video file-input interceptor (WKWebView can't open camera for video)
 *  - Android hardware-back navigates the WebView history
 *  - External links open in the device browser
 *  - Safe-area insets injected as CSS variables (--sat / --sab)
 */

import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { usePushNotifications } from "../../hooks/usePushNotifications";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBSITE = "https://flexamarket.com";
const MAX_BRIDGE_BYTES = 40 * 1024 * 1024; // 40 MB

// On iOS wrap content inside safe-area; Android manages its own insets.
const SAFE_EDGES: ("top" | "bottom" | "left" | "right")[] =
  Platform.OS === "ios" ? ["top", "bottom"] : [];

// ─── URL helpers ──────────────────────────────────────────────────────────────

/** Returns true for URLs that must stay inside the WebView. */
function isInternal(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === "mailto:" || protocol === "tel:" || protocol === "sms:") {
      return false; // handled by Linking below
    }
    if (
      hostname === "flexamarket.com" ||
      hostname.endsWith(".flexamarket.com")
    ) return true;
    // Keep ALL Stripe domains inside so payment buttons render correctly.
    if (
      hostname === "stripe.com" ||
      hostname.endsWith(".stripe.com") ||
      hostname.endsWith(".stripe.network")
    ) return true;
    return false;
  } catch {
    return true;
  }
}

// ─── Injected scripts ─────────────────────────────────────────────────────────

/**
 * Script injected on every page load (injectedJavaScript — runs before page JS).
 * - Blocks the long-press context menu.
 * - On iOS: intercepts <input type="file" accept="video*"> clicks and routes
 *   them through the React Native bridge (WKWebView silently drops camera video).
 */
const INIT_SCRIPT = `
(function(){
  // Block context menu (long-press)
  if(!window.__flexaCtxBlocked){
    window.__flexaCtxBlocked=true;
    document.addEventListener('contextmenu',function(e){e.preventDefault();},true);
  }

  ${Platform.OS === "ios" ? `
  // Video-input interceptor (iOS only)
  if(!window.__flexaVideoInterceptInit){
    window.__flexaVideoInterceptInit=true;
    var _pi=null;
    function _isVid(el){return el&&el.tagName==='INPUT'&&el.type==='file'&&/video/i.test(el.accept||'');}
    function _hook(el){
      if(!el||el.__fxh||!_isVid(el))return;
      el.__fxh=true;
      el.addEventListener('click',function(e){
        e.preventDefault();e.stopImmediatePropagation();
        _pi=el;
        window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'PICK_VIDEO'}));
      },true);
    }
    document.querySelectorAll('input[type="file"]').forEach(_hook);
    new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
      if(!n||n.nodeType!==1)return;
      if(n.tagName==='INPUT')_hook(n);
      if(n.querySelectorAll)n.querySelectorAll('input[type="file"]').forEach(_hook);
    });});}).observe(document.body,{childList:true,subtree:true});
    var _oc=HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click=function(){
      if(_isVid(this)&&window.ReactNativeWebView){_pi=this;window.ReactNativeWebView.postMessage(JSON.stringify({type:'PICK_VIDEO'}));return;}
      _oc.call(this);
    };
    window.__flexaReceiveVideo=function(b64,mime,name){
      var inp=_pi;_pi=null;if(!inp)return;
      try{
        var bs=atob(b64),bytes=new Uint8Array(bs.length);
        for(var i=0;i<bs.length;i++)bytes[i]=bs.charCodeAt(i);
        var f=new File([new Blob([bytes],{type:mime})],name,{type:mime,lastModified:Date.now()});
        var dt=new DataTransfer();dt.items.add(f);
        inp.files=dt.files;
        inp.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(e){console.error('[FxVid]',e);}
    };
    window.__flexaVideoCancel=function(){_pi=null;};
  }
  ` : ""}
})();true;
`.trim();

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const webRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const insets = useSafeAreaInsets();

  // ── Push notifications ──────────────────────────────────────────────────────
  const injectJs = useCallback((script: string) => {
    webRef.current?.injectJavaScript(script);
  }, []);

  const tokenRef = usePushNotifications(injectJs);

  // ── Android hardware back button ────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // ── Re-inject safe-area insets + push token on every page load ──────────────
  const onLoadEnd = useCallback(() => {
    // Safe-area CSS variables
    injectJs(
      `(function(){
        window.__flexaNativeSafeTop=${Math.round(insets.top)};
        window.__flexaNativeSafeBottom=${Math.round(insets.bottom)};
        document.documentElement.style.setProperty('--sat','${Math.round(insets.top)}px');
        document.documentElement.style.setProperty('--sab','${Math.round(insets.bottom)}px');
      })();true;`
    );
    // Re-inject push token (SPA navigations destroy the window object)
    const token = tokenRef.current;
    if (token) {
      const p = Platform.OS;
      injectJs(
        `(function(){
          window.__expoPushToken=${JSON.stringify(token)};
          window.__expoPushPlatform=${JSON.stringify(p)};
          if(typeof window.__onExpoPushToken==='function')
            window.__onExpoPushToken(${JSON.stringify(token)},${JSON.stringify(p)});
        })();true;`
      );
    }
  }, [insets, injectJs, tokenRef]);

  // ── Navigation guard ────────────────────────────────────────────────────────
  const onShouldStartLoadWithRequest = useCallback((req: any) => {
    const { url } = req;
    if (isInternal(url)) return true; // stay in WebView
    // Open everything else in the system browser
    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  // Handle target="_blank" / window.open — keep inside WebView
  const onOpenWindow = useCallback((event: any) => {
    const url = event.nativeEvent?.targetUrl;
    if (!url) return;
    if (isInternal(url)) {
      webRef.current?.injectJavaScript(
        `window.location.href=${JSON.stringify(url)};true;`
      );
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  // ── Bridge messages from the web page ───────────────────────────────────────
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "PICK_VIDEO") handleNativeVideoPick();
    } catch { /* ignore non-JSON messages */ }
  }, []);

  // ── Video picker (iOS — WKWebView drops camera video) ──────────────────────
  const cancelVideoPick = useCallback(() => {
    injectJs("window.__flexaVideoCancel&&window.__flexaVideoCancel();true;");
  }, [injectJs]);

  const deliverVideo = useCallback(async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (((info as any).size ?? 0) > MAX_BRIDGE_BYTES) {
        injectJs(
          `window.__flexaVideoCancel&&window.__flexaVideoCancel();
           alert('Vidéo a twò gwo (limit: 40 MB).');true;`
        );
        return;
      }
      const ext = (uri.split(".").pop() ?? "mp4").toLowerCase().split("?")[0];
      const mime =
        ext === "mov" ? "video/quicktime" :
        ext === "webm" ? "video/webm" : "video/mp4";
      const name = `video_${Date.now()}.${ext}`;
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const CHUNK = 256 * 1024;
      injectJs("window.__flexaB64=[];true;");
      for (let i = 0; i < b64.length; i += CHUNK) {
        injectJs(`window.__flexaB64.push(${JSON.stringify(b64.slice(i, i + CHUNK))});true;`);
      }
      injectJs(
        `window.__flexaReceiveVideo(window.__flexaB64.join(''),${JSON.stringify(mime)},${JSON.stringify(name)});
         window.__flexaB64=null;true;`
      );
    } catch {
      cancelVideoPick();
    }
  }, [injectJs, cancelVideoPick]);

  const pickVideoFromCamera = useCallback(async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) { cancelVideoPick(); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: "videos", videoMaxDuration: 180 });
    if (r.canceled || !r.assets?.[0]?.uri) { cancelVideoPick(); return; }
    await deliverVideo(r.assets[0].uri);
  }, [cancelVideoPick, deliverVideo]);

  const pickVideoFromLibrary = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { cancelVideoPick(); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "videos", videoMaxDuration: 180 });
    if (r.canceled || !r.assets?.[0]?.uri) { cancelVideoPick(); return; }
    await deliverVideo(r.assets[0].uri);
  }, [cancelVideoPick, deliverVideo]);

  const handleNativeVideoPick = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Anile", "Anrejistre Vidéo", "Chwazi nan Galeri"], cancelButtonIndex: 0 },
        (i) => {
          if (i === 1) pickVideoFromCamera();
          else if (i === 2) pickVideoFromLibrary();
          else cancelVideoPick();
        }
      );
    } else {
      pickVideoFromLibrary();
    }
  }, [pickVideoFromCamera, pickVideoFromLibrary, cancelVideoPick]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={SAFE_EDGES}>
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE }}
        style={styles.webview}

        // ── JavaScript & storage ──────────────────────────────────────────────
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowUniversalAccessFromFileURLs
        allowFileAccessFromFileURLs

        // ── Initial injected script (runs before page JS) ─────────────────────
        injectedJavaScript={INIT_SCRIPT}
        injectedJavaScriptBeforeContentLoaded={INIT_SCRIPT}

        // ── User-Agent: include "Safari" so Stripe renders payment buttons ─────
        applicationNameForUserAgent="FlexaMarket/1.0 Safari/605.1.15"

        // ── Media ─────────────────────────────────────────────────────────────
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo

        // ── iOS gestures ──────────────────────────────────────────────────────
        allowsBackForwardNavigationGestures={Platform.OS === "ios"}

        // ── Popups (Stripe window.open) ───────────────────────────────────────
        setSupportMultipleWindows={false}

        // ── Callbacks ─────────────────────────────────────────────────────────
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={onOpenWindow}
        onLoadEnd={onLoadEnd}
        onMessage={handleMessage}

        // ── Rendering ─────────────────────────────────────────────────────────
        renderToHardwareTextureAndroid
        startInLoadingState
        originWhitelist={["*"]}
        mixedContentMode="always"
        cacheEnabled
        pullToRefreshEnabled={false}
        keyboardDisplayRequiresUserAction={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview:   { flex: 1 },
});
