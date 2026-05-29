import { useEffect } from "react";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGetFavorites, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import ListingCard from "@/components/ListingCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function Saved() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { data: favorites, isLoading } = useGetFavorites({ query: { enabled: !!user, queryKey: getGetFavoritesQueryKey() } });

  useEffect(() => { if (!user) setLocation("/auth/login"); }, [user]);

  return (
    <div className="w-full px-4 py-6">
      <h1 className="text-2xl font-extrabold text-foreground mb-6">{t("saved.title")}</h1>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-xl" />)}
        </div>
      ) : (favorites as any[])?.length === 0 ? (
        <div className="text-center py-20 bg-card border border-card-border rounded-xl">
          <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground">{t("saved.noItems")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("saved.heartHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {(favorites as any[])?.map((l: any) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}
    </div>
  );
}
