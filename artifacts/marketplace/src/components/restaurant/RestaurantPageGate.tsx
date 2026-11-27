import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";

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
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!requireAuth || isLoading) return;
    if (!user) setLocation("/auth/login?next=/restaurant");
  }, [requireAuth, isLoading, user, setLocation]);

  if (requireAuth && (isLoading || !user)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return <>{children}</>;
}