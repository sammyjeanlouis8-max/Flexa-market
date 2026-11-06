/**
 * WebView ↔ native music bridge.
 * Parses postMessage JSON from the marketplace SPA and dispatches to TrackPlayer.
 */

import {
  type FlexaMusicMessage,
  type FlexaMusicNativeEvent,
  buildMusicNativeReplyScript,
  buildNativeMusicCapabilityScript,
  parseFlexaMusicMessage,
} from "./musicBridgeProtocol";
import {
  musicLoad,
  musicPause,
  musicPlay,
  musicQueue,
  musicSeek,
  musicStop,
  setupMusicPlayer,
} from "./musicPlayback";

export type {
  FlexaMusicAction,
  FlexaMusicMessage,
  FlexaMusicNativeEvent,
  FlexaMusicTrackPayload,
} from "./musicBridgeProtocol";
export {
  buildMusicNativeReplyScript,
  buildNativeMusicCapabilityScript,
  parseFlexaMusicMessage,
} from "./musicBridgeProtocol";

export async function dispatchFlexaMusicMessage(
  message: FlexaMusicMessage,
): Promise<FlexaMusicNativeEvent> {
  const ready = await setupMusicPlayer();
  if (!ready) {
    return {
      type: "flexa-music-native",
      action: message.action,
      state: "unavailable",
      error: "TrackPlayer unavailable",
    };
  }

  try {
    switch (message.action) {
      case "load": {
        const ok = await musicLoad(message.track ?? {}, message.url);
        if (ok) await musicPlay();
        return {
          type: "flexa-music-native",
          action: "load",
          state: ok ? "playing" : "error",
          error: ok ? undefined : "load failed",
        };
      }
      case "queue": {
        const ok = await musicQueue(message.queue ?? (message.track ? [message.track] : []));
        if (ok) await musicPlay();
        return {
          type: "flexa-music-native",
          action: "queue",
          state: ok ? "playing" : "error",
          error: ok ? undefined : "queue failed",
        };
      }
      case "play": {
        if (message.track || message.url) {
          const ok = await musicLoad(message.track ?? {}, message.url);
          if (!ok) {
            return {
              type: "flexa-music-native",
              action: "play",
              state: "error",
              error: "load failed",
            };
          }
        }
        const ok = await musicPlay();
        return {
          type: "flexa-music-native",
          action: "play",
          state: ok ? "playing" : "error",
          error: ok ? undefined : "play failed",
        };
      }
      case "pause": {
        const ok = await musicPause();
        return {
          type: "flexa-music-native",
          action: "pause",
          state: ok ? "paused" : "error",
        };
      }
      case "seek": {
        const position = message.position ?? 0;
        const ok = await musicSeek(position);
        return {
          type: "flexa-music-native",
          action: "seek",
          position,
          state: ok ? "seeked" : "error",
        };
      }
      case "stop": {
        const ok = await musicStop();
        return {
          type: "flexa-music-native",
          action: "stop",
          state: ok ? "stopped" : "error",
        };
      }
      default:
        return {
          type: "flexa-music-native",
          action: String(message.action),
          state: "ignored",
        };
    }
  } catch (error) {
    return {
      type: "flexa-music-native",
      action: message.action,
      state: "error",
      error: error instanceof Error ? error.message : "music bridge error",
    };
  }
}
