import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { authPathWithNext } from "@/lib/authIntent";
import { canAccessWholesale, WHOLESALE_PUBLIC_LAUNCH } from "@/lib/wholesaleAccess";

/**
 * Flexa Wholesale access gate.
 * While WHOLESALE_PUBLIC_LAUNCH is false, only staff may enter.
 * Seller / favorites / inquiry routes also require authentication.
 */
export function WholesalePageGate({
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
  const needsAuth = requireAuth || !WHOLESALE_PUBLIC_LAUNCH;
  const allowed = canAccessWholesale(user);

  useEffect(() => {
    if (isLoading || redirected.current) return;
    if (needsAuth && !user) {
      const rawPath = `${window.location.pathname}${window.location.search || ""}`;
      const intended =
        rawPath.startsWith("/wholesale")
          ? rawPath
          : pathname.startsWith("/wholesale")
            ? pathname
            : "/wholesale";
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
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground" data-testid="wholesale-staff-only">
        {t("wholesale.staffPreviewOnly", {
          defaultValue: "Flexa Wholesale is in staff preview only and is not publicly available yet.",
        })}
      </div>
    );
  }

  return <>{children}</>;
}
