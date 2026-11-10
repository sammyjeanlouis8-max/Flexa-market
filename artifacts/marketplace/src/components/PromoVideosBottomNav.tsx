import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Home, Compass, Bookmark, UserRound, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

/**
 * Discover / Favorites: 34px floor so a white home-indicator strip ("ba blan")
 * cannot appear under the solid black bar when safe-area reports 0.
 *
 * Watch feed: NO 34px floor — a forced floor recreates the thick "ba nwa"
 * under transparent icons. Prefer real env()/--sab/--flexa-android-bottom only.
 */
export const PROMO_NAV_SAFE_BOTTOM_DISCOVER =
  "min(48px, max(34px, env(safe-area-inset-bottom, 0px), var(--sab, 0px), var(--flexa-android-bottom, 0px)))";

export const PROMO_NAV_SAFE_BOTTOM_WATCH =
  "min(48px, max(env(safe-area-inset-bottom, 0px), var(--sab, 0px), var(--flexa-android-bottom, 0px)))";

/** @deprecated Prefer PROMO_NAV_SAFE_BOTTOM_DISCOVER / _WATCH */
export const PROMO_NAV_SAFE_BOTTOM = PROMO_NAV_SAFE_BOTTOM_DISCOVER;

/** Compact content row (icons + labels). */
export const PROMO_NAV_CONTENT_PX = 52;

export const PROMO_NAV_HEIGHT_CSS = `calc(${PROMO_NAV_CONTENT_PX}px + ${PROMO_NAV_SAFE_BOTTOM_DISCOVER})`;

type ActiveTab = "home" | "discover" | "add" | "favorites" | "profile";

function resolveActive(pathname: string): ActiveTab {
  if (pathname.startsWith("/videos/favorites")) return "favorites";
  if (pathname.startsWith("/videos/watch")) return "discover";
  if (pathname === "/videos" || pathname.startsWith("/videos?")) return "discover";
  if (pathname.startsWith("/profile") || pathname.startsWith("/settings") || pathname.startsWith("/account")) {
    return "profile";
  }
  if (pathname === "/" || pathname.startsWith("/?")) return "home";
  return "discover";
}

/**
 * Promotional Videos bottom nav.
 *
 * Watch feed (/videos/watch): TRANSPARENT overlay — video stays edge-to-edge
 * behind the icons and through the home-indicator zone (TikTok / mockup).
 * A solid black bar here is exactly the "ba nwa" cutting the video.
 *
 * Discover / Favorites: solid black bar (no fullscreen video behind).
 */
export default function PromoVideosBottomNav({
  active,
  onAdd,
  className,
  immersive,
}: {
  active?: ActiveTab;
  onAdd?: () => void;
  className?: string;
  /** Force watch-feed transparent mode (VideoFeed should pass true). */
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const current = active ?? resolveActive(location);
  const path = (location.split("?")[0] || location).replace(/\/$/, "") || "/";
  const isWatchFeed =
    immersive === true
    || path === "/videos/watch"
    || path.startsWith("/videos/watch/");

  const goLogin = (next: string) => {
    navigate(`/auth/login?next=${encodeURIComponent(next)}`);
  };

  const handleAdd = () => {
    if (onAdd) {
      onAdd();
      return;
    }
    if (!user) {
      goLogin("/booster/create");
      return;
    }
    navigate("/booster/create");
  };

  const handleFavorites = () => {
    if (!user) {
      goLogin("/videos/favorites");
      return;
    }
    navigate("/videos/favorites");
  };

  const handleProfile = () => {
    if (!user) {
      goLogin("/settings");
      return;
    }
    navigate(`/profile/${user.id}`);
  };

  const itemClass = (isActive: boolean) =>
    cn(
      "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
      isWatchFeed && "drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]",
      isActive ? "text-white" : isWatchFeed ? "text-white/92" : "text-white/55",
    );

  return (
    <nav
      className={cn(
        "promo-videos-bottom-nav pointer-events-auto fixed inset-x-0 bottom-0 z-[70] lg:hidden",
        isWatchFeed ? "border-t-0" : "border-t border-white/10 bg-black",
        className,
      )}
      style={{
        // Watch: transparent + real safe-area only (no 34px floor, no dark
        // gradient) so the "ba nwa" slab cannot cut the promo video.
        // Discover: solid black with 34px floor against "ba blan".
        paddingBottom: isWatchFeed ? PROMO_NAV_SAFE_BOTTOM_WATCH : PROMO_NAV_SAFE_BOTTOM_DISCOVER,
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        backgroundColor: isWatchFeed ? "transparent" : "#000",
        backgroundImage: "none",
        boxShadow: "none",
        overflow: "visible",
      }}
      aria-label={t("nav.main", { defaultValue: "Main navigation" })}
      data-testid="promo-videos-bottom-nav"
      data-watch-transparent={isWatchFeed ? "true" : "false"}
    >
      <div
        className="grid w-full grid-cols-5 items-center px-1"
        style={{
          height: `${PROMO_NAV_CONTENT_PX}px`,
          minHeight: `${PROMO_NAV_CONTENT_PX}px`,
          maxHeight: `${PROMO_NAV_CONTENT_PX}px`,
          background: "transparent",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/")}
          className={itemClass(current === "home")}
          data-testid="nav-promo-home"
        >
          <Home className={cn("h-[22px] w-[22px]", current === "home" && "fill-white/15")} strokeWidth={current === "home" ? 2.4 : 1.9} />
          <span className={cn("text-[10px] leading-none", current === "home" ? "font-black" : "font-semibold")}>
            {t("nav.home")}
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/videos")}
          className={itemClass(current === "discover")}
          data-testid="nav-promo-discover"
          aria-current={current === "discover" ? "page" : undefined}
        >
          <Compass className={cn("h-[22px] w-[22px]", current === "discover" && "fill-white/15")} strokeWidth={current === "discover" ? 2.4 : 1.9} />
          <span className={cn("text-[10px] leading-none", current === "discover" ? "font-black" : "font-semibold")}>
            {t("nav.discover")}
          </span>
        </button>

        <div className="relative flex h-full items-center justify-center">
          <button
            type="button"
            onClick={handleAdd}
            className="relative flex h-12 w-12 items-center justify-center active:scale-95 transition-transform"
            aria-label={t("videoFeed.addBoost", { defaultValue: "Add promotional video" })}
            data-testid="nav-promo-add"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-[calc(50%-26px)] top-1/2 h-[44px] w-[5px] -translate-y-1/2 rounded-l-[10px]"
              style={{ background: "#25F4EE" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-[calc(50%+21px)] top-1/2 h-[44px] w-[5px] -translate-y-1/2 rounded-r-[10px]"
              style={{ background: "#FE2C55" }}
            />
            <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              <Plus className="h-5 w-5" strokeWidth={2.75} />
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleFavorites}
          className={itemClass(current === "favorites")}
          data-testid="nav-promo-favorites"
          aria-current={current === "favorites" ? "page" : undefined}
        >
          <Bookmark className={cn("h-[22px] w-[22px]", current === "favorites" && "fill-white")} strokeWidth={current === "favorites" ? 2.4 : 1.9} />
          <span className={cn("text-[10px] leading-none", current === "favorites" ? "font-black" : "font-semibold")}>
            {t("nav.favorites", { defaultValue: "Favorites" })}
          </span>
        </button>

        <button
          type="button"
          onClick={handleProfile}
          className={itemClass(current === "profile")}
          data-testid="nav-promo-profile"
        >
          <UserRound className={cn("h-[22px] w-[22px]", current === "profile" && "fill-white/15")} strokeWidth={current === "profile" ? 2.4 : 1.9} />
          <span className={cn("text-[10px] leading-none", current === "profile" ? "font-black" : "font-semibold")}>
            {t("nav.profile")}
          </span>
        </button>
      </div>
    </nav>
  );
}
