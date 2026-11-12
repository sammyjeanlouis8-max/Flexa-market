import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { ArrowLeft, Eye, EyeOff, Ban, Loader2, UserX, Package, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

interface BlockedUser {
  id: number;
  name: string;
  avatar: string | null;
  blockedAt: string | null;
}

interface HiddenListing {
  id: number;
  listingId: number;
  title: string;
  image: string | null;
  sellerId: number;
  sellerName: string | null;
  createdAt: string;
}

interface HiddenSeller {
  id: number;
  sellerId: number;
  sellerName: string;
  sellerAvatar: string | null;
  createdAt: string;
}

const PROFILE_VISIBILITY_KEY = "fm_privacy_profile_visible";
const ONLINE_STATUS_KEY = "fm_privacy_show_online";

export default function SettingsPrivacy() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [profileVisible, setProfileVisible] = useState(() => localStorage.getItem(PROFILE_VISIBILITY_KEY) !== "0");
  const [showOnline, setShowOnline] = useState(() => localStorage.getItem(ONLINE_STATUS_KEY) !== "0");
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [hiddenListings, setHiddenListings] = useState<HiddenListing[]>([]);
  const [hiddenSellers, setHiddenSellers] = useState<HiddenSeller[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [loadingHides, setLoadingHides] = useState(true);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);
  const [unhidingKey, setUnhidingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoadingBlocks(true);
    fetch("/api/users/me/blocks", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setBlocked(Array.isArray(data.blocks) ? data.blocks : []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setBlocked([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBlocks(false);
      });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoadingHides(true);
    fetch("/api/users/me/hides", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setHiddenListings(Array.isArray(data.listings) ? data.listings : []);
        setHiddenSellers(Array.isArray(data.sellers) ? data.sellers : []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setHiddenListings([]);
          setHiddenSellers([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHides(false);
      });
    return () => controller.abort();
  }, [token]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const toggleProfile = (on: boolean) => {
    setProfileVisible(on);
    localStorage.setItem(PROFILE_VISIBILITY_KEY, on ? "1" : "0");
    toast({ title: t("settings.preferenceSaved") });
  };

  const toggleOnline = (on: boolean) => {
    setShowOnline(on);
    localStorage.setItem(ONLINE_STATUS_KEY, on ? "1" : "0");
    toast({ title: t("settings.preferenceSaved") });
  };

  const unblock = async (id: number) => {
    if (!token) return;
    setUnblockingId(id);
    try {
      const res = await fetch(`/api/users/${id}/block`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
      setBlocked((prev) => prev.filter((b) => b.id !== id));
      toast({ title: t("accountCenter.userUnblocked") });
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally {
      setUnblockingId(null);
    }
  };

  const unhideListing = async (listingId: number) => {
    if (!token) return;
    const key = `listing:${listingId}`;
    setUnhidingKey(key);
    try {
      const res = await fetch(`/api/listings/${listingId}/hide`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
      setHiddenListings((prev) => prev.filter((h) => h.listingId !== listingId));
      toast({ title: t("safety.listingRestored", { defaultValue: "Product visible again" }) });
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally {
      setUnhidingKey(null);
    }
  };

  const unhideSeller = async (sellerId: number) => {
    if (!token) return;
    const key = `seller:${sellerId}`;
    setUnhidingKey(key);
    try {
      const res = await fetch(`/api/users/${sellerId}/hide-listings`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
      setHiddenSellers((prev) => prev.filter((h) => h.sellerId !== sellerId));
      toast({ title: t("safety.sellerRestored", { defaultValue: "Seller products visible again" }) });
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally {
      setUnhidingKey(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("settings.backToSettings")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{t("accountCenter.privacy")}</h1>
          <p className="text-xs text-muted-foreground">{t("accountCenter.privacySub")}</p>
        </div>
      </div>

      <Card className="rounded-2xl divide-y divide-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 flex items-center justify-center">
            {profileVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("accountCenter.profileVisibility")}</p>
            <p className="text-xs text-muted-foreground">{t("accountCenter.profileVisibilitySub")}</p>
          </div>
          <Switch checked={profileVisible} onCheckedChange={toggleProfile} aria-label={t("accountCenter.profileVisibility")} />
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 flex items-center justify-center">
            <Eye className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("accountCenter.onlineStatus")}</p>
            <p className="text-xs text-muted-foreground">{t("accountCenter.onlineStatusSub")}</p>
          </div>
          <Switch checked={showOnline} onCheckedChange={toggleOnline} aria-label={t("accountCenter.onlineStatus")} />
        </div>
      </Card>

      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
          <Ban className="h-3.5 w-3.5" />
          {t("accountCenter.blockedUsers")}
        </h2>
        <Card className="rounded-2xl overflow-hidden">
          {loadingBlocks ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("profile.loading")}
            </div>
          ) : blocked.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-muted-foreground">
              <UserX className="h-8 w-8 mx-auto mb-2 opacity-50" />
              {t("accountCenter.noBlockedUsers")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={b.avatar ?? undefined} alt="" />
                    <AvatarFallback>{b.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={unblockingId === b.id}
                    onClick={() => unblock(b.id)}
                  >
                    {unblockingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("accountCenter.unblock")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
          <EyeOff className="h-3.5 w-3.5" />
          {t("safety.hiddenProducts", { defaultValue: "Hidden products" })}
        </h2>
        <Card className="rounded-2xl overflow-hidden">
          {loadingHides ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("profile.loading")}
            </div>
          ) : hiddenListings.length === 0 && hiddenSellers.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              {t("safety.noHiddenProducts", { defaultValue: "You have not hidden any products." })}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {hiddenListings.map((h) => (
                <li key={`l-${h.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                    {h.image ? (
                      <img src={h.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{h.sellerName ?? ""}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={unhidingKey === `listing:${h.listingId}`}
                    onClick={() => void unhideListing(h.listingId)}
                  >
                    {unhidingKey === `listing:${h.listingId}`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : t("safety.unhide", { defaultValue: "Show again" })}
                  </Button>
                </li>
              ))}
              {hiddenSellers.map((h) => (
                <li key={`s-${h.id}`} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={h.sellerAvatar ?? undefined} alt="" />
                    <AvatarFallback><Store className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.sellerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("safety.hiddenSellerHint", { defaultValue: "All products from this seller" })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={unhidingKey === `seller:${h.sellerId}`}
                    onClick={() => void unhideSeller(h.sellerId)}
                  >
                    {unhidingKey === `seller:${h.sellerId}`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : t("safety.unhide", { defaultValue: "Show again" })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
