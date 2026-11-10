/**
 * Device performance tiers for adaptive auth-globe rendering.
 * Keeps Login/Signup responsive on low-RAM Android phones.
 */
import * as Device from "expo-device";
import { PixelRatio, Platform } from "react-native";

export type PerfTier = "high" | "mid" | "low" | "lite";

export type GlobeQuality = {
  tier: PerfTier;
  /** Sphere longitude segments */
  segX: number;
  /** Sphere latitude segments */
  segY: number;
  /** Cap for PixelRatio used when sizing the GL viewport */
  maxDpr: number;
  /** Target animation frame interval (ms). 16≈60fps, 33≈30fps, 50≈20fps */
  frameIntervalMs: number;
  /** Prefer WebGL; false forces the lightweight Animated fallback */
  useGl: boolean;
};

const TIER_ORDER: PerfTier[] = ["high", "mid", "low", "lite"];

const QUALITY: Record<PerfTier, GlobeQuality> = {
  high: { tier: "high", segX: 64, segY: 36, maxDpr: 2, frameIntervalMs: 16, useGl: true },
  mid: { tier: "mid", segX: 40, segY: 24, maxDpr: 1.5, frameIntervalMs: 22, useGl: true },
  low: { tier: "low", segX: 24, segY: 16, maxDpr: 1, frameIntervalMs: 33, useGl: true },
  lite: { tier: "lite", segX: 0, segY: 0, maxDpr: 1, frameIntervalMs: 33, useGl: false },
};

let cachedTier: PerfTier | null = null;

function bytesToGb(bytes: number | null | undefined): number {
  if (!bytes || bytes <= 0) return 0;
  return bytes / (1024 * 1024 * 1024);
}

/**
 * Heuristic initial tier. Conservative on Android so mid/low phones stay fluid.
 */
export function detectPerfTierSync(): PerfTier {
  if (cachedTier) return cachedTier;

  const ramGb = bytesToGb(Device.totalMemory);
  const dpr = PixelRatio.get();
  const api = Device.platformApiLevel ?? 0;

  let tier: PerfTier = "mid";

  if (Platform.OS === "android") {
    // Conservative defaults for low-end Android (Phase 3M device readiness).
    if (ramGb > 0 && ramGb < 3.5) tier = "lite";
    else if (ramGb > 0 && ramGb < 5) tier = "low";
    else if (ramGb >= 7 && dpr >= 2.5 && api >= 31) tier = "high";
    else if (ramGb >= 5) tier = "mid";
    else if (ramGb === 0) {
      // Unknown RAM — prefer low on Android to avoid jank during auth.
      tier = api >= 31 ? "mid" : "low";
    }
  } else {
    // iOS devices are generally capable; keep mid/high only.
    tier = ramGb > 0 && ramGb < 3 ? "mid" : "high";
  }

  cachedTier = tier;
  return tier;
}

export async function detectPerfTierAsync(): Promise<PerfTier> {
  const sync = detectPerfTierSync();
  try {
    const maxMem = await Device.getMaxMemoryAsync();
    const maxGb = bytesToGb(maxMem);
    // Very low Java heap → force lite (common on budget Android).
    if (Platform.OS === "android" && maxGb > 0 && maxGb < 0.35) {
      cachedTier = "lite";
      return "lite";
    }
  } catch {
    /* ignore */
  }
  return sync;
}

export function qualityForTier(tier: PerfTier): GlobeQuality {
  return QUALITY[tier];
}

export function downgradeTier(tier: PerfTier): PerfTier {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return "lite";
  return TIER_ORDER[idx + 1];
}

export function __resetPerfTierCacheForTests() {
  cachedTier = null;
}
