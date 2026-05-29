import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Tag, CheckCircle, XCircle, Clock, ArrowLeftRight, Wifi, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useGetMyOffers, useAcceptOffer, useRejectOffer, useCounterOffer, useAcceptCounter,
  getGetMyOffersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Offer = {
  id: number; listingId: number; listingTitle: string; listingImage?: string | null;
  listingPrice?: number | null;
  buyerId: number; buyerName: string; buyerAvatar?: string | null;
  sellerId: number; sellerName?: string | null; sellerAvatar?: string | null;
  amount: number; counterAmount?: number | null; counterMessage?: string | null;
  status: string; message?: string | null; createdAt: string; updatedAt?: string | null;
};

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: t("offers.statusPending"), cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    accepted: { label: t("offers.statusAccepted"), cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    rejected: { label: t("offers.statusRejected"), cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
    counter: { label: t("offers.statusCounter"), cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${s.cls}`}>{s.label}</span>;
}

// ── Counter dialog (seller sends counter) ────────────────────────────────────
function CounterDialog({
  offer,
  open,
  onClose,
}: { offer: Offer; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const counter = useCounterOffer();
  const [amount, setAmount] = useState(String(offer.amount));
  const [msg, setMsg] = useState("");

  const handleSend = () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast({ title: t("errors.somethingWrong"), variant: "destructive" }); return; }
    counter.mutate(
      { id: offer.id, data: { counterAmount: num, counterMessage: msg.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: t("offers.counterSent") });
          queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() });
          onClose();
        },
        onError: (e: any) => toast({ title: e?.data?.error ?? t("errors.somethingWrong"), variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("offers.counterOffer")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("offers.originalOffer")}</p>
            <p className="text-2xl font-black text-primary">${offer.amount.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("offers.counterAmount")}</label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min={0.01}
              step={0.01}
              autoFocus={false}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("offers.counterMessage")}</label>
            <Textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder={t("offers.counterMessage")}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>{t("buttons.cancel")}</Button>
          <Button onClick={handleSend} disabled={counter.isPending}>
            {counter.isPending ? t("offers.loading") : t("offers.sendCounter")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Offer card ───────────────────────────────────────────────────────────────
function OfferCard({ offer, isSent, userId }: { offer: Offer; isSent: boolean; userId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const acceptCtr = useAcceptCounter();
  const [counterOpen, setCounterOpen] = useState(false);

  const isSellerView = !isSent; // seller sees received tab
  const isBuyerView = isSent;   // buyer sees sent tab

  const handleAccept = () =>
    accept.mutate({ id: offer.id }, {
      onSuccess: () => { toast({ title: t("offers.accepted") }); queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() }); },
      onError: (e: any) => toast({ title: e?.data?.error ?? t("errors.somethingWrong"), variant: "destructive" }),
    });

  const handleReject = () =>
    reject.mutate({ id: offer.id }, {
      onSuccess: () => { toast({ title: t("offers.rejected") }); queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() }); },
      onError: (e: any) => toast({ title: e?.data?.error ?? t("errors.somethingWrong"), variant: "destructive" }),
    });

  const handleAcceptCounter = () =>
    acceptCtr.mutate({ id: offer.id }, {
      onSuccess: () => { toast({ title: t("offers.counterAccepted") }); queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() }); },
      onError: (e: any) => toast({ title: e?.data?.error ?? t("errors.somethingWrong"), variant: "destructive" }),
    });

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm" data-testid={`offer-card-${offer.id}`}>
        {/* Header: image + title + status */}
        <div className="flex items-start gap-3">
          {offer.listingImage && (
            <img src={offer.listingImage} alt="" className="h-16 w-16 object-cover rounded-xl flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <Link href={`/listings/${offer.listingId}`}>
              <p className="font-bold text-foreground hover:text-primary truncate">{offer.listingTitle}</p>
            </Link>
            {offer.listingPrice != null && (
              <p className="text-xs text-muted-foreground">{t("offer.listedPrice")}: ${offer.listingPrice.toFixed(2)}</p>
            )}
            {/* Other party info */}
            <div className="flex items-center gap-1.5 mt-1">
              <Avatar className="h-5 w-5">
                <AvatarImage src={isSellerView ? offer.buyerAvatar ?? undefined : offer.sellerAvatar ?? undefined} />
                <AvatarFallback className="text-xs">
                  {isSellerView ? (offer.buyerName?.[0] ?? "?") : (offer.sellerName?.[0] ?? "?")}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">
                {isSellerView
                  ? t("offers.offerFrom", { name: offer.buyerName })
                  : offer.sellerName}
              </span>
            </div>
          </div>
          <StatusBadge status={offer.status} />
        </div>

        {/* Buyer's original message */}
        {offer.message && (
          <p className="text-sm text-muted-foreground bg-muted rounded-xl px-3 py-2">{offer.message}</p>
        )}

        {/* Price thread */}
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("offers.originalOffer")}</span>
            <span className="text-lg font-black text-primary">${offer.amount.toFixed(2)}</span>
          </div>
          {offer.status === "counter" && offer.counterAmount != null && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{t("offers.counterProposal")}</span>
              <span className="text-lg font-black text-blue-700 dark:text-blue-300">${offer.counterAmount.toFixed(2)}</span>
            </div>
          )}
          {(offer.status === "accepted") && offer.counterAmount != null && (
            <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
              <span className="text-xs font-medium text-green-700 dark:text-green-300">{t("offers.agreedPrice")}</span>
              <span className="text-lg font-black text-green-700 dark:text-green-300">${offer.amount.toFixed(2)}</span>
            </div>
          )}
          {offer.counterMessage && (
            <p className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2 italic">
              "{offer.counterMessage}"
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {/* Seller actions on pending offer */}
          {isSellerView && offer.status === "pending" && (
            <>
              <Button size="sm" variant="outline" onClick={handleReject} disabled={reject.isPending} className="flex-1" data-testid={`button-reject-${offer.id}`}>
                <XCircle className="h-4 w-4 mr-1.5" /> {t("offers.reject")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCounterOpen(true)} className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300" data-testid={`button-counter-${offer.id}`}>
                <ArrowLeftRight className="h-4 w-4 mr-1.5" /> {t("offers.counter")}
              </Button>
              <Button size="sm" onClick={handleAccept} disabled={accept.isPending} className="flex-1" data-testid={`button-accept-${offer.id}`}>
                <CheckCircle className="h-4 w-4 mr-1.5" /> {t("offers.accept")}
              </Button>
            </>
          )}
          {/* Buyer actions on counter offer */}
          {isBuyerView && offer.status === "counter" && (
            <>
              <Button size="sm" variant="outline" onClick={handleReject} disabled={reject.isPending} className="flex-1" data-testid={`button-reject-counter-${offer.id}`}>
                <XCircle className="h-4 w-4 mr-1.5" /> {t("offers.rejectCounter")}
              </Button>
              <Button size="sm" onClick={handleAcceptCounter} disabled={acceptCtr.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" data-testid={`button-accept-counter-${offer.id}`}>
                <CheckCircle className="h-4 w-4 mr-1.5" /> {t("offers.acceptCounter")}
              </Button>
            </>
          )}
          {/* Buyer pays after seller accepted their offer */}
          {isBuyerView && offer.status === "accepted" && offer.listingId && (
            <Link
              href={`/listings/${offer.listingId}?offerPay=${offer.id}&offerAmount=${offer.counterAmount ?? offer.amount}`}
              className="flex-1"
            >
              <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold" data-testid={`button-pay-now-${offer.id}`}>
                <CheckCircle className="h-4 w-4 mr-1.5" /> Peye kounye a · ${(offer.counterAmount ?? offer.amount).toFixed(2)}
              </Button>
            </Link>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-right">{new Date(offer.createdAt).toLocaleDateString()}</p>
      </div>

      {counterOpen && (
        <CounterDialog offer={offer} open={counterOpen} onClose={() => setCounterOpen(false)} />
      )}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Offers() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [liveActive, setLiveActive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const { data: offersData, isLoading } = useGetMyOffers({
    query: {
      enabled: !!user,
      queryKey: getGetMyOffersQueryKey(),
      // Fallback polling: refetch every 15s to catch any SSE gaps
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    },
  });

  useEffect(() => { if (!user) setLocation("/auth/login"); }, [user, setLocation]);

  // ── SSE: real-time offer updates ──
  useEffect(() => {
    if (!token) return;

    const connect = () => {
      const es = new EventSource(`/api/offers/stream?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.onopen = () => setLiveActive(true);
      es.onerror = () => { setLiveActive(false); es.close(); };

      // When any offer changes, invalidate and refetch immediately
      es.addEventListener("offer_created", () => {
        queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() });
      });
      es.addEventListener("offer_updated", () => {
        queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() });
      });
    };

    connect();
    return () => { esRef.current?.close(); setLiveActive(false); };
  }, [token, queryClient]);

  const sent: Offer[] = (offersData as any)?.sent ?? [];
  const received: Offer[] = (offersData as any)?.received ?? [];

  const pendingReceived = received.filter(o => o.status === "pending").length;
  const pendingSent = sent.filter(o => o.status === "counter").length; // counter offers waiting for buyer

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">{t("offers.title")}</h1>
        <div className="flex items-center gap-2">
          {liveActive && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-1 rounded-full">
              <Wifi className="h-3 w-3 animate-pulse" />
              {t("offers.liveUpdates")}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: getGetMyOffersQueryKey() })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="received">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="received" className="flex-1 gap-1.5" data-testid="tab-received">
            {t("offers.received")}
            {pendingReceived > 0 && (
              <Badge className="text-xs bg-primary text-primary-foreground">{pendingReceived}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1 gap-1.5" data-testid="tab-sent">
            {t("offers.sent")}
            {pendingSent > 0 && (
              <Badge className="text-xs bg-blue-600 text-white">{pendingSent}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">{t("offers.loading")}</p>
          ) : received.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-2xl">
              <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("offers.noReceived")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {received.map(o => (
                <OfferCard key={`${o.id}-${o.status}-${o.updatedAt}`} offer={o} isSent={false} userId={user?.id ?? 0} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sent">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">{t("offers.loading")}</p>
          ) : sent.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-2xl">
              <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("offers.noSent")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sent.map(o => (
                <OfferCard key={`${o.id}-${o.status}-${o.updatedAt}`} offer={o} isSent={true} userId={user?.id ?? 0} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
