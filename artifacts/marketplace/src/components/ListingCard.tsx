import { Link, useLocation } from "wouter";
import { Heart, MapPin, Zap, BadgeCheck, Crown, Play, Eye } from "lucide-react";
import { formatViewCount } from "@/hooks/useViewTracker";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAddFavorite, useRemoveFavorite, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFavorites } from "@/contexts/favorites";

import { COUNTRY_FLAGS } from "@/lib/countries";
import { formatPrice, useExchangeRate, htgToUsd, convertToUsd } from "@/lib/currency";

type Listing = {
  id: number;
  title: string;
  price: number;
  currency?: "USD" | "HTG" | string | null;
  images: string[];
  location: string;
  city?: string | null;
  country?: string | null;
  condition: string;
  isBoosted: boolean;
  status: string;
  sellerName: string;
  sellerRating: number;
  sellerIsVerified: boolean;
  favoriteCount: number;
  isFavorited?: boolean;
  createdAt: string;
  categoryIcon?: string | null;
  subcategory?: string | null;
  sellerId?: number;
  distanceKm?: number | null;
  proximityLevel?: string | null;
  nearYou?: boolean;
  sellerSubscriptionPlan?: string | null;
  listingVideoUrl?: string | null;
  sharesCount?: number;
  viewCount?: number;
  stockQuantity?: number | null;
};

function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function ListingCard({
  listing,
  compact = false,
  preview = false,
}: {
  listing: Listing;
  compact?: boolean;
  /** When true, renders as a static card — no link navigation, no like/boost buttons */
  preview?: boolean;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isFavorited, markFavorited, markUnfavorited } = useFavorites();
  const img =
    listing.images?.[0] ??
    `https://placehold.co/400x300/f97316/white?text=${encodeURIComponent(listing.title.slice(0, 10))}`;
  const flag = listing.country ? COUNTRY_FLAGS[listing.country] : null;
  const displayLocation = listing.city ?? listing.location;
  const isOwner = user && listing.sellerId ? user.id === listing.sellerId : false;

  // Use context (persists across remounts) — fall back to listing.isFavorited for detail page
  const liked = isFavorited(listing.id) || (listing.isFavorited ?? false);
  const [likeCount, setLikeCount] = useState(listing.favoriteCount ?? 0);
  const [imgLoaded, setImgLoaded] = useState(false);

  const addFav = useAddFavorite();
  const removeFav = useRemoveFavorite();

  const isNonUsdListing = listing.currency === "HTG" || listing.currency === "DOP";
  const { data: exchangeRate } = useExchangeRate();
  const usdEquivalent = isNonUsdListing && exchangeRate
    ? convertToUsd(listing.price, listing.currency, exchangeRate)
    : null;

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { setLocation("/auth/login"); return; }
    if (isOwner) return;
    if (liked) {
      markUnfavorited(listing.id);
      setLikeCount(c => Math.max(0, c - 1));
      removeFav.mutate({ listingId: listing.id }, {
        onError: () => { markFavorited(listing.id); setLikeCount(c => c + 1); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }),
      });
    } else {
      markFavorited(listing.id);
      setLikeCount(c => c + 1);
      addFav.mutate({ listingId: listing.id }, {
        onError: () => { markUnfavorited(listing.id); setLikeCount(c => Math.max(0, c - 1)); },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }),
      });
    }
  };

  const handleBoostClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/boost/${listing.id}`);
  };

  const cardInner = (
      <div
        className={cn(
          "group bg-card border rounded-xl overflow-hidden transition-all duration-200 relative",
          !preview && "hover:-translate-y-0.5 cursor-pointer",
          listing.isBoosted
            ? "border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.4),0_4px_20px_rgba(251,191,36,0.35)] hover:shadow-[0_0_0_1px_rgba(251,191,36,0.6),0_6px_28px_rgba(251,191,36,0.5)]"
            : "border-border hover:shadow-md",
          compact && "text-sm"
        )}
        data-testid={`card-listing-${listing.id}`}
      >
        {/* === IMAGE === */}
        <div className={cn("relative overflow-hidden bg-muted", compact ? "aspect-square" : "aspect-[4/3]")}>
          <img
            src={img}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            style={{
              filter: imgLoaded ? "none" : "blur(6px)",
              transition: "filter 0.3s ease, transform 0.3s ease",
              transform: imgLoaded ? "scale(1)" : "scale(1.04)",
            }}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => {
              setImgLoaded(true);
              (e.target as HTMLImageElement).src = `https://placehold.co/400x300/f97316/white?text=No+Image`;
            }}
          />

          {/* SOLD overlay — dark gradient so white text is always readable */}
          {listing.status === "sold" && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: "linear-gradient(rgba(2,6,23,0.65), rgba(2,6,23,0.85))" }}>
              <span
                className="bg-white text-black font-bold px-3 py-1 rounded-full text-sm"
                style={{ textShadow: "none" }}
              >
                SOLD
              </span>
            </div>
          )}

          {/* VIP seller badge */}
          {listing.sellerSubscriptionPlan === "vip" && !listing.isBoosted && (
            <div className="absolute top-2 left-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-md"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
              <Crown className="h-2.5 w-2.5" /> VIP
            </div>
          )}

          {/* Boosted badge */}
          {listing.isBoosted && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              <Zap className="h-2.5 w-2.5" /> Featured
            </div>
          )}

          {/* Country flag — stronger backdrop for readability */}
          {flag && (
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-sm leading-none">
              {flag}
            </div>
          )}

          {/* Near You / distance badge */}
          {listing.nearYou && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md animate-pulse"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {t("home.nearYou", { defaultValue: "Near You" })}
            </div>
          )}

          {/* Category icon — stronger backdrop */}
          {listing.categoryIcon && !compact && (
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-sm leading-none">
              {listing.categoryIcon}
            </div>
          )}

          {/* Low-stock badge — bottom-left, only shown when no category icon or on compact */}
          {listing.status !== "sold" && listing.stockQuantity != null && listing.stockQuantity <= 5 && (compact || !listing.categoryIcon) && (
            <div className={cn(
              "absolute bottom-2 left-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md",
              listing.stockQuantity <= 2 ? "bg-red-500" : "bg-orange-500"
            )}>
              {listing.stockQuantity <= 2 ? `⚠️ ${listing.stockQuantity} rete` : `📦 ${listing.stockQuantity} rete`}
            </div>
          )}

          {/* Favorite/Like button — always visible, with count badge */}
          {!preview && !isOwner && (
            <button
              onClick={handleLike}
              className={cn(
                "absolute bottom-2 right-2 rounded-full shadow-md transition-all duration-200 active:scale-90",
                "flex items-center gap-1 px-2 py-1",
                liked
                  ? "bg-red-500 text-white"
                  : "bg-black/60 backdrop-blur-sm text-white hover:bg-red-500"
              )}
              data-testid={`button-like-${listing.id}`}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart className={cn("h-3.5 w-3.5 transition-transform", liked && "fill-white scale-110")} />
              {likeCount > 0 && (
                <span className="text-xs font-bold leading-none">{likeCount}</span>
              )}
            </button>
          )}
        </div>

        {/* === INFO === */}
        <div className={cn("p-2.5", compact && "p-2")}>
          <p className={cn("font-bold text-foreground", compact ? "text-sm" : "text-base")}>
            {formatPrice(listing.price, listing.country, listing.currency)}
          </p>
          {usdEquivalent !== null && (
            <p className="text-xs text-muted-foreground font-medium -mt-0.5">
              ≈ ${usdEquivalent!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </p>
          )}
          <p className={cn("text-foreground font-semibold mt-0.5 line-clamp-2 leading-tight", compact ? "text-xs" : "text-sm")}>
            {listing.title}
          </p>
          <div className="flex items-center gap-1 mt-1 text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="text-xs font-medium truncate">{displayLocation}</span>
            {formatDistance(listing.distanceKm) && (
              <span className={cn(
                "text-xs font-bold ml-auto px-1.5 py-0.5 rounded-full flex-shrink-0",
                listing.nearYou ? "bg-emerald-900/40 text-emerald-400" : "bg-muted text-muted-foreground"
              )}>
                {formatDistance(listing.distanceKm)}
              </span>
            )}
          </div>

          {/* Stock quantity row — visible for multi-stock listings that aren't sold */}
          {listing.status !== "sold" && listing.stockQuantity != null && (
            <div className={cn(
              "flex items-center gap-1 mt-1 text-xs font-bold rounded-full px-1.5 py-0.5 w-fit",
              listing.stockQuantity === 0
                ? "bg-red-100 dark:bg-red-950/40 text-red-500"
                : listing.stockQuantity <= 2
                ? "bg-red-100 dark:bg-red-950/40 text-red-500"
                : listing.stockQuantity <= 5
                ? "bg-orange-100 dark:bg-orange-950/30 text-orange-500"
                : "bg-muted text-muted-foreground"
            )}>
              {listing.stockQuantity <= 2 ? "⚠️" : "📦"} {listing.stockQuantity} disponib
            </div>
          )}

          {!compact && (
            <div className="flex items-center justify-between mt-2 gap-1">
              <div className="flex items-center gap-1 min-w-0 flex-wrap">
                <Badge variant="secondary" className="text-xs capitalize truncate max-w-[70%] rounded-full flex-shrink-0 font-semibold">
                  {listing.subcategory ?? listing.condition.replace("_", " ")}
                </Badge>
                {listing.sellerIsVerified && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-1.5 py-0.5 text-xs font-bold flex-shrink-0">
                    <BadgeCheck className="h-3 w-3 fill-blue-500 text-white dark:text-blue-950" />
                    {t("profile.verified")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                {/* View count — always visible when > 0 */}
                {(listing.viewCount ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" />
                    {formatViewCount(listing.viewCount ?? 0)}
                  </span>
                )}
                {/* Like count shown when owner (no floating button) */}
                {isOwner && likeCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3 w-3 fill-red-400 text-red-400" />
                    {likeCount}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* === WATCH VIDEO BUTTON (shown when listing has a video) === */}
          {!preview && listing.listingVideoUrl && !isOwner && (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2 h-7 text-xs font-bold rounded-full border-primary/40 text-primary hover:bg-primary/10 gap-1"
              onClick={e => { e.preventDefault(); e.stopPropagation(); setLocation(`/listings/${listing.id}/video`); }}
              data-testid={`button-watch-${listing.id}`}
            >
              <Play className="h-3 w-3 fill-primary" />
              Watch Video
            </Button>
          )}

          {/* === BOOST BUTTON (only shown to the listing owner) === */}
          {!preview && isOwner && listing.status !== "sold" && (
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "w-full mt-2 h-7 text-xs font-bold rounded-full border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-500 gap-1",
                listing.isBoosted && "border-green-400 text-green-500 hover:bg-green-50 hover:border-green-500 hover:text-green-700"
              )}
              onClick={handleBoostClick}
              data-testid={`button-boost-${listing.id}`}
            >
              <Zap className={cn("h-3 w-3", listing.isBoosted ? "fill-green-500" : "fill-amber-400")} />
              {listing.isBoosted ? t("buttons.boosted", { defaultValue: "Boosted ✓" }) : t("buttons.boost", { defaultValue: "Boost listing" })}
            </Button>
          )}
        </div>
      </div>
  );

  if (preview) {
    return <div>{cardInner}</div>;
  }

  return <Link href={`/listings/${listing.id}`}>{cardInner}</Link>;
}
