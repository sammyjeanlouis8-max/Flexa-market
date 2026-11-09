import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Home, Compass, Bookmark, UserRound, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

/** Covers iOS home-indicator AND Android WebViews that report safe-area-inset-bottom as 0. */
export const PROMO_NAV_SAFE_BOTTOM =
  "max(env(safe-area-inset-bottom, 0px), var(--flexa-android-bottom, 0px))";

export const PROMO_NAV_HEIGHT_CSS = `calc(58px + ${PROMO_NAV_SAFE_BOTTOM})`;

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
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 transition-colors",
      isActive ? "text-white" : "text-white/55",
    );

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/95 backdrop-blur-md lg:hidden",
        className,
      )}
      style={{
        height: PROMO_NAV_HEIGHT_CSS,
        paddingBottom: PROMO_NAV_SAFE_BOTTOM,
      }}
      aria-label={t("nav.main", { defaultValue: "Main navigation" })}
      data-testid="promo-videos-bottom-nav"
    >
      <div className="flex h-[58px] w-full items-end justify-around px-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          className={itemClass(current === "home")}
          data-testid="nav-promo-home"
        >
          <Home className={cn("h-[22px] w-[22px]", current === "home" && "fill-white/15")} strokeWidth={current === "home" ? 2.4 : 1.9} />
          <span className={cn("text-[9px] leading-none", current === "home" ? "font-black" : "font-semibold")}>
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
          <span className={cn("text-[9px] leading-none", current === "discover" ? "font-black" : "font-semibold")}>
            {t("nav.discover")}
          </span>
        </button>

        {/* Center Add (+) — TikTok-inspired layered button */}
        <div className="relative flex min-w-[72px] flex-1 items-end justify-center pb-1">
          <button
            type="button"
            onClick={handleAdd}
            className="relative -mt-4 flex h-11 w-[52px] items-center justify-center rounded-[11px] bg-white text-black shadow-[0_4px_16px_rgba(0,0,0,0.45)] active:scale-95 transition-transform"
            aria-label={t("videoFeed.addBoost", { defaultValue: "Add promotional video" })}
            data-testid="nav-promo-add"
          >
            {/* Cyan / magenta side slivers (TikTok create affordance) */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-[3px] top-1 bottom-1 w-[5px] rounded-l-[10px]"
              style={{ background: "#25F4EE" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-[3px] top-1 bottom-1 w-[5px] rounded-r-[10px]"
              style={{ background: "#FE2C55" }}
            />
            <span className="relative z-10 flex h-full w-[44px] items-center justify-center rounded-[9px] bg-white">
              <Plus className="h-7 w-7" strokeWidth={2.75} />
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
          <span className={cn("text-[9px] leading-none", current === "favorites" ? "font-black" : "font-semibold")}>
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
          <span className={cn("text-[9px] leading-none", current === "profile" ? "font-black" : "font-semibold")}>
            {t("nav.profile")}
          </span>
        </button>
      </div>
    </nav>
  );
}
