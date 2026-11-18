# Chat composer parity (native + web + WebView)

Target: mint + (Camera/Gallery menu), light-gray pill with emoji only, orange mic→Send.

- Native Android/iOS: `artifacts/mobile/app/chat/[id].tsx`
- Web + WebView: `artifacts/marketplace/src/pages/messages/MessageThread.tsx`
  (WebView shell loads marketplace SPA, so MessageThread is shared)

Proof: `android-composer-empty.png` (native empty composer crop).
