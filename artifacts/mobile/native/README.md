# Native modules (Flexa Market mobile shell)

## Music background playback

`react-native-track-player` and `expo-av` are declared in `package.json` for
background / lock-screen music from the marketplace WebView.

**A new EAS development or production build is required.** Expo Go cannot load
the TrackPlayer native binary. After changing `app.json` background modes /
permissions or adding these dependencies, run a fresh `eas build` (or local
`npx expo prebuild` + native rebuild) before testing lock-screen controls.

See `docs/FLEXA_MUSIC_DEVICE_QA.md` for the device checklist.
