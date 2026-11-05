import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Crown, Eye, Heart, MapPin, Zap } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useFavorites } from "@/contexts/favorites";
import { useAddFavorite, useRemoveFavorite, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { isActivelyBoosted } from "@/lib/todaysDeals";

export type TodaysDealListing = {
  id: number;
  title: string;
  price: number;
  currency?: string | null;
  images: string[];
  location: string;
  city?: string | null;
  country?: string | null;
  condition?: string;
  isBoosted: boolean;
  boostExpiresAt?: string | null;
  isFeatured?: boolean;
  category?: string | null;
  subcategory?: string | null;
  favoriteCount?: number;
  viewCount?: number;
  sellerId?: number;
  isFavorited?: boolean;
};

/**
 * Vertical product card for the Today's Deals / Today's Picks two-column grid.
 * Badge rules: Boosted only when actively boosted; Featured only when isFeatured
 * and not boosted. Never invents views, likes, or promotional statuses.
 */
export default function TodaysDealCard({ listing }: { listing: TodaysDealListing }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isFavorited, markFavorited, markUnfavorited } = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const images = (listing.images ?? []).filter((img) => img && img.trim().length > 0);
  const image = images[0] ?? null;
  const place = listing.city || listing.location || "";
  const categoryLabel = listing.subcategory || listing.category || null;
  const activelyBoosted = isActivelyBoosted(listing);
  const showFeatured = !activelyBoosted && !!listing.isFeatured;
  const views = listing.viewCount ?? 0;
  const isOwner = user && listing.sellerId ? user.id === listing.sellerId : false;
  const liked = isFavorited(listing.id) || (listing.isFavorited ?? false);
  const [likeCount, setLikeCount] = useState(listing.favoriteCount ?? 0);

  useEffect(() => {
    setLikeCount(listing.favoriteCount ?? 0);
  }, [listing.favoriteCount, listing.id]);

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || isOwner) return;
    if (liked) {
      markUnfavorited(listing.id);
      setLikeCount((c) => Math.max(0, c - 1));
      removeFavorite.mutate({ listingId: listing.id }, {
        onError: () => {
          markFavorited(listing.id);
          setLikeCount((c) => c + 1);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }),
      });
    } else {
      markFavorited(listing.id);
      setLikeCount((c) => c + 1);
      addFavorite.mutate({ listingId: listing.id }, {
        onError: () => {
          markUnfavorited(listing.id);
          setLikeCount((c) => Math.max(0, c - 1));
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }),
      });
    }
  };

  return (
    <article
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm dark:bg-card"
      data-testid={`todays-deal-card-${listing.id}`}
      data-boosted={activelyBoosted ? "true" : "false"}
    >
      <Link
        href={`/listings/${listing.id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-muted"
      >
        {image ? (
          <img
            src={image}
            alt={listing.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            {t("home.noImage", { defaultValue: "No image" })}
          </div>
        )}

        {activelyBoosted && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow"
            data-testid="badge-boosted-overlay"
          >
            <Zap className="h-2.5 w-2.5 fill-white" />
            {t("home.boostedBadge", { defaultValue: "Boosted" })}
          </span>
        )}
        {showFeatured && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow"
            data-testid="badge-featured-overlay"
          >
            <Crown className="h-2.5 w-2.5" />
            {t("home.featuredBadge", { defaultValue: "Featured" })}
          </span>
        )}

        {!isOwner && user && (
          <button
            type="button"
            onClick={handleLike}
            className={cn(
              "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-colors",
              liked ? "bg-red-500 text-white" : "bg-black/55 text-white hover:bg-red-500",
            )}
            aria-label={liked ? "Unlike" : "Like"}
            data-testid={`todays-deal-like-${listing.id}`}
          >
            <Heart className={cn("h-3.5 w-3.5", liked && "fill-white")} />
          </button>
        )}

        {images.length > 1 && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
            1/{images.length}
          </span>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col p-2.5">
        <Link href={`/listings/${listing.id}`} className="min-w-0">
          <h3 className="line-clamp-2 text-[12px] font-bold leading-snug text-foreground sm:text-[13px]">
            {listing.title}
          </h3>
        </Link>
        <p className="mt-1 text-[15px] font-black tabular-nums text-foreground sm:text-base">
          {formatPrice(listing.price, listing.country, listing.currency)}
        </p>
        {place ? (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        ) : null}
        {categoryLabel ? (
          <span className="mt-1.5 inline-flex max-w-full self-start truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {categoryLabel}
          </span>
        ) : null}

        <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-2 mt-2">
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            <Eye className="h-3 w-3 shrink-0" />
            {views}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            <Heart className="h-3 w-3 shrink-0 fill-rose-500 text-rose-500" />
            {likeCount}
          </span>
          {activelyBoosted && (
            <span
              className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-emerald-500/70 bg-white px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-transparent"
              data-testid="badge-boosted-footer"
            >
              <Zap className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500" />
              {t("home.boostedBadge", { defaultValue: "Boosted" })}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
