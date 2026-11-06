# Flexa Music — Professional Native Experience

Status of the midnight-navy redesign, free-music commerce kill-switch, and
native background-playback plan.

## What shipped in this phase

### Design
- Midnight Navy `#050B1F` shell with Electric Cyan / Neon Purple / Magenta accents
- Moderate glassmorphism on player action tiles (no heavy bloom)
- Full-screen player: artwork + vinyl peek, seek, shuffle, repeat one/all,
  favorites, lyrics (when present), queue, download, share, sleep timer,
  playback speed, volume / system EQ note
- Persistent mini-player above bottom nav (music page) and global mini-player
  on other Flexa Market routes

### Free music (commerce disabled, data preserved)
- `MUSIC_COMMERCE_ENABLED = false` in:
  - `artifacts/marketplace/src/lib/musicCommerce.ts`
  - `artifacts/api-server/src/lib/musicCommerce.ts`
- Upload eligibility always allows uploads while the flag is off
- Sale-track paywalls / 30s preview gates are skipped
- Artist Plan UI paths remain in code for a future re-enable; historical
  subscription / purchase rows are **not** deleted

### Playback store enhancements (`musicStore.ts`)
- Shuffle / Repeat off|all|one
- Sleep timer
- Playback rate
- Buffering + error state fields
- Shareable track links via Web Share / clipboard
- Existing Media Session lock-screen / Bluetooth handlers retained

## Architecture reality (important)

Flexa Music in Flexa Market today is a **web SPA** (`FlexaMusic.tsx`) loaded in
the browser and inside the marketplace WebView. Audio uses a singleton
`HTMLAudioElement` + the **Media Session API**.

| Capability | Web / WebView today | True native (Expo / RN) |
|---|---|---|
| Continue while navigating Flexa Market | Yes (`musicStore` + GlobalMusicPlayer) | Yes |
| Lock-screen / headset controls | Yes (Media Session) | Yes (MPRemoteCommandCenter / MediaSession) |
| Screen off / app background | Best-effort in Safari / Chrome WebView | Reliable with AVAudioSession + Android Foreground Service |
| Floating overlay above other apps (iOS) | Not available to ordinary music apps | Not available |

**Do not claim floating PiP over other iOS apps** — Apple does not grant that
to ordinary music clients.

## Native bridge (implemented — needs EAS / dev-client build)

Scaffolding is in-tree; **a new Expo/dev-client build is required** before
lock-screen / background guarantees apply (Expo Go cannot load TrackPlayer).

| Piece | Location |
|---|---|
| iOS `audio` background mode + Android media FGS permissions | `artifacts/mobile/app.json` |
| Deps: `react-native-track-player` ^4.1.2, `expo-av` ~16.0.0 | `artifacts/mobile/package.json` |
| TrackPlayer setup / helpers | `artifacts/mobile/native/musicPlayback.ts` |
| Remote event service | `artifacts/mobile/native/musicPlaybackService.ts` (+ `index.js` register) |
| WebView postMessage protocol | `artifacts/mobile/native/musicBridge.ts` |
| App shell wiring | `artifacts/mobile/App.tsx`, `webviewPolicy.ts` |
| SPA bridge + store hooks | `musicNativeBridge.ts`, `musicStore.ts` |
| Video conflict (pause music) | `VideoFeed.tsx` |

Protocol: `{ type: 'flexa-music', action: 'play'|'pause'|'seek'|'load'|'queue'|'stop', ... }`.
Native replies via `window.__flexaMusicNative` / `flexa-music-native` events.
Capability flag: `window.__flexaNativeMusic = true` after successful setup.

Still required on device:

1. Fresh EAS or local native rebuild (see `docs/FLEXA_MUSIC_DEVICE_QA.md`)
2. Keep Wasabi signed URLs server-side; never ship Wasabi keys to the client
3. Resume-after-call polish per OS interruption rules
4. Optional Expo config plugin for TrackPlayer notification channels

## Already present (backend / social)

Artist profiles, likes, follows, comments, play counts, search, trending,
uploads via Wasabi proxy, verified badges — reuse these; do not rebuild.

## Remaining product work (not claimed done)

- Timestamped comments UI polish
- Creator analytics dashboard expansion
- Copyright report / takedown workflow UX
- Adaptive bitrate transcoding pipeline hardening
- Device-lab verification of background audio on physical iOS + Android (checklist: `docs/FLEXA_MUSIC_DEVICE_QA.md`)
- Optional config plugin + richer native→web position sync while TrackPlayer owns audio

## Re-enabling commerce later

Set both `MUSIC_COMMERCE_ENABLED` flags to `true`. No migration required;
Artist Plan and sale-track purchase paths remain intact.
