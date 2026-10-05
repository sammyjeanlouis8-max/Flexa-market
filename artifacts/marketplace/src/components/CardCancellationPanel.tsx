import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCardCancellation, cancelPurchaseOrder } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";

export default function CardCancellationPanel({ orderId, onChanged }: { orderId: number; onChanged: () => Promise<void> }) {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["card-cancellation", orderId, user?.id], enabled: !!token,
    refetchInterval: 15000,
    queryFn: ({ signal }) => getCardCancellation(orderId, { signal, headers: { Authorization: `Bearer ${token}` } }),
  });
  const cancel = async () => {
    setBusy(true); setError("");
    try {
      await cancelPurchaseOrder(orderId, { headers: { Authorization: `Bearer ${token}` } });
      setConfirming(false); await Promise.all([query.refetch(), onChanged()]);
    } catch (e: any) { setError(e.message || t("cardCancellation.error")); }
    finally { setBusy(false); }
  };
  if (query.isError) return <div role="alert" className="rounded-xl border p-4 text-sm">
    {t("cardCancellation.error")} <Button size="sm" variant="outline" onClick={() => query.refetch()}>{t("cardCancellation.retry")}</Button>
  </div>;
  const data = query.data;
  if (!data?.eligible || (!data.canRequest && !data.request)) return null;
  return <section className="rounded-2xl border p-5 space-y-3" data-testid="card-cancellation-panel">
    <h3 className="font-bold">{t("cardCancellation.title")}</h3>
    <p className="text-sm">{t("cardCancellation.policy")}</p>
    {data.request && <>
      <p className="font-semibold">{t(`cardCancellation.${data.request.status}`)}</p>
      <p>{Number(data.request.amount).toFixed(2)} {data.request.currency}</p>
      <p className="text-xs text-muted-foreground">{t(data.request.status === "refunded" ? "cardCancellation.bankDelay" : "cardCancellation.held")}</p>
    </>}
    {data.canRequest && !confirming && <Button variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
      {t("cardCancellation.cancel")}
    </Button>}
    {data.canRequest && confirming && <div className="space-y-3">
      <p className="text-sm">{t("cardCancellation.confirm")}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={cancel}>{t(busy ? "cardCancellation.saving" : "cardCancellation.cancel")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>{t("cardCancellation.keep")}</Button>
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
