/**
 * Flexa Market — 100% WebView shell
 *
 * Features:
 *  - Full-screen WebView loading flexamarket.com
 *  - Push notifications via expo-notifications (injected into WebView)
 *  - Stripe opens inside the same WebView (fixes missing payment buttons)
 *  - iOS video-input interceptor (WKWebView can't open camera for video)
 *  - Android hardware-back navigates WebView history
 *  - External links open in system browser
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

const SAFE_EDGES: ("top" | "bottom" | "left" | "right")[] =
  Platform.OS === "ios" ? ["top", "bottom"] : [];

// ─── URL helpers ──────────────────────────────────────────────────────────────
function isInternal(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === "mailto:" || protocol === "tel:" || protocol === "sms:") return false;
    if (hostname === "flexamarket.com" || hostname.endsWith(".flexamarket.com")) return true;
    if (hostname === "stripe.com" || hostname.endsWith(".stripe.com") || hostname.endsWith(".stripe.network")) return true;
    return false;
  } catch {
    return true;
  }
}

// ─── Injected script ──────────────────────────────────────────────────────────
const INIT_SCRIPT = `
(function(){
  if(!window.__flexaCtxBlocked){
    window.__flexaCtxBlocked=true;
    document.addEventListener('contextmenu',function(e){e.preventDefault();},true);
  }
  ${Platform.OS === "ios" ? `
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

  const injectJs = useCallback((script: string) => {
    webRef.current?.injectJavaScript(script);
  }, []);

  // Push notifications — token injected into WebView on load
  const tokenRef = usePushNotifications(injectJs);

  // Android hardware back
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Re-inject safe-area vars + push token on every page load
  const onLoadEnd = useCallback(() => {
    injectJs(
      `(function(){
        document.documentElement.style.setProperty('--sat','${Math.round(insets.top)}px');
        document.documentElement.style.setProperty('--sab','${Math.round(insets.bottom)}px');
      })();true;`
    );
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

  const onShouldStartLoadWithRequest = useCallback((req: any) => {
    if (isInternal(req.url)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  const onOpenWindow = useCallback((event: any) => {
    const url = event.nativeEvent?.targetUrl;
    if (!url) return;
    if (isInternal(url)) {
      webRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(url)};true;`);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "PICK_VIDEO") handleNativeVideoPick();
    } catch { /* ignore non-JSON */ }
  }, []);

  // ── Video picker ────────────────────────────────────────────────────────────
  const cancelVideoPick = useCallback(() => {
    injectJs("window.__flexaVideoCancel&&window.__flexaVideoCancel();true;");
  }, [injectJs]);

  const deliverVideo = useCallback(async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (((info as any).size ?? 0) > MAX_BRIDGE_BYTES) {
        injectJs(`window.__flexaVideoCancel&&window.__flexaVideoCancel();alert('Vidéo a twò gwo (limit: 40 MB).');true;`);
        return;
      }
      const ext = (uri.split(".").pop() ?? "mp4").toLowerCase().split("?")[0];
      const mime = ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";
      const name = `video_${Date.now()}.${ext}`;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const CHUNK = 256 * 1024;
      injectJs("window.__flexaB64=[];true;");
      for (let i = 0; i < b64.length; i += CHUNK) {
        injectJs(`window.__flexaB64.push(${JSON.stringify(b64.slice(i, i + CHUNK))});true;`);
      }
      injectJs(
        `window.__flexaReceiveVideo(window.__flexaB64.join(''),${JSON.stringify(mime)},${JSON.stringify(name)});window.__flexaB64=null;true;`
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

  return (
    <SafeAreaView style={styles.container} edges={SAFE_EDGES}>
      <WebView
        ref={webRef}
        source={{ uri: WEBSITE }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowUniversalAccessFromFileURLs
        allowFileAccessFromFileURLs
        injectedJavaScript={INIT_SCRIPT}
        injectedJavaScriptBeforeContentLoaded={INIT_SCRIPT}
        applicationNameForUserAgent="FlexaMarket/1.0 Safari/605.1.15"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        allowsBackForwardNavigationGestures={Platform.OS === "ios"}
        setSupportMultipleWindows={false}
        originWhitelist={["*"]}
        mixedContentMode="always"
        cacheEnabled
        startInLoadingState
        keyboardDisplayRequiresUserAction={false}
        renderToHardwareTextureAndroid
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={onOpenWindow}
        onLoadEnd={onLoadEnd}
        onMessage={handleMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1 },
});
