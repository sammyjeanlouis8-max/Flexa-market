import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGetFavorites, getGetFavoritesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import ListingCard from "@/components/ListingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function Saved() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { data: favorites, isLoading } = useGetFavorites({ query: { enabled: !!user, queryKey: getGetFavoritesQueryKey() } });

  useEffect(() => { if (!isLoading && !user) setLocation("/auth/login"); }, [user, isLoading]);

  return (
    <div className="w-full px-3 sm:px-4 py-4 sm:py-5">
      <h1 className="text-xl sm:text-2xl font-extrabold text-foreground mb-4">{t("saved.title")}</h1>
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
          {[...Array(10)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      ) : (favorites as any[])?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-card-border rounded-xl px-4">
          <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="font-semibold text-foreground">{t("saved.noItems")}</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">{t("saved.heartHint")}</p>
          <Button asChild size="sm">
            <Link href="/search">{t("saved.browse", "Browse listings")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
          {(favorites as any[])?.map((l: any) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}
    </div>
  );
}
