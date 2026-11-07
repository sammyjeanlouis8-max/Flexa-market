import { registerRootComponent } from "expo";
import App from "./App";

// Register TrackPlayer's background service when the native module is present.
// Expo Go / missing binary: swallow — WebView HTMLAudio remains the fallback.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TrackPlayer = require("react-native-track-player").default;
  if (TrackPlayer && typeof TrackPlayer.registerPlaybackService === "function") {
    TrackPlayer.registerPlaybackService(() =>
      require("./native/musicPlaybackService").default,
    );
  }
} catch {
  // TrackPlayer unavailable in this runtime.
}

// Plain React Native entry — no expo-router, no file-based routing.
// This is intentional: the app is a single-screen WebView shell.
registerRootComponent(App);
