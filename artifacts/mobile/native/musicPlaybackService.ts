/**
 * TrackPlayer playback service entry.
 * Registered from index.js via TrackPlayer.registerPlaybackService.
 *
 * Handles lock-screen / Bluetooth / headset remote events.
 * No-ops safely when the native module is missing.
 */

import {
  getTrackPlayerEventEnum,
  getTrackPlayerOrNull,
} from "./musicPlayback";

export default async function musicPlaybackService(): Promise<void> {
  const TrackPlayer = getTrackPlayerOrNull();
  const Event = getTrackPlayerEventEnum();
  if (!TrackPlayer || !Event) return;

  const on = (eventName: unknown, listener: (...args: any[]) => void) => {
    if (eventName == null) return;
    try {
      // addEventListener exists on the TrackPlayer default export in v4.
      (TrackPlayer as any).addEventListener(eventName, listener);
    } catch {
      // Ignore — Expo Go / incomplete native link.
    }
  };

  on(Event.RemotePlay, () => {
    void TrackPlayer.play().catch(() => {});
  });
  on(Event.RemotePause, () => {
    void TrackPlayer.pause().catch(() => {});
  });
  on(Event.RemoteStop, () => {
    void TrackPlayer.stop().catch(() => {});
  });
  on(Event.RemoteSeek, (event: { position?: number }) => {
    if (typeof event?.position === "number") {
      void TrackPlayer.seekTo(event.position).catch(() => {});
    }
  });
  on(Event.RemoteJumpForward, async (event: { interval?: number }) => {
    try {
      const position = await TrackPlayer.getPosition();
      await TrackPlayer.seekTo(position + (event?.interval ?? 10));
    } catch {
      // ignore
    }
  });
  on(Event.RemoteJumpBackward, async (event: { interval?: number }) => {
    try {
      const position = await TrackPlayer.getPosition();
      await TrackPlayer.seekTo(Math.max(0, position - (event?.interval ?? 10)));
    } catch {
      // ignore
    }
  });
  on(Event.RemoteNext, () => {
    void (TrackPlayer as any).skipToNext?.().catch(() => {});
  });
  on(Event.RemotePrevious, () => {
    void (TrackPlayer as any).skipToPrevious?.().catch(() => {});
  });
}
