import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { canAccessWholesale } from "@/lib/wholesaleAccess";

/** Super Admin / public-launch gate shared by all wholesale routes. */
export function WholesalePageGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const allowed = canAccessWholesale(user);

  useEffect(() => {
    if (isLoading) return;
    if (!allowed) setLocation("/");
  }, [isLoading, allowed, setLocation]);

  if (isLoading || !allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return <>{children}</>;
}
