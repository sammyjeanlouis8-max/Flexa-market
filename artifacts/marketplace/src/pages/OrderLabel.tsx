import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Printer, ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { OrderLabelDocument } from "@/components/OrderLabelDocument";
import { completeLabelAddress, type LabelAddress, type OrderLabelData } from "@/lib/order-label";

export default function OrderLabel() {
  const [, params] = useRoute("/orders/:id/label");
  const orderId = parseInt(params?.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { user, token, isLoading } = useAuth();
  const { t } = useTranslation();
  const [label, setLabel] = useState<OrderLabelData | null>(null);
  const [sender, setSender] = useState<LabelAddress>({ name: "", phone: "", street: "", city: "", region: "", zip: "", country: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(null); setError(null);
    if (!user) { if (!isLoading) setLocation(`/auth/login?next=${encodeURIComponent(`/orders/${orderId}/label`)}`); return; }
    if (!token || isLoading) return;
    if (!Number.isSafeInteger(orderId) || orderId < 1) { setError(t("orderLabel.loadError")); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/label`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setError(t("orderLabel.loadError")); return; }
        const result = data as OrderLabelData;
        setLabel(result);
        setSender(result.shipFrom ?? {
          name: result.merchant.name, phone: result.merchant.phone, street: "", city: "",
          region: "", zip: "", country: result.shipTo.country,
        });
      } catch {
        if (!cancelled) setError(t("orderLabel.loadError"));
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, token, isLoading, orderId, setLocation, t]);

  const canPrint = !!label && completeLabelAddress(sender) && completeLabelAddress(label.shipTo);
  const handlePrint = () => { if (canPrint) window.print(); };

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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Toolbar – hidden on print */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/sales")} data-testid="button-back-sales">
          <ChevronLeft className="h-4 w-4 mr-1" /> {t("orderLabel.backToSales")}
        </Button>
        <div className="flex flex-wrap gap-2">
           <Button variant="outline" onClick={handlePrint} disabled={!canPrint} data-testid="button-save-pdf">
            <Download className="h-4 w-4 mr-1.5" /> {t("orderLabel.saveAsPdf")}
          </Button>
           <Button onClick={handlePrint} disabled={!canPrint} data-testid="button-print-now">
            <Printer className="h-4 w-4 mr-1.5" /> {t("orderLabel.printLabel")}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3 print:hidden">
        {t("orderLabel.printTip")}
      </p>
      <fieldset className="print:hidden border rounded-lg p-4 mb-4 space-y-3" data-testid="sender-print-form">
        <legend className="px-1 font-semibold text-sm">{t("orderLabel.senderDetails")}</legend>
        <p className="text-xs text-muted-foreground">{t("orderLabel.printOnly")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["name", "phone", "street", "city", "region", "zip", "country"] as const).map(field => (
            <label key={field} className={`text-xs font-medium ${field === "street" ? "sm:col-span-2" : ""}`}>
              {t(`orderLabel.${field === "name" ? "senderName" : field}`)}
              <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={sender[field] ?? ""} maxLength={field === "street" ? 180 : 100}
                required={["name", "street", "city", "country"].includes(field)}
                onChange={event => setSender(previous => ({ ...previous, [field]: event.target.value }))}
                data-testid={`input-sender-${field}`} />
            </label>
          ))}
        </div>
      </fieldset>
      {!completeLabelAddress(sender) && <p className="text-sm text-amber-700 mb-3 print:hidden" role="status">{t("orderLabel.senderRequired")}</p>}
      {!completeLabelAddress(label.shipTo) && <div className="text-sm text-destructive mb-3 print:hidden" role="alert">
        {t("orderLabel.recipientRequired")}{" "}
        <button className="underline" onClick={() => setLocation(`/orders/${orderId}`)}>{t("orderLabel.orderDetails")}</button>
      </div>}
      <OrderLabelDocument label={label} sender={sender} />
      <p id="label-print-error" className="hidden">{t("orderLabel.senderRequired")} {t("orderLabel.recipientRequired")}</p>

      {/* Print styles: clean A6 sticker, no UI chrome, no colors */}
      <style>{`
        .shipping-label { width: 100%; max-width: 480px; }
        @media print {
          @page { size: A6; margin: 5mm; }
          html, body { background: white !important; }
          body * { visibility: hidden !important; }
          #shipping-label, #shipping-label * { visibility: visible !important; }
          #shipping-label {
            position: absolute; left: 0; top: 0;
            width: 95mm; max-width: 100%;
            border: 2px solid #000 !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
          #shipping-label .label-section { padding: 2mm 3mm; }
          #shipping-label .text-2xl { font-size: 16pt; }
          #shipping-label .text-lg, #shipping-label .text-base { font-size: 11pt; }
          #shipping-label .text-sm { font-size: 9pt; }
          ${!canPrint ? "#shipping-label { display: none !important; } #label-print-error { display: block !important; visibility: visible !important; color: #000 !important; background: #fff !important; position: absolute; left: 0; top: 0; width: 95mm; font: 12pt sans-serif; z-index: 1000; }" : ""}
        }
      `}</style>
    </div>
  );
}
