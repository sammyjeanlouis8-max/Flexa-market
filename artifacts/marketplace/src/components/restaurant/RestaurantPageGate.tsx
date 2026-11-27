import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { authPathWithNext } from "@/lib/authIntent";
import { canAccessRestaurant, RESTAURANT_PUBLIC_LAUNCH } from "@/lib/restaurantAccess";

/**
 * Flexa Restaurant access gate.
 * While RESTAURANT_PUBLIC_LAUNCH is false, only Super Admin / Admin / Moderator may enter.
 * Owner routes also require authentication.
 */
export function RestaurantPageGate({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [pathname, setLocation] = useLocation();
  const redirected = useRef(false);
  const needsAuth = requireAuth || !RESTAURANT_PUBLIC_LAUNCH;
  const allowed = canAccessRestaurant(user as any);

  useEffect(() => {
    if (isLoading || redirected.current) return;
    if (needsAuth && !user) {
      const rawPath = `${window.location.pathname}${window.location.search || ""}`;
      const intended =
        rawPath.startsWith("/restaurant")
          ? rawPath
          : pathname.startsWith("/restaurant")
            ? pathname
            : "/restaurant/owner";
      redirected.current = true;
      setLocation(authPathWithNext("/auth/login", intended));
      return;
    }
    if (user && !allowed) {
      redirected.current = true;
      setLocation("/");
    }
  }, [needsAuth, isLoading, user, allowed, pathname, setLocation]);

  if (isLoading || (needsAuth && !user)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground" data-testid="restaurant-staff-only">
        {t("restaurant.staffPreviewOnly", {
          defaultValue: "Flexa Restaurant is in Super Admin preview and is not publicly available yet.",
        })}
      </div>
    );
  }

  return <>{children}</>;
}
