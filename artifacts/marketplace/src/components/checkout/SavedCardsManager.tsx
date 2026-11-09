import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
};

export function SavedCardsManager({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { toast } = useToast();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setCards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/payment-methods", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setCards(Array.isArray(data.paymentMethods) ? data.paymentMethods : []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!token) return;
    setRemoving(id);
    try {
      const res = await fetch(`/api/stripe/payment-methods/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: data.error || t("checkout.removeCardFailed", { defaultValue: "Could not remove card" }),
          variant: "destructive",
        });
        return;
      }
      setCards((prev) => prev.filter((c) => c.id !== id));
      toast({ title: t("checkout.cardRemoved", { defaultValue: "Card removed" }) });
    } finally {
      setRemoving(null);
    }
  };

  if (!token) return null;

  return (
    <div className={className} data-testid="saved-cards-manager">
      <p className="text-sm font-bold text-slate-900 mb-2">
        {t("checkout.savedCards", { defaultValue: "Saved cards" })}
      </p>
      <p className="text-xs text-slate-500 mb-3">
        {t("checkout.savedCardsHint", {
          defaultValue: "Cards you chose to save at checkout. We never store full numbers or CVV.",
        })}
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading", { defaultValue: "Loading…" })}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">
          {t("checkout.noSavedCards", { defaultValue: "No saved cards yet." })}
        </p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
            >
              <CreditCard className="h-4 w-4 text-slate-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold capitalize">
                  {c.brand} ···· {c.last4}
                </p>
                {c.expMonth && c.expYear && (
                  <p className="text-[11px] text-slate-500">
                    {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={removing === c.id}
                onClick={() => void remove(c.id)}
                className="p-2 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"
                aria-label={t("checkout.removeCard", { defaultValue: "Remove card" })}
              >
                {removing === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
