import { useState } from "react";
import { CreditCard, Gift, MapPin, Ticket, Truck, Users, ChevronRight, ImageIcon } from "lucide-react";
import {
  CheckoutOutlineButton,
  CheckoutPrimaryButton,
  CheckoutStepper,
  GlassCard,
  PaymentSuccessPanel,
  ProcessingPaymentPanel,
  PromoHero,
  RadioDot,
} from "@/components/checkout/CheckoutPrimitives";
import { CheckoutProductBackdrop } from "@/components/checkout/CheckoutProductBackdrop";
import { cn } from "@/lib/utils";

type Step = "promo" | "address" | "delivery" | "select" | "review" | "processing" | "success";

const STEPS = [
  { key: "promo", num: 1, label: "Promo" },
  { key: "address", num: 2, label: "Address" },
  { key: "delivery", num: 3, label: "Delivery" },
  { key: "select", num: 4, label: "Payment" },
];

const PREVIEW_PRODUCTS = [
  { id: 1, title: "Wireless Headphones", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80", price: 4 },
  { id: 2, title: "Smart Watch", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80", price: 89 },
  { id: 3, title: "Sneakers", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80", price: 64 },
  { id: 4, title: "Camera Lens", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&q=80", price: 210 },
  { id: 5, title: "Backpack", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80", price: 42 },
  { id: 6, title: "Perfume", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&q=80", price: 55 },
  { id: 7, title: "Laptop Stand", image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&q=80", price: 28 },
  { id: 8, title: "Sunglasses", image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&q=80", price: 36 },
  { id: 9, title: "Coffee Maker", image: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=400&q=80", price: 72 },
  { id: 10, title: "Gaming Mouse", image: "https://images.unsplash.com/photo-1527814050087-3793815479db?w=400&q=80", price: 49 },
  { id: 11, title: "Plant Pot", image: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&q=80", price: 18 },
  { id: 12, title: "Desk Lamp", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400&q=80", price: 33 },
];

/**
 * Visual QA preview for the dark-glass Buy Now checkout redesign.
 * Route: /dev/checkout-redesign-preview
 */
export default function CheckoutRedesignPreview() {
  const [step, setStep] = useState<Step>("promo");
  const [promo, setPromo] = useState("FLEXA10");
  const [payMethod, setPayMethod] = useState<"stripe" | "wallet">("stripe");
  const [delivery, setDelivery] = useState<"standard" | "express">("standard");

  const subtotal = 4;
  const deliveryFee = delivery === "express" ? 7.99 : 3.99;
  const total = subtotal + deliveryFee;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712]">
      <CheckoutProductBackdrop items={PREVIEW_PRODUCTS} />
      <div className="relative z-10 px-3 py-6 flex flex-col items-center min-h-screen">
      <div className="w-full max-w-md mb-4 flex flex-wrap gap-2">
        {(["promo", "address", "delivery", "select", "review", "processing", "success"] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize backdrop-blur-md",
              step === s ? "bg-[#2F6BFF] text-white" : "bg-black/40 text-white/80 border border-white/10",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "fm-checkout-dark w-full max-w-md rounded-[1.35rem] p-4 max-h-[90vh] overflow-y-auto",
          "border border-[rgba(120,160,255,0.16)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
        )}
        data-testid="checkout-redesign-preview"
      >
        {step === "success" ? (
          <PaymentSuccessPanel
            amount={total.toFixed(2)}
            methodLabel="Stripe"
            transactionId="FM-1024567"
            onViewOrder={() => setStep("promo")}
            onContinue={() => setStep("promo")}
          />
        ) : step === "processing" ? (
          <ProcessingPaymentPanel verifyingDone confirmingActive />
        ) : (
          <>
            <CheckoutStepper current={step === "review" ? "select" : step} steps={STEPS} />

            {step === "promo" && (
              <div className="space-y-3">
                <PromoHero />
                <GlassCard className="p-3 space-y-2">
                  <p className="text-sm font-bold text-white">Do you have a promo code?</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Ticket className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8B9BB8]" />
                      <input
                        value={promo}
                        onChange={(e) => setPromo(e.target.value.toUpperCase())}
                        className="w-full h-10 pl-8 rounded-xl bg-white/5 border border-white/15 text-sm font-mono text-white"
                        placeholder="e.g. FLEXA10"
                      />
                    </div>
                    <button type="button" className="h-10 px-4 rounded-xl bg-[#2F6BFF] text-white text-sm font-bold">Apply</button>
                  </div>
                </GlassCard>
                {[
                  { code: "FLEXA10", badge: "10% OFF", desc: "10% on orders >$50", popular: true, color: "gold" },
                  { code: "LIVRES", badge: "$5 OFF", desc: "$5 off delivery", popular: false, color: "green" },
                  { code: "NEWUSER", badge: "15% OFF", desc: "15% — new users only", popular: false, color: "purple" },
                ].map((p) => (
                  <GlassCard key={p.code} onClick={() => setPromo(p.code)} className={cn("px-3 py-3", p.popular && "border-[#F5B942]/35")}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-black border",
                        p.color === "gold" && "bg-amber-500/15 text-amber-300 border-amber-400/25",
                        p.color === "green" && "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
                        p.color === "purple" && "bg-violet-500/15 text-violet-300 border-violet-400/25",
                      )}>{p.badge}</div>
                      <div className="flex-1"><p className="text-sm font-bold text-white">{p.code}</p><p className="text-[11px] text-[#8B9BB8]">{p.desc}</p></div>
                      <ChevronRight className="h-4 w-4 text-[#8B9BB8]" />
                    </div>
                  </GlassCard>
                ))}
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-amber-300" />
                  <p className="text-[11px] text-amber-200">Mandatory delivery fees are added at the Delivery step.</p>
                </div>
                <div className="flex items-end justify-between"><div><p className="text-[10px] text-[#8B9BB8]">Product price</p><p className="text-xl font-black text-white">${subtotal.toFixed(2)}</p></div></div>
                <CheckoutPrimaryButton onClick={() => setStep("address")}>Continue</CheckoutPrimaryButton>
              </div>
            )}

            {step === "address" && (
              <div className="space-y-3">
                <p className="text-base font-bold text-white">Delivery Address</p>
                <GlassCard selected className="p-3.5">
                  <div className="flex items-start gap-3">
                    <RadioDot selected />
                    <div className="flex-1">
                      <div className="flex justify-between"><p className="font-bold text-white">Home</p><span className="text-xs font-semibold text-[#4C8DFF]">Edit</span></div>
                      <p className="text-sm text-white/90 mt-0.5">Jean Pierre</p>
                      <p className="text-xs text-[#8B9BB8]">12 Rue des Miracles, Port-au-Prince</p>
                    </div>
                  </div>
                </GlassCard>
                <GlassCard className="p-3.5 opacity-70">
                  <div className="flex items-start gap-3"><RadioDot selected={false} /><div><p className="font-bold text-white">Work</p><p className="text-xs text-[#8B9BB8]">Not set</p></div></div>
                </GlassCard>
                <CheckoutOutlineButton><MapPin className="h-4 w-4" /> Add New Address</CheckoutOutlineButton>
                <CheckoutPrimaryButton onClick={() => setStep("delivery")}>Continue</CheckoutPrimaryButton>
              </div>
            )}

            {step === "delivery" && (
              <div className="space-y-3">
                <p className="text-base font-bold text-white">Delivery Method</p>
                <GlassCard selected={delivery === "standard"} onClick={() => setDelivery("standard")} className="px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <RadioDot selected={delivery === "standard"} />
                    <div className="flex-1"><p className="font-semibold text-white">Standard Delivery</p><p className="text-xs text-[#8B9BB8]">3–5 days</p></div>
                    <span className="font-bold text-[#4C8DFF]">$3.99</span>
                  </div>
                </GlassCard>
                <GlassCard selected={delivery === "express"} onClick={() => setDelivery("express")} className="px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <RadioDot selected={delivery === "express"} />
                    <div className="flex-1"><p className="font-semibold text-white">Express Delivery</p><p className="text-xs text-[#8B9BB8]">1–2 days</p></div>
                    <span className="font-bold text-white">$7.99</span>
                  </div>
                </GlassCard>
                <GlassCard className="p-3.5 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-[#8B9BB8]">Subtotal</span><span className="text-white">${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-[#8B9BB8]">Delivery Fee</span><span className="text-white">${deliveryFee.toFixed(2)}</span></div>
                  <div className="border-t border-white/10 pt-2 flex justify-between"><span className="font-bold text-white">Total</span><span className="text-xl font-black text-[#4C8DFF]">${total.toFixed(2)}</span></div>
                </GlassCard>
                <CheckoutPrimaryButton onClick={() => setStep("select")}>Continue</CheckoutPrimaryButton>
              </div>
            )}

            {step === "select" && (
              <div className="space-y-3">
                <p className="text-base font-bold text-white">Payment Method</p>
                <GlassCard selected={payMethod === "stripe"} onClick={() => setPayMethod("stripe")} className="p-4">
                  <div className="flex items-center gap-3">
                    <RadioDot selected={payMethod === "stripe"} />
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center"><CreditCard className="h-5 w-5 text-[#4C8DFF]" /></div>
                    <div><p className="font-semibold text-white">Stripe</p><p className="text-xs text-[#8B9BB8]">Card · Apple Pay · Google Pay</p></div>
                  </div>
                </GlassCard>
                <GlassCard selected={payMethod === "wallet"} onClick={() => setPayMethod("wallet")} className="p-4">
                  <div className="flex items-center gap-3">
                    <RadioDot selected={payMethod === "wallet"} />
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">💳</div>
                    <div><p className="font-semibold text-white">FM Card</p><span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">Balance: $50.00</span></div>
                  </div>
                </GlassCard>
                <div className="flex justify-between px-1"><span className="text-sm text-[#8B9BB8]">Total to Pay</span><span className="text-lg font-black text-white">${total.toFixed(2)}</span></div>
                <CheckoutPrimaryButton onClick={() => setStep("review")}>Continue to Review</CheckoutPrimaryButton>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-3">
                <p className="text-base font-bold text-white">Review & Confirm</p>
                <GlassCard className="p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center"><ImageIcon className="h-5 w-5 text-[#8B9BB8]" /></div>
                  <div className="flex-1"><p className="font-bold text-white text-sm">Wireless Headphones</p><p className="text-xs text-[#8B9BB8]">Qty: 1</p></div>
                  <p className="font-bold text-white">${subtotal.toFixed(2)}</p>
                </GlassCard>
                {[
                  { label: "Address", value: "Home · Port-au-Prince" },
                  { label: "Delivery", value: delivery === "express" ? "Express Delivery" : "Standard Delivery" },
                  { label: "Payment", value: payMethod === "wallet" ? "FM Card" : "Stripe" },
                ].map((row) => (
                  <GlassCard key={row.label} className="px-3.5 py-3 flex justify-between">
                    <div><p className="text-[10px] font-black uppercase text-[#8B9BB8]">{row.label}</p><p className="text-sm text-white mt-0.5">{row.value}</p></div>
                    <span className="text-xs font-bold text-[#4C8DFF]">Edit</span>
                  </GlassCard>
                ))}
                <CheckoutPrimaryButton lock onClick={() => setStep("processing")}>Pay ${total.toFixed(2)}</CheckoutPrimaryButton>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-white/50 text-center max-w-sm drop-shadow">
        Dev preview for Buy Now dark-glass checkout. Related products fill the dark space behind the card.
      </p>
      {/* keep icons referenced for tree-shaking clarity */}
      <span className="hidden"><Gift /><Users /></span>
      </div>
    </div>
  );
}
