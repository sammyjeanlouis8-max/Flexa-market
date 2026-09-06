import { useRoute, useLocation, Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { useTranslation } from "react-i18next";
import { Star, CheckCircle, MapPin, Package, UserPlus, UserMinus, Pencil, Globe, Calendar, ShoppingBag, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetUser, useGetUserListings, useGetUserReviews, useFollowUser, useUnfollowUser, getGetUserQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useQueryClient } from "@tanstack/react-query";
import ListingCard from "@/components/ListingCard";
import { AdminBlockButton } from "@/components/AdminBlockModal";

import { COUNTRY_FLAGS } from "@/lib/countries";

// ── Pickup schedule display ───────────────────────────────────────────────────
type PickupSlot = { day: number; openTime: string; closeTime: string };
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function PickupScheduleBadge({ schedule }: { schedule: PickupSlot[] }) {
  if (!schedule || schedule.length === 0) return null;
  // Group consecutive days with identical hours
  const sorted = [...schedule].sort((a, b) => a.day - b.day);
  const groups: { days: string[]; openTime: string; closeTime: string }[] = [];
  for (const slot of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.openTime === slot.openTime && last.closeTime === slot.closeTime) {
      last.days.push(DAY_SHORT[slot.day]);
    } else {
      groups.push({ days: [DAY_SHORT[slot.day]], openTime: slot.openTime, closeTime: slot.closeTime });
    }
  }

  return (
    <div className="flex items-start gap-1.5 mt-1.5 flex-wrap">
      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex flex-col gap-0.5">
        {groups.map((g, i) => (
          <span key={i} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {g.days.length === 1
                ? g.days[0]
                : `${g.days[0]}–${g.days[g.days.length - 1]}`}
            </span>
            {" · "}
            {fmt12(g.openTime)} – {fmt12(g.closeTime)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [, params] = useRoute("/profile/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const { user: me } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: profile, isLoading } = useGetUser(id, { query: { enabled: !!id, queryKey: getGetUserQueryKey(id) } });
  const { data: listings } = useGetUserListings(id, { query: { enabled: !!id, queryKey: ["user-listings", id] } });
  const { data: reviews } = useGetUserReviews(id, { query: { enabled: !!id, queryKey: ["user-reviews", id] } });

  const profileAny = profile as any;
  useSEO({
    title: profileAny?.displayName ? `${profileAny.displayName} — Profil Vandè` : "Profil Vandè",
    description: profileAny?.displayName
      ? `Gade profil ${profileAny.displayName} sou FLEXA MARKET — ${listings?.length ?? 0} annons aktif, achte sekirize ann Ayiti.`
      : undefined,
    path: id ? `/profile/${id}` : undefined,
  });

  const follow = useFollowUser();
  const unfollow = useUnfollowUser();

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">{t("profile.loading")}</div>;
  if (!profile) return <div className="text-center py-20 text-muted-foreground">{t("profile.notFound")}</div>;

  const p = profile as any;
  const isMe = me?.id === id;
  const isAdmin = !!(me as any)?.isAdmin || !!(me as any)?.isSuperAdmin;
  const flag = p.country ? COUNTRY_FLAGS[p.country] : null;
  const targetStatus: "active" | "restricted" | "banned" = p.isBanned ? "banned" : p.isRestricted ? "restricted" : "active";

  const toggleFollow = () => {
    if (!me) { setLocation("/auth/login"); return; }
    if (p.isFollowing) {
      unfollow.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) }) });
    } else {
      follow.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) }) });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20 flex-shrink-0">
            <AvatarImage src={p.avatar ?? undefined} />
            <AvatarFallback className="text-2xl font-black bg-primary text-primary-foreground">{p.name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-foreground leading-tight break-words">{p.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {p.isVerified && <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />}
              {p.isAdmin && <Badge variant="default" className="text-xs">Admin</Badge>}
            </div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`h-4 w-4 ${i < Math.round(p.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              ))}
              <span className="text-sm text-muted-foreground ml-1">({t("profile.reviewCount", { count: p.reviewCount })})</span>
            </div>

            {/* Country badge */}
            {p.country && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {flag} {p.country}
                </span>
                {p.isPhoneVerified && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <CheckCircle className="h-2.5 w-2.5" /> {t("profile.verified")}
                  </Badge>
                )}
              </div>
            )}

            {p.location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />{p.location}
              </div>
            )}
            {p.bio && <p className="text-sm text-foreground/80 mt-2">{p.bio}</p>}
            {p.pickupSchedule && Array.isArray(p.pickupSchedule) && p.pickupSchedule.length > 0 && (
              <PickupScheduleBadge schedule={p.pickupSchedule as PickupSlot[]} />
            )}
            <div className="flex gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
              <span><strong className="text-foreground">{p.listingCount}</strong> {t("profile.listings")}</span>
              <span><strong className="text-foreground">{p.followerCount}</strong> {t("profile.followers")}</span>
              <span><strong className="text-foreground">{p.followingCount}</strong> {t("profile.following")}</span>
              {(p.totalSales ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <strong className="text-foreground">{p.totalSales}</strong> {t("profile.totalSales")}
                </span>
              )}
            </div>
            {p.createdAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                {t("profile.memberSince")} {new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
              </div>
            )}

            {/* Action buttons — below stats, never competes with name for width */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {isMe ? (
                <Button variant="outline" size="sm" onClick={() => setLocation("/profile/edit")} data-testid="button-edit-profile">
                  <Pencil className="h-4 w-4 mr-1" /> {t("buttons.edit")}
                </Button>
              ) : (
                <>
                  <Button variant={p.isFollowing ? "outline" : "default"} size="sm" onClick={toggleFollow} disabled={follow.isPending || unfollow.isPending} data-testid="button-follow">
                    {p.isFollowing ? <><UserMinus className="h-4 w-4 mr-1" /> {t("profile.unfollow")}</> : <><UserPlus className="h-4 w-4 mr-1" /> {t("profile.follow")}</>}
                  </Button>
                  {isAdmin && !p.isAdmin && !p.isSuperAdmin && (
                    <AdminBlockButton
                      targetUserId={id}
                      targetUserName={p.name}
                      targetStatus={targetStatus}
                      onSuccess={() => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) })}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="listings">
        <TabsList className="mb-6">
          <TabsTrigger value="listings" data-testid="tab-listings">{t("profile.listings")} ({(listings as any[])?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="reviews" data-testid="tab-reviews">{t("profile.reviews")} ({(reviews as any[])?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="listings">
          {(listings as any[])?.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("profile.noListings")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(listings as any[])?.map((l: any) => (
                <div key={l.id} className="min-w-0">
                  <ListingCard listing={l} />
                  {me?.id === id && (l.status === "removed" || l.moderationStatus === "rejected") && (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                      <p className="font-semibold">Pwodwi sa a pa pibliye ankò.</p>
                      <p className="mt-0.5">
                        Rezon admin nan: {l.moderationReason || "Administratè a pa bay plis detay."}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="reviews">
          {(reviews as any[])?.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("profile.noReviews")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(reviews as any[])?.map((r: any) => (
                <div key={r.id} className="bg-card border border-border rounded-xl p-4" data-testid={`review-${r.id}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={r.reviewerAvatar} />
                      <AvatarFallback className="text-xs">{r.reviewerName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <Link href={`/profile/${r.reviewerId}`}>
                        <span className="font-semibold text-sm text-foreground hover:text-primary">{r.reviewerName}</span>
                      </Link>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`h-3 w-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                          ))}
                        </div>
                        {r.isVerifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                            <CheckCircle className="h-3 w-3" /> {t("profile.verifiedPurchase")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-foreground/80">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
