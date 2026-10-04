import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { createElement, useCallback } from "react";
import { useLocation } from "wouter";
import { ToastAction } from "@/components/ui/toast";

export function useRestriction() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const isExpired =
    !!user?.restrictedUntil && new Date(user.restrictedUntil) <= new Date();

  const isRestricted = !!user?.isRestricted && !isExpired;

  const restrictedUntil = user?.restrictedUntil
    ? new Date(user.restrictedUntil)
    : null;

  const showRestrictionToast = useCallback(() => {
    toast({
      title: t("restriction.title"),
      description: t("restriction.desc"),
      variant: "destructive",
      action: createElement(ToastAction, {
        altText: t("restriction.contactSupport"),
        onClick: () => setLocation("/support"),
      }, t("restriction.contactSupport")),
    });
  }, [toast, t, setLocation]);

  return { isRestricted, restrictedUntil, showRestrictionToast };
}
