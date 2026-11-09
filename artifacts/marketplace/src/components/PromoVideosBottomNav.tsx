import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Home, Compass, Bookmark, UserRound, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

/**
 * Single bottom inset for the promo nav.
 * Uses max() — never sum — so iOS home-indicator and Android system-nav
 * do not double-count into an oversized black band.
 */
export const PROMO_NAV_SAFE_BOTTOM =
  "max(env(safe-area-inset-bottom, 0px), var(--flexa-android-bottom, 0px))";

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
 * Must NOT be nested inside an overflow:hidden / transformed ancestor that can
 * clip position:fixed descendants (WebKit). Parents should leave this as a
 * viewport-fixed sibling of the scroll surface.
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
      "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
      isActive ? "text-white" : "text-white/55",
    );

  return (
    <nav
      className={cn(
        // z-[70] sits above the immersive feed shell (z-60) and video overlays
        "pointer-events-auto fixed inset-x-0 bottom-0 z-[70] border-t border-white/10 bg-black lg:hidden",
        className,
      )}
      style={{
        // Border-box: height includes paddingBottom so the icon row stays fully
        // on-screen and the safe-area band is filled by this same black nav —
        // never by a separate overflowing black shell behind/over the icons.
        boxSizing: "border-box",
        height: PROMO_NAV_HEIGHT_CSS,
        paddingBottom: PROMO_NAV_SAFE_BOTTOM,
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      aria-label={t("nav.main", { defaultValue: "Main navigation" })}
      data-testid="promo-videos-bottom-nav"
    >
      <div
        className="grid h-[52px] w-full grid-cols-5 items-center px-1"
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

        {/* Center Add (+) — compact TikTok-inspired control, vertically centered */}
        <div className="relative flex min-h-[44px] items-center justify-center">
          <button
            type="button"
            onClick={handleAdd}
            className="relative flex h-11 w-11 items-center justify-center active:scale-95 transition-transform"
            aria-label={t("videoFeed.addBoost", { defaultValue: "Add promotional video" })}
            data-testid="nav-promo-add"
          >
            {/* Visual face ~46×42 with cyan/pink side accents; 44×44 touch target on the button */}
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
