# Flexa Music — Device QA (native background audio)

## When a new native build is required

Rebuild the Expo **dev client** or store binary (EAS) whenever any of these change:

- `artifacts/mobile/app.json` → iOS `UIBackgroundModes` includes `audio`
- Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions
- Dependencies: `react-native-track-player`, `expo-av`
- Native music modules under `artifacts/mobile/native/music*.ts`
- `index.js` TrackPlayer service registration

OTA / Expo Updates **cannot** ship new native modules. Expo Go will not play via TrackPlayer.

See also `artifacts/mobile/native/README.md`.

## Expo Go limitations

| Feature | Expo Go | EAS / dev-client build |
|---|---|---|
| WebView HTMLAudio | Yes (best-effort background) | Yes (fallback) |
| TrackPlayer + lock screen | No | Yes |
| `window.__flexaNativeMusic` | Absent / false | Set after `setupPlayer` |
| Bluetooth headset transport controls | Media Session only | TrackPlayer remote events |

In Expo Go the bridge no-ops and logs once; the SPA keeps using `HTMLAudioElement`.

## Lock screen / Bluetooth checklist (physical devices)

1. Install a fresh EAS or local release/dev-client build (not Expo Go).
2. Open Flexa Music, play a track until audio is clearly audible.
3. Confirm `window.__flexaNativeMusic === true` in the WebView console (optional).
4. Lock the phone — audio continues; lock-screen artwork / title appear.
5. Lock-screen **pause** / **play** / **seek** / next-prev (if queue loaded).
6. Bluetooth headset or car: play, pause, skip.
7. Open Video Feed — music must pause when a video card becomes active.
8. Return to Music and resume; confirm no double-audio (HTML + native).
9. Background the app for 2+ minutes; confirm Android foreground media notification.
10. Kill the app from recents — document whether ContinuePlayback kept audio (Android policy).

## Web bridge smoke (no native binary)

- Browser: music still uses `musicStore` + `gAudio` only.
- Messages are only posted when both `ReactNativeWebView` and `__flexaNativeMusic` exist.
