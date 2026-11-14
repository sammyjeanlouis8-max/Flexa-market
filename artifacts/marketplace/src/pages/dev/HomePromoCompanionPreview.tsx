/**
 * Visual QA for Home promo companion layouts (website / WebView / native-style).
 * Route: /dev/home-promo-companion-preview
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Play, Video } from "lucide-react";
import ListingCard from "@/components/ListingCard";
import PromoVideoPoster from "@/components/PromoVideoPoster";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  selectHomePromoCompanionProduct,
  selectHomePromoVideos,
} from "@/lib/boostAdControls";
import { cn } from "@/lib/utils";

type Mode = "one-plus-product" | "one-solo" | "two-videos" | "zero";
type Surface = "website" | "webview" | "native";

const MOCK_VIDEOS = [
  {
    id: 101,
    videoUrl: null as string | null,
    thumbnailUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80",
    title: "tshot for man",
    sellerName: "Chelot goat",
    boostEndAt: "2099-01-01T00:00:00.000Z",
    boostStartAt: "2026-11-10T00:00:00.000Z",
    createdAt: "2026-11-10T00:00:00.000Z",
  },
  {
    id: 102,
    videoUrl: null as string | null,
    thumbnailUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
    title: "Sneakers drop",
    sellerName: "Flexa Seller",
    boostEndAt: "2099-01-01T00:00:00.000Z",
    boostStartAt: "2026-11-09T00:00:00.000Z",
    createdAt: "2026-11-09T00:00:00.000Z",
  },
];

const MOCK_CATALOG = [
  {
    id: 101,
    title: "tshot for man",
    price: 25,
    currency: "USD",
    images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80"],
    location: "Port-au-Prince",
    city: "Port-au-Prince",
    country: "Haiti",
    condition: "new",
    isBoosted: true,
    isFeatured: true,
    status: "available",
    sellerName: "Chelot goat",
    sellerRating: 5,
    sellerIsVerified: true,
    favoriteCount: 4,
    createdAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: 202,
    title: "PlayStation 4 Console",
    price: 180,
    currency: "USD",
    images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&q=80"],
    location: "Port-au-Prince",
    city: "Port-au-Prince",
    country: "Haiti",
    condition: "good",
    isBoosted: false,
    isFeatured: true,
    status: "available",
    sellerName: "Game Hub",
    sellerRating: 4.8,
    sellerIsVerified: true,
    favoriteCount: 12,
    createdAt: "2026-11-02T00:00:00.000Z",
  },
] as const;

function WebsiteVideoCard(v: (typeof MOCK_VIDEOS)[number]) {
  return (
    <Link
      href={`/videos?video=${v.id}`}
      className="group relative block h-full min-h-[360px] w-full overflow-hidden rounded-2xl bg-black shadow-lg md:min-h-[420px]"
      style={{ textDecoration: "none" }}
      data-testid={`button-promo-video-${v.id}`}
      data-home-promo-video-card="true"
    >
      <PromoVideoPoster videoUrl={v.videoUrl} thumbnailUrl={v.thumbnailUrl} title={v.title} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/25" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/25">
          <Play className="h-5 w-5 fill-white text-white ml-0.5" />
        </div>
      </div>
      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-primary/80 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">
          <Video className="h-3 w-3" /> Video Promo
        </span>
        <span className="rounded-full border border-white/25 bg-black/35 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">
          Sponsored
        </span>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-3 pb-3">
        <p className="mb-1 truncate text-[10px] font-semibold text-white/70">@{v.sellerName}</p>
        <p className="line-clamp-2 text-sm font-black leading-tight text-white">{v.title}</p>
      </div>
    </Link>
  );
}

function NativeVideoCard(v: (typeof MOCK_VIDEOS)[number]) {
  return (
    <a
      href={`https://flexamarket.com/videos?video=${v.id}`}
      className="relative block overflow-hidden rounded-[14px] bg-slate-900"
      style={{ width: "100%", aspectRatio: "0.74", textDecoration: "none" }}
      data-testid={`native-promo-video-${v.id}`}
    >
      <img src={v.thumbnailUrl ?? ""} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/35">
          <Play className="h-5 w-5 fill-white text-white ml-0.5" />
        </div>
      </div>
      <div className="absolute left-2 top-2 flex gap-1">
        <span className="rounded-full bg-blue-600/85 px-2 py-0.5 text-[9px] font-extrabold uppercase text-white">Video Promo</span>
        <span className="rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-extrabold uppercase text-white">Sponsored</span>
      </div>
      <div className="absolute inset-x-2.5 bottom-2.5">
        <p className="text-[10px] font-semibold text-white/70">@{v.sellerName}</p>
        <p className="text-[13px] font-extrabold leading-tight text-white">{v.title}</p>
      </div>
    </a>
  );
}

function readParam<T extends string>(key: string, fallback: T, allowed: T[]): T {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export default function HomePromoCompanionPreview() {
  const [mode, setMode] = useState<Mode>(() =>
    readParam("mode", "one-plus-product", ["one-plus-product", "one-solo", "two-videos", "zero"]),
  );
  const [surface, setSurface] = useState<Surface>(() =>
    readParam("surface", "website", ["website", "webview", "native"]),
  );
  const hideControls =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("hideControls") === "1";

  const cards = useMemo(() => {
    if (mode === "zero") return selectHomePromoVideos([], HOME_PROMO_VIDEO_CARD_LIMIT);
    if (mode === "two-videos") return selectHomePromoVideos(MOCK_VIDEOS, HOME_PROMO_VIDEO_CARD_LIMIT);
    return selectHomePromoVideos(MOCK_VIDEOS.slice(0, 1), HOME_PROMO_VIDEO_CARD_LIMIT);
  }, [mode]);

  const companion = useMemo(() => {
    if (mode !== "one-plus-product" || cards.length !== 1) return null;
    return selectHomePromoCompanionProduct([...MOCK_CATALOG], {
      excludeListingIds: cards.map((v) => v.id),
      activeCountry: "Haiti",
    });
  }, [mode, cards]);

  const solo = cards.length === 1 && !companion && mode === "one-solo";

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] px-3 py-4"
      data-testid="home-promo-companion-preview"
      data-surface={surface}
      data-mode={mode}
    >
      <div className="mx-auto max-w-md space-y-3">
        {!hideControls && (
          <>
            <div className="flex flex-wrap gap-2">
              {(["website", "webview", "native"] as Surface[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSurface(s)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize",
                    surface === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 border",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["one-plus-product", "1 video + product"],
                  ["one-solo", "1 video solo"],
                  ["two-videos", "2 videos"],
                  ["zero", "0 videos"],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-bold",
                    mode === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 border",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              Surface: <strong>{surface}</strong> · Mode: <strong>{mode}</strong>
              {companion ? ` · companion #${companion.id}` : ""}
            </p>
          </>
        )}

        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No promo row (0 eligible videos) — Featured Products would start next.
          </div>
        ) : surface === "native" ? (
          <div
            className={cn(solo ? "flex justify-center" : "grid grid-cols-2 gap-3 items-start")}
            data-testid="home-promo-video-strip"
            data-promo-companion={companion ? String(companion.id) : "none"}
          >
            {solo ? (
              <div className="w-1/2" data-testid="home-promo-video-solo">
                <NativeVideoCard {...cards[0]} />
              </div>
            ) : (
              <>
                {cards.map((v) => (
                  <NativeVideoCard key={v.id} {...v} />
                ))}
                {companion && (
                  <div data-testid="home-promo-companion-product" className="min-w-0">
                    <ListingCard listing={companion as any} showAddToCart />
                  </div>
                )}
              </>
            )}
          </div>
        ) : solo ? (
          <div className="flex justify-center" data-testid="home-promo-video-solo">
            <div className="w-1/2 min-w-0">
              <WebsiteVideoCard {...cards[0]} />
            </div>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-2.5 sm:gap-3 items-start"
            data-testid="home-promo-video-strip"
            data-promo-companion={companion ? String(companion.id) : "none"}
          >
            {cards.map((v) => (
              <WebsiteVideoCard key={v.id} {...v} />
            ))}
            {companion && (
              <div className="min-w-0" data-testid="home-promo-companion-product">
                <ListingCard listing={companion as any} priority showAddToCart />
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <h2 className="mb-3 text-base font-bold text-slate-900">Featured Products</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {MOCK_CATALOG.map((listing) => (
              <ListingCard key={listing.id} listing={listing as any} showAddToCart />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
