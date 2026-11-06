/**
 * DEV-ONLY visual preview of the premium checkout chrome.
 * Not used in production purchase flow — real checkout is PremiumCheckout.tsx.
 */
import { useState } from "react";
import {
  Ticket, MapPin, Truck, CreditCard, Lock, Check, Copy, Loader2,
  ShoppingBag, Package, Pencil, Plus, ChevronRight,
} from "lucide-react";
import CheckoutShell, { type CheckoutProgressStep } from "./CheckoutShell";

const STEPS: CheckoutProgressStep[] = [
  "promo", "address", "delivery", "payment", "review", "processing", "success", "confirmed",
];

export default function DevCheckoutPreview() {
  const [idx, setIdx] = useState(0);
  const step = STEPS[idx]!;

  return (
    <div>
      <div style={{ position: "fixed", top: 8, right: 8, zIndex: 9999, display: "flex", gap: 8 }}>
        <button type="button" className="fm-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setIdx(i => Math.max(0, i - 1))}>Prev</button>
        <button type="button" className="fm-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setIdx(i => Math.min(STEPS.length - 1, i + 1))}>Next · {step}</button>
      </div>

      {step === "promo" && (
        <CheckoutShell step="promo" onBack={() => {}} footer={<button type="button" className="fm-btn-primary" style={{ width: "100%" }}>Continue <ChevronRight className="h-4 w-4" /></button>}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="fm-checkout-title">Apply Promo Code</h1>
              <p className="fm-checkout-subtitle">Save more on your order. Optional.</p>
            </div>
            <div className="text-4xl" aria-hidden>🎁</div>
          </div>
          <div className="fm-glass" style={{ padding: 14 }}>
            <div className="fm-checkout-input-row">
              <div className="fm-checkout-field">
                <Ticket className="fm-checkout-field-icon h-4 w-4" />
                <input className="fm-checkout-input" placeholder="Enter promo code" readOnly />
              </div>
              <button type="button" className="fm-btn-apply">Apply</button>
            </div>
          </div>
          <div className="fm-glass" style={{ padding: 14 }}>
            <div className="fm-checkout-summary-row"><span>Product price (delivery not included)</span><strong>$4.00</strong></div>
          </div>
        </CheckoutShell>
      )}

      {step === "address" && (
        <CheckoutShell step="address" onBack={() => {}} footer={<button type="button" className="fm-btn-primary" style={{ width: "100%" }}>Continue <ChevronRight className="h-4 w-4" /></button>}>
          <h1 className="fm-checkout-title">Delivery Address</h1>
          <p className="fm-checkout-subtitle">Where should we deliver this order?</p>
          <button type="button" className="fm-option is-selected"><div className="fm-radio" /><div className="flex-1"><p className="font-bold text-sm">Home</p><p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>12 Rue Capois · Port-au-Prince</p></div></button>
          <button type="button" className="fm-option"><Plus className="h-5 w-5" style={{ color: "var(--ck-blue-2)" }} /><span className="font-bold text-sm">Add New Address</span></button>
        </CheckoutShell>
      )}

      {step === "delivery" && (
        <CheckoutShell step="delivery" onBack={() => {}} footer={<button type="button" className="fm-btn-primary" style={{ width: "100%" }}>Continue <ChevronRight className="h-4 w-4" /></button>}>
          <h1 className="fm-checkout-title">Delivery Method</h1>
          <p className="fm-checkout-subtitle">Choose how you want to receive your order.</p>
          <button type="button" className="fm-option is-selected"><div className="fm-radio" /><div className="flex-1"><div className="flex justify-between"><p className="font-bold text-sm">Standard Delivery</p><p className="font-black text-sm">$10.00</p></div></div></button>
          <button type="button" className="fm-option"><div className="fm-radio" /><div className="flex-1"><div className="flex justify-between"><p className="font-bold text-sm">Rapid Delivery</p><p className="font-black text-sm">$15.00</p></div></div></button>
          <div className="fm-glass space-y-2" style={{ padding: 14 }}>
            <div className="fm-checkout-summary-row"><span>Subtotal</span><strong>$4.00</strong></div>
            <div className="fm-checkout-summary-row"><span>Delivery fee</span><strong>$10.00</strong></div>
            <div className="fm-checkout-summary-row"><span className="fm-checkout-total">Total</span><strong className="fm-checkout-total">$14.00</strong></div>
          </div>
        </CheckoutShell>
      )}

      {step === "payment" && (
        <CheckoutShell step="payment" onBack={() => {}} footer={<button type="button" className="fm-btn-primary" style={{ width: "100%" }}>Continue to Review <ChevronRight className="h-4 w-4" /></button>}>
          <h1 className="fm-checkout-title">Payment Method</h1>
          <p className="fm-checkout-subtitle">Select one payment method for this purchase.</p>
          <button type="button" className="fm-option is-selected"><div className="fm-radio" /><div className="flex-1"><p className="font-bold text-sm">Stripe</p><p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>Pay securely using a credit or debit card through Stripe.</p></div></button>
          <button type="button" className="fm-option"><div className="fm-radio" /><div className="flex-1"><div className="flex justify-between"><p className="font-bold text-sm">FM Card</p><p className="text-xs font-bold" style={{ color: "#86efac" }}>Balance $50.00</p></div><p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>Pay using your available Flexa Market Card balance.</p></div></button>
          <div className="fm-glass" style={{ padding: 14 }}><div className="fm-checkout-summary-row"><span>Total to Pay</span><strong className="fm-checkout-total">$14.00</strong></div></div>
        </CheckoutShell>
      )}

      {step === "review" && (
        <CheckoutShell step="review" onBack={() => {}} footer={<button type="button" className="fm-btn-primary" style={{ width: "100%" }}><Lock className="h-4 w-4" /> Pay $14.00</button>}>
          <h1 className="fm-checkout-title">Review & Confirm</h1>
          <p className="fm-checkout-subtitle">Confirm your order before paying.</p>
          <div className="fm-glass flex gap-3" style={{ padding: 14 }}>
            <div className="w-16 h-16 rounded-xl bg-black/30 grid place-items-center"><Package className="h-7 w-7 opacity-40" /></div>
            <div className="flex-1"><p className="font-bold text-sm">Wireless Headphones</p><p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>Qty: 1</p><p className="font-black text-sm mt-1">$4.00</p></div>
          </div>
          {(["Delivery Address", "Delivery Method", "Payment Method"] as const).map(label => (
            <div key={label} className="fm-glass" style={{ padding: 14 }}>
              <div className="flex justify-between"><div><p className="text-[11px] font-bold uppercase" style={{ color: "var(--ck-muted)" }}>{label}</p><p className="text-sm mt-1 font-semibold">Selected</p></div><span className="text-xs font-bold inline-flex items-center gap-1" style={{ color: "var(--ck-blue-2)" }}><Pencil className="h-3 w-3" /> Edit</span></div>
            </div>
          ))}
        </CheckoutShell>
      )}

      {step === "processing" && (
        <CheckoutShell step="processing" hideProgress>
          <div className="fm-process-ring" aria-hidden><div className="fm-process-ring-inner"><CreditCard className="h-9 w-9" style={{ color: "var(--ck-blue-2)" }} /></div></div>
          <h1 className="fm-checkout-title" style={{ textAlign: "center", marginTop: 20 }}>Processing Payment</h1>
          <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>Please wait — do not close this page.</p>
          <div className="fm-glass space-y-3" style={{ padding: 16 }}>
            <div className="flex items-center gap-3 text-sm"><span className="w-5 h-5 rounded-full grid place-items-center" style={{ background: "rgba(34,197,94,0.25)", color: "#86efac" }}><Check className="h-3.5 w-3.5" /></span>Verifying payment</div>
            <div className="flex items-center gap-3 text-sm"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ck-blue-2)" }} />Confirming order</div>
            <div className="flex items-center gap-3 text-sm"><span className="w-5 h-5 rounded-full border border-white/20" />Finalizing purchase</div>
          </div>
        </CheckoutShell>
      )}

      {step === "success" && (
        <CheckoutShell step="success" hideProgress>
          <div className="fm-success-burst"><Check className="h-10 w-10 text-white" strokeWidth={3} /></div>
          <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>Payment Successful!</h1>
          <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>Your payment has been confirmed.</p>
          <div className="fm-glass space-y-3" style={{ padding: 16 }}>
            <div className="fm-checkout-summary-row"><span>Amount Paid</span><strong>$14.00</strong></div>
            <div className="fm-checkout-summary-row"><span>Payment Method</span><strong>Stripe</strong></div>
            <div className="fm-checkout-summary-row"><span>Transaction</span><strong>cs_test_…</strong></div>
          </div>
          <div className="space-y-2" style={{ marginTop: 8 }}>
            <button type="button" className="fm-btn-primary" style={{ width: "100%" }}>View Order</button>
            <button type="button" className="fm-btn-ghost" style={{ width: "100%" }}>Continue</button>
          </div>
        </CheckoutShell>
      )}

      {step === "confirmed" && (
        <CheckoutShell step="confirmed" hideProgress>
          <div style={{ textAlign: "center", fontSize: 56 }} aria-hidden>📦</div>
          <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>Order Confirmed!</h1>
          <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>Thank you for shopping on Flexa Market.</p>
          <div className="fm-glass flex items-center justify-between" style={{ padding: 14 }}>
            <div><p className="text-[11px] font-bold uppercase" style={{ color: "var(--ck-muted)" }}>Order Number</p><p className="font-black text-lg">FM-1024567</p></div>
            <Copy className="h-4 w-4" />
          </div>
          <div className="fm-glass" style={{ padding: 16 }}>
            <ul className="fm-timeline">
              <li className="fm-timeline-item is-done"><span className="fm-timeline-dot" /><div><p className="font-bold text-sm">Order Placed</p></div></li>
              <li className="fm-timeline-item"><span className="fm-timeline-dot" /><div><p className="font-bold text-sm">Preparing Your Order</p></div></li>
              <li className="fm-timeline-item"><span className="fm-timeline-dot" /><div><p className="font-bold text-sm">Out for Delivery</p></div></li>
              <li className="fm-timeline-item"><span className="fm-timeline-dot" /><div><p className="font-bold text-sm">Delivered</p></div></li>
            </ul>
          </div>
          <div className="space-y-2">
            <button type="button" className="fm-btn-primary" style={{ width: "100%" }}><MapPin className="h-4 w-4" /> Track Order</button>
            <button type="button" className="fm-btn-ghost" style={{ width: "100%" }}><ShoppingBag className="h-4 w-4" /> Continue Shopping</button>
          </div>
        </CheckoutShell>
      )}
    </div>
  );
}
