import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Home, Compass, Bookmark, UserRound, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

/**
 * Single bottom inset for the promo nav.
 * Prefer CSS env(); fall back to --sab (iOS WebView heuristic from index.html)
 * and --flexa-android-bottom (Android system nav). Use max() — never sum.
 */
export const PROMO_NAV_SAFE_BOTTOM =
  "max(env(safe-area-inset-bottom, 0px), var(--sab, 0px), var(--flexa-android-bottom, 0px))";

/** Compact content row (icons + labels). Safe-area padding is separate. */
export const PROMO_NAV_CONTENT_PX = 52;

export const PROMO_NAV_HEIGHT_CSS = `calc(${PROMO_NAV_CONTENT_PX}px + ${PROMO_NAV_SAFE_BOTTOM})`;

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
 * TikTok-inspired fixed bottom navigation for Promotional Videos.
 * Center (+) opens the existing Booster create flow — never a duplicate uploader.
 *
 * On the fullscreen watch feed the nav is transparent (no solid black slab under
 * the buttons — video stays edge-to-edge). Discover / Favorites keep a solid bar.
 */
export default function PromoVideosBottomNav({
  active,
  onAdd,
  className,
}: {
  active?: ActiveTab;
  onAdd?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const current = active ?? resolveActive(location);
  // Fullscreen player: kill the opaque black bar so video fills the home-indicator zone.
  const isWatchFeed = location.startsWith("/videos/watch");

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
      isWatchFeed && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]",
      isActive ? "text-white" : isWatchFeed ? "text-white/80" : "text-white/55",
    );

  return (
    <nav
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-0 z-[70] lg:hidden",
        isWatchFeed
          ? "border-t-0 bg-transparent"
          : "border-t border-white/10 bg-black",
        className,
      )}
      style={{
        // Do NOT set height on the nav — only pad the safe-area. Setting both
        // height + paddingBottom under border-box clipped the icon row (black
        // bar covering the lower half of Home/Discover/+ buttons).
        paddingBottom: PROMO_NAV_SAFE_BOTTOM,
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        background: isWatchFeed
          ? "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)"
          : undefined,
        overflow: "visible",
      }}
      aria-label={t("nav.main", { defaultValue: "Main navigation" })}
      data-testid="promo-videos-bottom-nav"
    >
      <div
        className="grid w-full grid-cols-5 items-center px-1"
        style={{ height: `${PROMO_NAV_CONTENT_PX}px` }}
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
            className="relative flex h-11 w-11 items-center justify-center active:scale-95 transition-transform"
            aria-label={t("videoFeed.addBoost", { defaultValue: "Add promotional video" })}
            data-testid="nav-promo-add"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-[calc(50%-25px)] top-1/2 h-[42px] w-[5px] -translate-y-1/2 rounded-l-[9px]"
              style={{ background: "#25F4EE" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-[calc(50%+20px)] top-1/2 h-[42px] w-[5px] -translate-y-1/2 rounded-r-[9px]"
              style={{ background: "#FE2C55" }}
            />
            <span className="relative z-10 flex h-[40px] w-[44px] items-center justify-center rounded-[9px] bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
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
