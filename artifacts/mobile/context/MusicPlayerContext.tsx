/**
 * Global Flexa Music mini-player state (expo-av).
 * Background audio on iOS needs UIBackgroundModes audio in app.json —
 * that change is NOT applied here without authorization.
 */
import { Audio, type AVPlaybackStatus } from "expo-av";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchMusicStreamUrl, type MusicTrack } from "@/lib/musicApi";
import { useAuth } from "./AuthContext";

type MusicPlayerContextType = {
  track: MusicTrack | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  playTrack: (track: MusicTrack) => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
};

const MusicPlayerContext = createContext<MusicPlayerContextType>({
  track: null,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  playTrack: async () => {},
  toggle: async () => {},
  stop: async () => {},
});

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    }).catch(() => {});
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setPlaying(false);
      return;
    }
    setPlaying(status.isPlaying);
    setPositionMs(status.positionMillis || 0);
    setDurationMs(status.durationMillis || 0);
  }, []);

  const stop = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;
    setPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    setTrack(null);
  }, []);

  const playTrack = useCallback(
    async (next: MusicTrack) => {
      try {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        const url = await fetchMusicStreamUrl(next.id, { token });
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true, progressUpdateIntervalMillis: 500 },
          onStatus,
        );
        soundRef.current = sound;
        setTrack(next);
        setPlaying(true);
      } catch (e) {
        setPlaying(false);
        throw e;
      }
    },
    [onStatus, token],
  );

  const toggle = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await sound.pauseAsync();
    else await sound.playAsync();
  }, []);

  const value = useMemo(
    () => ({ track, playing, positionMs, durationMs, playTrack, toggle, stop }),
    [track, playing, positionMs, durationMs, playTrack, toggle, stop],
  );

  return (
    <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
  );
}

export const useMusicPlayer = () => useContext(MusicPlayerContext);
