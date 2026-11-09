import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Home, Compass, Bookmark, UserRound, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

/**
 * Single bottom inset for the promo nav.
 *
 * Prefer CSS env(); fall back to --sab (iOS / FlexaMarket WKWebView heuristic)
 * and --flexa-android-bottom. Always max() — never sum — so insets cannot stack
 * into an oversized black band that covers the tab icons.
 *
 * Cap at 48px: iPhone home-indicator is ~34px; Android gesture/nav bars are
 * typically ≤48px. Uncapped --sab/--sat mixups previously produced a tall
 * black slab over the buttons.
 */
export const PROMO_NAV_SAFE_BOTTOM =
  "min(48px, max(env(safe-area-inset-bottom, 0px), var(--sab, 0px), var(--flexa-android-bottom, 0px)))";

/** Compact content row (icons + labels). Safe-area lives in a sibling spacer. */
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
 * TikTok-style fixed bottom navigation for Promotional Videos.
 *
 * Layout (matches mockup):
 *   ┌─────────────────────────────┐
 *   │  Home Discover [+] Fav Me   │  ← 52px icon row (always fully visible)
 *   ├─────────────────────────────┤
 *   │     home-indicator spacer   │  ← safe-area only (black, never covers icons)
 *   └─────────────────────────────┘
 *
 * Root cause of the iPhone "ba nwa" covering buttons:
 * padding/height/box-shadow seals on one element let the safe-area band and
 * the icon row share a box that WebKit clipped or over-painted. Splitting the
 * icon row from the safe spacer makes covering impossible.
 */
export default function PromoVideosBottomNav({
  active,
  onAdd,
  className,
  immersive: _immersive,
}: {
  active?: ActiveTab;
  onAdd?: () => void;
  className?: string;
  /** Kept for callers; watch/discover/favorites all use the same solid mockup bar. */
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const current = active ?? resolveActive(location);

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
      isActive ? "text-white" : "text-white/55",
    );

  return (
    <nav
      className={cn(
        "promo-videos-bottom-nav pointer-events-auto fixed inset-x-0 bottom-0 z-[70] lg:hidden",
        "border-t border-white/10 bg-black",
        className,
      )}
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        // No paddingBottom on the nav itself — safe area is a sibling spacer
        // so the icon row can never be painted into / covered by that band.
        paddingBottom: 0,
        backgroundColor: "#000",
        backgroundImage: "none",
        boxShadow: "none",
        overflow: "visible",
      }}
      aria-label={t("nav.main", { defaultValue: "Main navigation" })}
      data-testid="promo-videos-bottom-nav"
    >
      {/* Icon row — fixed content height, never shares a box with safe-area padding */}
      <div
        className="grid w-full grid-cols-5 items-center px-1"
        style={{
          height: `${PROMO_NAV_CONTENT_PX}px`,
          minHeight: `${PROMO_NAV_CONTENT_PX}px`,
          maxHeight: `${PROMO_NAV_CONTENT_PX}px`,
          background: "#000",
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
            {/* Cyan / pink accents — match mockup (+) */}
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

      {/* Safe-area spacer BELOW icons — fills home-indicator zone with the same
          black as the bar. Cannot cover the icon row because it is a sibling
          underneath, not padding inside the icon box. */}
      <div
        aria-hidden
        className="pointer-events-none w-full bg-black"
        style={{
          height: PROMO_NAV_SAFE_BOTTOM,
          minHeight: 0,
          maxHeight: "48px",
          background: "#000",
        }}
      />
    </nav>
  );
}
