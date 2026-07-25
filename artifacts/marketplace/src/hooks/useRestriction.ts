import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useCallback } from "react";

export function useRestriction() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

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
    });
  }, [toast, t]);

  return { isRestricted, restrictedUntil, showRestrictionToast };
}
