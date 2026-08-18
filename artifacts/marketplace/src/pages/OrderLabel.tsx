import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Printer, ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";

type Label = {
  orderId: number;
  orderRef: string;
  createdAt: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  listing: { id: number; title: string };
  merchant: { id: number; name: string; phone: string | null };
  buyer: { id: number; name: string | null };
  shipTo: {
    name: string | null;
    phone: string | null;
    email: string | null;
    street: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
  };
};

export default function OrderLabel() {
  const [, params] = useRoute("/orders/:id/label");
  const orderId = parseInt(params?.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [label, setLabel] = useState<Label | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { if (!isLoading) setLocation("/auth/login"); return null; }
    if (!orderId) { setError("Invalid order"); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/label`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError((data as any)?.error || "Could not load label"); return; }
        setLabel(data as Label);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => { cancelled = true; };
  }, [user, token, orderId, setLocation]);

  const handlePrint = () => window.print();

  if (!user) return null;

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-destructive font-semibold mb-3">{error}</p>
        <Button variant="outline" onClick={() => setLocation("/sales")}>{t("orderLabel.backToSales")}</Button>
      </div>
    );
  }

  if (!label) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-muted-foreground">{t("orderLabel.loadingLabel")}</div>;
  }

  const shipTo = label.shipTo;
  const addressLine = [shipTo.city, shipTo.region, shipTo.country].filter(Boolean).join(", ");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Toolbar – hidden on print */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/sales")} data-testid="button-back-sales">
          <ChevronLeft className="h-4 w-4 mr-1" /> {t("orderLabel.backToSales")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="button-save-pdf">
            <Download className="h-4 w-4 mr-1.5" /> {t("orderLabel.saveAsPdf")}
          </Button>
          <Button onClick={handlePrint} data-testid="button-print-now">
            <Printer className="h-4 w-4 mr-1.5" /> {t("orderLabel.printLabel")}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3 print:hidden">
        {t("orderLabel.printTip")}
      </p>

      {/* The actual printable label */}
      <div id="shipping-label" className="shipping-label bg-white text-black border-2 border-black rounded-md mx-auto" data-testid="shipping-label">
        {/* Header band */}
        <div className="flex items-center justify-between px-5 py-3 border-b-2 border-black bg-black text-white">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight">FLEXA MARKET</span>
            <span className="text-[10px] uppercase tracking-widest opacity-80">{t("orderLabel.shippingLabel")}</span>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest opacity-80">{t("orderLabel.order")}</div>
            <div className="font-mono font-bold">{label.orderRef}</div>
          </div>
        </div>

        {/* FROM */}
        <div className="px-5 py-3 border-b border-black/30">
          <div className="text-[10px] uppercase tracking-widest text-black/60 mb-0.5">From / Expéditeur</div>
          <div className="font-bold leading-tight">{label.merchant.name}</div>
          {label.merchant.phone && <div className="text-xs">Tel: {label.merchant.phone}</div>}
        </div>

        {/* SHIP TO – the dominant block */}
        <div className="px-5 py-5 border-b-2 border-black">
          <div className="text-[10px] uppercase tracking-widest text-black/60 mb-1">Ship To / Destinataire</div>
          <div className="text-2xl font-black leading-tight">{shipTo.name ?? "—"}</div>
          <div className="text-lg font-semibold leading-snug mt-1">{shipTo.street ?? "—"}</div>
          <div className="text-lg font-semibold leading-snug">{addressLine || "—"}</div>
          {shipTo.phone && (
            <div className="mt-2 text-base font-bold">📞 {shipTo.phone}</div>
          )}
          {shipTo.email && (
            <div className="text-xs text-black/70">{shipTo.email}</div>
          )}
        </div>

        {/* Item / payment summary */}
        <div className="grid grid-cols-2">
          <div className="px-5 py-3 border-r border-black/30">
            <div className="text-[10px] uppercase tracking-widest text-black/60">Item</div>
            <div className="font-semibold text-sm leading-tight line-clamp-2">{label.listing.title}</div>
          </div>
          <div className="px-5 py-3 text-right">
            <div className="text-[10px] uppercase tracking-widest text-black/60">Total Paid</div>
            <div className="font-black text-lg">
              {label.currency === "USD" ? "$" : ""}{label.amount.toFixed(2)} {label.currency !== "USD" ? label.currency : ""}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-black/60 mt-0.5 capitalize">via {label.paymentMethod}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t-2 border-black flex items-center justify-between text-[10px]">
          <span className="font-mono">{label.orderRef}</span>
          <span>{new Date(label.createdAt).toLocaleString()}</span>
          <span>flexamarket.com</span>
        </div>
      </div>

      {/* Print styles: clean A6 sticker, no UI chrome, no colors */}
      <style>{`
        .shipping-label { width: 100%; max-width: 480px; }
        @media print {
          @page { size: A6; margin: 8mm; }
          html, body { background: white !important; }
          body * { visibility: hidden !important; }
          #shipping-label, #shipping-label * { visibility: visible !important; }
          #shipping-label {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: none;
            border: 2px solid #000 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
