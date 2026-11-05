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

## Next native step (Expo development build)

To meet App Store / Play background guarantees:

1. Add Expo modules with a development build (not Expo Go):
   - `expo-av` or `react-native-track-player`
   - iOS: `UIBackgroundModes` → `audio`
   - Android: MediaPlayback foreground service + notification
2. Bridge the existing `musicStore` queue / position into the native player
3. Keep Wasabi signed URLs server-side; never ship Wasabi keys to the client
4. Conflict policy: pause music when a marketplace video starts; resume per
   OS interruption rules after phone calls

## Already present (backend / social)

Artist profiles, likes, follows, comments, play counts, search, trending,
uploads via Wasabi proxy, verified badges — reuse these; do not rebuild.

## Remaining product work (not claimed done)

- Timestamped comments UI polish
- Creator analytics dashboard expansion
- Copyright report / takedown workflow UX
- Adaptive bitrate transcoding pipeline hardening
- Device-lab verification of background audio on physical iOS + Android

## Re-enabling commerce later

Set both `MUSIC_COMMERCE_ENABLED` flags to `true`. No migration required;
Artist Plan and sale-track purchase paths remain intact.
