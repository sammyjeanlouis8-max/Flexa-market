import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Star, Users, Copy, Share2, ArrowLeft, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getToken() {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}
async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  avatar: string | null;
  referralPoints: number;
  referralCount: number;
}

interface MyStats {
  referralLink: string | null;
  referralCode: string | null;
  referralPoints: number;
  referralCount: number;
  leaderboardRank: number;
  history: Array<{
    id: number;
    status: string;
    pointsAwarded: number;
    isFlagged: boolean;
    flagReason: string | null;
    createdAt: string;
    referredName: string;
  }>;
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="w-5 text-center text-sm font-bold text-muted-foreground">#{rank}</span>;
}

export default function Leaderboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: leaderboardData, isLoading: boardLoading } = useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["/api/referrals/leaderboard"],
    queryFn: () => apiGet("/api/referrals/leaderboard"),
  });

  const { data: myStats, isLoading: statsLoading } = useQuery<MyStats>({
    queryKey: ["/api/referrals/my-stats"],
    queryFn: () => apiGet("/api/referrals/my-stats"),
    enabled: !!user,
  });

  async function copyLink() {
    if (!myStats?.referralLink) return;
    try {
      await navigator.clipboard.writeText(myStats.referralLink);
      setCopied(true);
      toast({ title: t("referral.linkCopied"), duration: 2000 });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: myStats.referralLink, duration: 4000 });
    }
  }

  async function shareLink() {
    if (!myStats?.referralLink) return;
    if (navigator.share) {
      await navigator.share({ title: "FlexaMarket", text: t("referral.shareText"), url: myStats.referralLink });
    } else {
      copyLink();
    }
  }

  const leaderboard = leaderboardData?.leaderboard ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            {t("referral.leaderboardTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("referral.leaderboardSubtitle")}</p>
        </div>
      </div>

      {/* My Referral Dashboard (if logged in) */}
      {user && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              {t("referral.myDashboard")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {statsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : myStats ? (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-2xl font-bold text-primary">{myStats.referralPoints}</div>
                    <div className="text-xs text-muted-foreground">{t("referral.points")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-2xl font-bold text-emerald-600">{myStats.referralCount}</div>
                    <div className="text-xs text-muted-foreground">{t("referral.totalReferrals")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-2xl font-bold text-amber-600">#{myStats.leaderboardRank}</div>
                    <div className="text-xs text-muted-foreground">{t("referral.rank")}</div>
                  </div>
                </div>

                {/* Referral link */}
                {myStats.referralLink && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("referral.yourLink")}</p>
                    <div className="flex gap-2">
                      <code className="flex-1 bg-background rounded px-3 py-2 text-xs truncate border">
                        {myStats.referralLink}
                      </code>
                      <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
                        {copied ? <Star className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={shareLink} className="shrink-0">
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("referral.linkHint", { points: 10 })}</p>
                  </div>
                )}

                {/* History */}
                {myStats.history.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("referral.history")}</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {myStats.history.map(h => (
                        <div key={h.id} className="flex items-center justify-between bg-background rounded px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{h.referredName}</span>
                            {h.isFlagged && <Badge variant="destructive" className="text-[9px] px-1 h-4">⚠ {t("referral.flagged")}</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            {h.pointsAwarded > 0 && (
                              <span className="text-emerald-600 font-bold">+{h.pointsAwarded} pts</span>
                            )}
                            <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("referral.howItWorks")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-2"><span className="bg-primary text-primary-foreground rounded-full h-5 w-5 shrink-0 flex items-center justify-center text-xs font-bold">1</span>{t("referral.step1")}</li>
            <li className="flex gap-2"><span className="bg-primary text-primary-foreground rounded-full h-5 w-5 shrink-0 flex items-center justify-center text-xs font-bold">2</span>{t("referral.step2")}</li>
            <li className="flex gap-2"><span className="bg-primary text-primary-foreground rounded-full h-5 w-5 shrink-0 flex items-center justify-center text-xs font-bold">3</span>{t("referral.step3")}</li>
          </ol>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            {t("referral.topMerchants")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {boardLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t("referral.noLeaderboardYet")}
            </div>
          ) : (
            <div className="divide-y">
              {leaderboard.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 px-4 py-3 ${entry.rank <= 3 ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${user?.id === entry.id ? "bg-primary/5 border-l-4 border-primary" : ""}`}
                >
                  <RankIcon rank={entry.rank} />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={entry.avatar ?? undefined} />
                    <AvatarFallback className="text-xs">{entry.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {entry.name}
                      {user?.id === entry.id && <span className="ml-1 text-xs text-primary">({t("referral.you")})</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{entry.referralCount} {t("referral.referrals")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-primary">{entry.referralPoints}</div>
                    <div className="text-xs text-muted-foreground">{t("referral.pts")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
