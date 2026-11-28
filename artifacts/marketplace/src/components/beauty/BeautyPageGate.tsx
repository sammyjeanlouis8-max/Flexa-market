import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { authPathWithNext } from "@/lib/authIntent";
import { canAccessBeauty, BEAUTY_PUBLIC_LAUNCH } from "@/lib/beautyAccess";

/**
 * Séduire Beauty access gate.
 * While BEAUTY_PUBLIC_LAUNCH is false, only Super Admin may enter.
 * Owner / booking routes also require authentication.
 */
export function BeautyPageGate({
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
  const needsAuth = requireAuth || !BEAUTY_PUBLIC_LAUNCH;
  const allowed = canAccessBeauty(user as any);

  useEffect(() => {
    if (isLoading || redirected.current) return;
    if (needsAuth && !user) {
      const rawPath = `${window.location.pathname}${window.location.search || ""}`;
      const intended =
        rawPath.startsWith("/beauty")
          ? rawPath
          : pathname.startsWith("/beauty")
            ? pathname
            : "/beauty";
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
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground" data-testid="beauty-staff-only">
        {t("beauty.staffPreviewOnly", {
          defaultValue: "Séduire Beauty is in Super Admin preview only and is not publicly available yet.",
        })}
      </div>
    );
  }

  return <>{children}</>;
}
