import { Link, useLocation } from "wouter";
import { Heart, MapPin, Zap, BadgeCheck, Crown, Play, Eye, ImageIcon, ShoppingCart, Star } from "lucide-react";
import { formatViewCount } from "@/hooks/useViewTracker";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { useCart } from "@/contexts/cart";
import { useAuthRequired } from "@/components/auth/AuthRequiredModal";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useAddFavorite, useRemoveFavorite, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFavorites } from "@/contexts/favorites";

import { COUNTRY_FLAGS } from "@/lib/countries";
import { formatPrice, useExchangeRate, htgToUsd, convertToUsd } from "@/lib/currency";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { listingImageProps } from "@/lib/listingImage";

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

function MosaicImageTile({
  src,
  alt,
  className,
  fallbackLabel,
  onLoad,
}: {
  src: string;
  alt: string;
  className: string;
  fallbackLabel: string;
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-primary/15 via-muted to-primary/5",
          className
        )}
        role="img"
        aria-label={fallbackLabel}
      >
        <ImageIcon className="h-6 w-6 text-primary/40" aria-hidden="true" />
      </div>
    );
  }

  const imgProps = listingImageProps({ variant: "mosaic" });
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      {...imgProps}
      onLoad={onLoad}
      onError={() => {
        setFailed(true);
        onLoad?.();
      }}
    />
  );
}

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
  mosaicLayout = false,
  previewFallbackImage,
  priority = false,
  showAddToCart = false,
}: {
  listing: Listing;
  compact?: boolean;
  /** When true, renders as a static card — no link navigation, no like/boost buttons */
  preview?: boolean;
  /** When true, renders up to 4 images in an adaptive grid mosaic instead of just the first image */
  mosaicLayout?: boolean;
  /** Backup image used only by editable listing previews when a draft/upload URL fails. */
  previewFallbackImage?: string;
  /** Prefer early load for above-the-fold / LCP cards on desktop Home. */
  priority?: boolean;
  /** Marketplace-style Add to Cart CTA (real cart only; no fake discounts). */
  showAddToCart?: boolean;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { requireAuth } = useAuthRequired();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addItem, isInCart } = useCart();
  const queryClient = useQueryClient();
  const { isFavorited, markFavorited, markUnfavorited } = useFavorites();
  const validImages = listing.images?.filter((img) => img && img.trim().length > 0) || [];
  const img = validImages[0] ?? null;
  const flag = listing.country ? COUNTRY_FLAGS[listing.country] : null;
  const displayLocation = listing.city ?? listing.location;
  const isOwner = user && listing.sellerId ? user.id === listing.sellerId : false;

  // Use context (persists across remounts) — fall back to listing.isFavorited for detail page
  const liked = isFavorited(listing.id) || (listing.isFavorited ?? false);
  const [likeCount, setLikeCount] = useState(listing.favoriteCount ?? 0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImgLoaded(false);
    setImageFailed(false);
  }, [img]);

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
    if (!user) {
      requireAuth({
        action: "favorite",
        next: `/listings/${listing.id}`,
        listingId: listing.id,
      });
      return;
    }
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
        {/* === IMAGE — single primary photo by default; mosaic opt-in only === */}
        <div className={cn("listing-card-media relative overflow-hidden bg-muted aspect-square")}>
          {validImages.length > 0 && !imageFailed ? (
            mosaicLayout && validImages.length > 1 ? (
              <div
                className="w-full h-full relative group-hover:scale-105 transition-transform duration-300 bg-white dark:bg-black"
                style={{
                  filter: imgLoaded ? "none" : "blur(6px)",
                  transition: "filter 0.3s ease, transform 0.3s ease",
                  transform: imgLoaded ? "scale(1)" : "scale(1.04)",
                }}
              >
                {validImages.length === 2 && (
                  <div className="flex w-full h-full gap-0.5">
                    <MosaicImageTile
                      src={validImages[0]}
                      alt={`${listing.title} 1`}
                      className="w-1/2 h-full object-cover"
                      fallbackLabel={t("sell.images")}
                      onLoad={() => setImgLoaded(true)}
                    />
                    <MosaicImageTile
                      src={validImages[1]}
                      alt={`${listing.title} 2`}
                      className="w-1/2 h-full object-cover"
                      fallbackLabel={t("sell.images")}
                    />
                  </div>
                )}
                {validImages.length === 3 && (
                  <div className="flex w-full h-full gap-0.5">
                    <div className="w-2/3 h-full">
                      <MosaicImageTile
                        src={validImages[0]}
                        alt={`${listing.title} 1`}
                        className="w-full h-full object-cover"
                        fallbackLabel={t("sell.images")}
                        onLoad={() => setImgLoaded(true)}
                      />
                    </div>
                    <div className="w-1/3 h-full flex flex-col gap-0.5">
                      <MosaicImageTile
                        src={validImages[1]}
                        alt={`${listing.title} 2`}
                        className="w-full h-1/2 object-cover"
                        fallbackLabel={t("sell.images")}
                      />
                      <MosaicImageTile
                        src={validImages[2]}
                        alt={`${listing.title} 3`}
                        className="w-full h-1/2 object-cover"
                        fallbackLabel={t("sell.images")}
                      />
                    </div>
                  </div>
                )}
                {validImages.length >= 4 && (
                  <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
                    {validImages.slice(0, 4).map((image, index) => (
                      <MosaicImageTile
                        key={`${image}-${index}`}
                        src={image}
                        alt={`${listing.title} ${index + 1}`}
                        className="w-full h-full object-cover"
                        fallbackLabel={t("sell.images")}
                        onLoad={index === 0 ? () => setImgLoaded(true) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <img
                src={img!}
                alt={listing.title}
                {...listingImageProps({ priority, variant: "card" })}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                style={{
                  filter: imgLoaded ? "none" : "blur(6px)",
                  transition: "filter 0.3s ease, transform 0.3s ease",
                  transform: imgLoaded ? "scale(1)" : "scale(1.04)",
                }}
                onLoad={() => setImgLoaded(true)}
                onError={(event) => {
                  if (previewFallbackImage && event.currentTarget.src !== new URL(previewFallbackImage, window.location.href).href) {
                    event.currentTarget.src = previewFallbackImage;
                    return;
                  }
                  setImgLoaded(true);
                  setImageFailed(true);
                }}
              />
            )
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-muted to-primary/5"
              role="img"
              aria-label={t("sell.images")}
            >
              <ImageIcon className="h-10 w-10 text-primary/45" aria-hidden="true" />
            </div>
          )}

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
            <div className={cn(
              "absolute top-2 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-sm leading-none",
              showAddToCart ? "left-2" : "right-2",
            )}>
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
              {listing.stockQuantity <= 2
                ? `⚠️ ${t("listing.stockLeft", { count: listing.stockQuantity, defaultValue: "{{count}} left" })}`
                : `📦 ${t("listing.stockLeft", { count: listing.stockQuantity, defaultValue: "{{count}} left" })}`}
            </div>
          )}

          {/* Photo count when multi-image listing (replaces busy mosaic collage) */}
          {!mosaicLayout && validImages.length > 1 && (
            <div className="absolute bottom-2 left-2 bg-black/65 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums">
              1/{validImages.length}
            </div>
          )}

          {/* Favorite/Like button — top-right for marketplace cards */}
          {!preview && !isOwner && (
            <button
              type="button"
              onClick={handleLike}
              className={cn(
                "absolute rounded-full shadow-md transition-all duration-200 active:scale-90",
                "flex items-center justify-center gap-1 min-h-9 min-w-9 px-2",
                showAddToCart ? "top-2 right-2" : "bottom-2 right-2",
                liked
                  ? "bg-red-500 text-white"
                  : "bg-black/60 backdrop-blur-sm text-white hover:bg-red-500"
              )}
              data-testid={`button-like-${listing.id}`}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart className={cn("h-3.5 w-3.5 transition-transform", liked && "fill-white scale-110")} />
              {!showAddToCart && likeCount > 0 && (
                <span className="text-[11px] font-bold leading-none">{likeCount}</span>
              )}
            </button>
          )}
        </div>

        {/* === INFO === */}
        <div className={cn("listing-card-info p-2.5", compact && "p-1.5")}>
          <p className={cn("listing-card-title text-foreground font-semibold line-clamp-2 leading-snug", compact ? "text-[11px]" : "text-xs sm:text-[13px]")}>
            {listing.title}
          </p>
          {/* Real seller rating only — never invent review counts */}
          {listing.sellerRating > 0 && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              <span className="font-semibold tabular-nums">{listing.sellerRating.toFixed(1)}</span>
            </div>
          )}
          <p className={cn("font-bold text-foreground tabular-nums leading-none mt-1.5", compact ? "text-[13px]" : "text-sm")}>
            {formatPrice(listing.price, listing.country, listing.currency)}
          </p>
          {usdEquivalent !== null && (
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              ≈ ${usdEquivalent!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </p>
          )}
          <div className="flex items-center gap-1 mt-1 text-muted-foreground min-w-0">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="text-[11px] font-medium truncate">{displayLocation}</span>
            {formatDistance(listing.distanceKm) && (
              <span className={cn(
                "text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded-full flex-shrink-0",
                listing.nearYou ? "bg-emerald-900/40 text-emerald-400" : "bg-muted text-muted-foreground"
              )}>
                {formatDistance(listing.distanceKm)}
              </span>
            )}
          </div>

          {/* Stock quantity row — visible for multi-stock listings that aren't sold */}
          {listing.status !== "sold" && listing.stockQuantity != null && (
            <div className={cn(
              "flex items-center gap-1 mt-1 text-[10px] font-bold rounded-md px-1.5 py-0.5 w-fit",
              listing.stockQuantity === 0
                ? "bg-red-100 dark:bg-red-950/40 text-red-500"
                : listing.stockQuantity <= 2
                ? "bg-red-100 dark:bg-red-950/40 text-red-500"
                : listing.stockQuantity <= 5
                ? "bg-orange-100 dark:bg-orange-950/30 text-orange-500"
                : "bg-muted text-muted-foreground"
            )}>
              {listing.stockQuantity} {t("search.available", { defaultValue: "available" })}
            </div>
          )}

          {!compact && (
            <div className="flex items-center justify-between mt-1.5 gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <Badge variant="secondary" className="text-[10px] capitalize truncate max-w-[7.5rem] rounded-md flex-shrink-0 font-semibold px-1.5 py-0">
                  {listing.subcategory ?? listing.condition.replace("_", " ")}
                </Badge>
                {listing.sellerIsVerified && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-1 py-0.5 text-[10px] font-bold flex-shrink-0" title={t("profile.verified")}>
                    <BadgeCheck className="h-3 w-3 fill-blue-500 text-white dark:text-blue-950" />
                    <span className="sr-only sm:not-sr-only sm:inline">{t("profile.verified")}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                {(listing.viewCount ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums">
                    <Eye className="h-3 w-3" />
                    {formatViewCount(listing.viewCount ?? 0)}
                  </span>
                )}
                {isOwner && likeCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
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
          {!preview && isOwner && listing.status !== "sold" && (!isAndroidApp() || listing.isBoosted) && (
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "listing-card-boost w-full mt-2 h-7 text-xs font-bold rounded-full border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-500 gap-1",
                listing.isBoosted && "border-green-400 text-green-500 hover:bg-green-50 hover:border-green-500 hover:text-green-700"
              )}
              onClick={handleBoostClick}
              data-testid={`button-boost-${listing.id}`}
            >
              <Zap className={cn("h-3 w-3", listing.isBoosted ? "fill-green-500" : "fill-amber-400")} />
              <span className="min-w-0">{listing.isBoosted ? t("buttons.boosted", { defaultValue: "Boosted ✓" }) : t("buttons.boost", { defaultValue: "Boost listing" })}</span>
            </Button>
          )}

          {/* Marketplace Add to Cart — uses real cart; disabled when sold/owner */}
          {showAddToCart && !preview && !isOwner && listing.status !== "sold" && (
            <Button
              size="sm"
              className="w-full mt-2.5 h-9 text-xs font-bold rounded-lg bg-[#F5A623] hover:bg-[#e09410] text-slate-900 gap-1.5 shadow-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!listing.sellerId) return;
                if (!user) {
                  requireAuth({
                    action: "addToCart",
                    next: `/listings/${listing.id}`,
                    listingId: listing.id,
                    sellerId: listing.sellerId,
                    title: listing.title,
                    price: listing.price,
                    currency: listing.currency ?? null,
                    image: listing.images?.[0] ?? null,
                    country: listing.country ?? null,
                    quantity: 1,
                  });
                  return;
                }
                if (isInCart(listing.id)) {
                  toast({ title: t("cart.alreadyInCart", { defaultValue: "Already in cart" }) });
                  return;
                }
                addItem({
                  listingId: listing.id,
                  title: listing.title,
                  price: listing.price,
                  currency: listing.currency ?? null,
                  image: listing.images?.[0] ?? null,
                  country: listing.country ?? null,
                  sellerId: listing.sellerId,
                  quantity: 1,
                });
                toast({ title: t("cart.added", { defaultValue: "Added to cart" }) });
              }}
              data-testid={`button-add-cart-${listing.id}`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {isInCart(listing.id)
                ? t("cart.inCart", { defaultValue: "In cart" })
                : t("cart.addToCart", { defaultValue: "Add to Cart" })}
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
