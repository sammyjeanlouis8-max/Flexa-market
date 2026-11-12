/**
 * Persistent Flexa Music player — survives screen navigation.
 * Pauses when TV/video takes focus. Free listening only (no purchase flows).
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { resolveMusicPlayUrl, type MusicTrack } from "@/lib/musicApi";
import { useAuth } from "@/context/AuthContext";

type RepeatMode = "off" | "one" | "all";

type MusicPlayerContextType = {
  queue: MusicTrack[];
  index: number;
  current: MusicTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playTrack: (track: MusicTrack, queue?: MusicTrack[]) => Promise<void>;
  playQueue: (tracks: MusicTrack[], startIndex?: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  stopAndClear: () => Promise<void>;
  /** Call when opening a video player so music ducks/pauses. */
  pauseForVideo: () => Promise<void>;
};

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

async function configureAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const indexRef = useRef(0);
  const queueRef = useRef<MusicTrack[]>([]);
  const repeatRef = useRef<RepeatMode>("off");
  const shuffleRef = useRef(false);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    void configureAudioMode();
    const sub = AppState.addEventListener("change", () => {
      /* staysActiveInBackground keeps playback; no action needed */
    });
    return () => {
      sub.remove();
      void soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const unload = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        /* ignore */
      }
      soundRef.current = null;
    }
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
  }, []);

  const loadAndPlay = useCallback(
    async (track: MusicTrack) => {
      await unload();
      await configureAudioMode();
      const url = await resolveMusicPlayUrl(track, { token });
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        (status) => {
          if (!status.isLoaded) return;
          setPositionMs(status.positionMillis ?? 0);
          setDurationMs(status.durationMillis ?? 0);
          setIsPlaying(status.isPlaying);
          if (status.didJustFinish) {
            void (async () => {
              const q = queueRef.current;
              const i = indexRef.current;
              const mode = repeatRef.current;
              if (mode === "one") {
                await sound.setPositionAsync(0);
                await sound.playAsync();
                return;
              }
              if (i < q.length - 1) {
                const nextIdx = shuffleRef.current
                  ? Math.floor(Math.random() * q.length)
                  : i + 1;
                setIndex(nextIdx);
                await loadAndPlay(q[nextIdx]);
              } else if (mode === "all" && q.length) {
                setIndex(0);
                await loadAndPlay(q[0]);
              } else {
                setIsPlaying(false);
              }
            })();
          }
        },
      );
      soundRef.current = sound;
      setIsPlaying(true);
    },
    [token, unload],
  );

  const playTrack = useCallback(
    async (track: MusicTrack, nextQueue?: MusicTrack[]) => {
      const q = nextQueue?.length ? nextQueue : [track];
      const idx = Math.max(0, q.findIndex((t) => t.id === track.id));
      setQueue(q);
      setIndex(idx >= 0 ? idx : 0);
      await loadAndPlay(track);
    },
    [loadAndPlay],
  );

  const playQueue = useCallback(
    async (tracks: MusicTrack[], startIndex = 0) => {
      if (!tracks.length) return;
      const i = Math.min(Math.max(0, startIndex), tracks.length - 1);
      setQueue(tracks);
      setIndex(i);
      await loadAndPlay(tracks[i]);
    },
    [loadAndPlay],
  );

  const togglePlay = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    const st = await s.getStatusAsync();
    if (!st.isLoaded) return;
    if (st.isPlaying) {
      await s.pauseAsync();
      setIsPlaying(false);
    } else {
      await s.playAsync();
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    try {
      await s.pauseAsync();
    } catch {
      /* ignore */
    }
    setIsPlaying(false);
  }, []);

  const next = useCallback(async () => {
    const q = queueRef.current;
    if (!q.length) return;
    let nextIdx = indexRef.current + 1;
    if (shuffleRef.current) nextIdx = Math.floor(Math.random() * q.length);
    if (nextIdx >= q.length) {
      if (repeatRef.current === "all") nextIdx = 0;
      else return;
    }
    setIndex(nextIdx);
    await loadAndPlay(q[nextIdx]);
  }, [loadAndPlay]);

  const previous = useCallback(async () => {
    const q = queueRef.current;
    if (!q.length) return;
    if (positionMs > 3000) {
      await soundRef.current?.setPositionAsync(0);
      return;
    }
    const prevIdx = Math.max(0, indexRef.current - 1);
    setIndex(prevIdx);
    await loadAndPlay(q[prevIdx]);
  }, [loadAndPlay, positionMs]);

  const seek = useCallback(async (ms: number) => {
    await soundRef.current?.setPositionAsync(Math.max(0, ms));
  }, []);

  const value = useMemo<MusicPlayerContextType>(
    () => ({
      queue,
      index,
      current: queue[index] ?? null,
      isPlaying,
      positionMs,
      durationMs,
      shuffle,
      repeat,
      playTrack,
      playQueue,
      togglePlay,
      pause,
      next,
      previous,
      seek,
      toggleShuffle: () => setShuffle((s) => !s),
      cycleRepeat: () =>
        setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
      stopAndClear: async () => {
        await unload();
        setQueue([]);
        setIndex(0);
      },
      pauseForVideo: pause,
    }),
    [
      queue,
      index,
      isPlaying,
      positionMs,
      durationMs,
      shuffle,
      repeat,
      playTrack,
      playQueue,
      togglePlay,
      pause,
      next,
      previous,
      seek,
      unload,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer requires MusicPlayerProvider");
  return ctx;
}
