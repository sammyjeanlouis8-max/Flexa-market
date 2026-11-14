/**
 * Automatic promotional video interstitial (home / app chrome).
 * Fetches GET /boost/random-video and opens /videos/watch with autoplay.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchRandomBoostAd } from "@/lib/videosApi";

const STORAGE_KEY = "flexamarket_boost_last_shown";
const AD_INTERVAL_MS = 5 * 60_000;

async function shouldShow(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) >= AD_INTERVAL_MS;
  } catch {
    return true;
  }
}

async function markShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function BoostAdOverlayHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const launched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tryShow = async () => {
      if (cancelled || launched.current) return;
      if (pathname?.includes("videos/watch") || pathname?.includes("auth/")) return;
      if (pathname && pathname !== "/" && !pathname.includes("(tabs)") && pathname !== "/index") {
        // only auto-show on home-ish surfaces
        if (!pathname.endsWith("/index") && pathname !== "/") return;
      }
      if (!(await shouldShow())) return;
      try {
        const ad = await fetchRandomBoostAd({ country }, { token });
        if (cancelled || !ad?.boostVideoUrl) return;
        launched.current = true;
        await markShown();
        router.push({
          pathname: "/videos/watch",
          params: {
            id: String(ad.id),
            videoUrl: ad.boostVideoUrl,
            title: ad.title,
            thumb: ad.thumbnail || "",
            sellerId: ad.sellerId != null ? String(ad.sellerId) : "",
            isVideoOnly: ad.isVideoOnly ? "1" : "0",
            autoplay: "1",
          },
        } as any);
      } catch {
        /* soft fail */
      }
    };

    const t = setTimeout(() => void tryShow(), 2500);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        launched.current = false;
        void tryShow();
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(t);
      sub.remove();
    };
  }, [pathname, token, country, router]);

  return null;
}
