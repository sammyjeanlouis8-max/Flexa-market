# Flexa Music Professional Native Experience — Delivery Report

Branch: `cursor/flexa-music-native-9492`  
Status: **ready for review — do not merge/deploy without explicit approval**

## What shipped

### Phase 1 — Free access + design
- Midnight Navy / Cyan / Purple / Magenta shell tokens in `.flexa-music-shell`
- Full-screen player (vinyl, seek, shuffle/repeat, action grid) + mini-player
- `MUSIC_COMMERCE_ENABLED` soft-off (server env `MUSIC_COMMERCE_ENABLED`, client optional `VITE_MUSIC_COMMERCE_ENABLED`)
- Paywalls / Premium banner / sale chips gated while commerce is off
- Genre chips + Tendances section on Home

### Phase 2 — Playback
- `musicStore` SSOT with shuffle/repeat/sleep/rate, localStorage restore (`flexa_music_playback_v1`)
- `POST /api/music/:id/play` increments `play_count` + listening history
- Video feed pauses music on active video
- Expo: `react-native-track-player` + `expo-av` deps, `UIBackgroundModes: audio`, Android media FGS permission
- WebView `flexa-music` postMessage bridge (`musicNativeBridge` ↔ native modules)

### Phase 3 — Upload / stream
- Free uploads while commerce off (`artistPlan` + `musicUploadsAreFree`)
- Required copyright declaration (UI + API)
- Soft duplicate `409 POSSIBLE_DUPLICATE` with `forceDuplicate` override + retry register
- Wasabi signed/proxy streams only; ffmpeg convert path retained

### Phase 4 — Social / discovery
- User playlists CRUD, listening history, trending, artist profile `/music/artist/:userId`
- Reposts, timestamped comments, report (`target_type=music_track`)
- Artist stats / earnings / withdraw endpoints restored for existing earnings UI
- Visibility `public|private` enforced on list/detail/stream

### Phase 5 — Safety / QA
- Blanket `is_active=TRUE` boot migration retired
- Rate limits on comment / play / upload
- Unit tests: commerce, route surface, marketplace surface, mobile bridge protocol
- Device QA checklist: `docs/FLEXA_MUSIC_DEVICE_QA.md`

## Needs a new Expo / EAS build
- TrackPlayer native module
- iOS `audio` background mode
- Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK`

Expo Go and OTA alone **cannot** validate lock-screen / true background audio. Web/Media Session remains the fallback.

## Explicitly out of scope (per plan)
- No App Store / Play publish
- No DigitalOcean deploy without approval
- No deletion of historical purchase/subscription rows
- No floating overlay above other iOS apps

## Suggested review order
1. Commerce flag + gated UI
2. Play / impression / playlist / report APIs
3. Upload copyright + duplicate flow
4. Native bridge + `app.json` background modes
5. Device lab after EAS build
