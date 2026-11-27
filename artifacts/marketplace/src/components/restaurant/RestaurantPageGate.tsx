import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { authPathWithNext } from "@/lib/authIntent";

/** Auth gate for owner-only restaurant routes; discover stays public when requireAuth is false. */
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

  useEffect(() => {
    if (!requireAuth || isLoading || user || redirected.current) return;
    const rawPath = `${window.location.pathname}${window.location.search || ""}`;
    const intended =
      rawPath.startsWith("/restaurant")
        ? rawPath
        : pathname.startsWith("/restaurant")
          ? pathname
          : "/restaurant/owner";
    redirected.current = true;
    setLocation(authPathWithNext("/auth/login", intended));
  }, [requireAuth, isLoading, user, pathname, setLocation]);

  if (requireAuth && (isLoading || !user)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return <>{children}</>;
}
