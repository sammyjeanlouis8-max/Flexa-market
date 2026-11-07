import type { ReactNode } from "react";
import { Check, ChevronRight, Gift, Lock, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dark glass checkout tokens — match Flexa Market checkout mockup. */
export const CX = {
  navy: "#060B1A",
  navy2: "#0B1228",
  glass: "rgba(18, 28, 54, 0.72)",
  glassBorder: "rgba(120, 160, 255, 0.18)",
  glassHover: "rgba(36, 56, 110, 0.55)",
  blue: "#2F6BFF",
  blueBright: "#4C8DFF",
  text: "#F4F7FF",
  muted: "#8B9BB8",
  success: "#22C55E",
  gold: "#F5B942",
} as const;

export function CheckoutStepper({
  steps,
  current,
}: {
  steps: Array<{ key: string; label: string; num: number }>;
  current: string;
}) {
  const ord = Object.fromEntries(steps.map((s) => [s.key, s.num]));
  const cur = ord[current] ?? 0;
  return (
    <div className="flex items-center px-0.5 pb-3" data-testid="checkout-stepper">
      {steps.map((s, i) => {
        const done = s.num < cur;
        const active = s.num === cur;
        return (
          <div key={s.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all",
                  done && "bg-[#2F6BFF] text-white shadow-[0_0_16px_rgba(47,107,255,0.45)]",
                  active && "bg-[#2F6BFF] text-white ring-2 ring-[#2F6BFF]/35 ring-offset-2 ring-offset-[#060B1A] shadow-[0_0_18px_rgba(47,107,255,0.55)]",
                  !done && !active && "bg-white/8 text-[#8B9BB8] border border-white/10",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.num}
              </div>
              <span
                className={cn(
                  "text-[9px] font-bold text-center leading-tight w-12 truncate",
                  active ? "text-[#4C8DFF]" : done ? "text-white/70" : "text-[#8B9BB8]",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-[2px] mb-4 mx-1 rounded-full transition-all",
                  done ? "bg-[#2F6BFF]" : "bg-white/10",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GlassCard({
  children,
  className,
  selected,
  onClick,
  testId,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "w-full text-left rounded-2xl border backdrop-blur-xl transition-all",
        "bg-[rgba(18,28,54,0.72)] border-[rgba(120,160,255,0.18)]",
        selected && "border-[#2F6BFF] bg-[rgba(47,107,255,0.14)] shadow-[0_0_24px_rgba(47,107,255,0.22)]",
        onClick && !selected && "hover:border-[#4C8DFF]/45 hover:bg-[rgba(36,56,110,0.55)]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function CheckoutPrimaryButton({
  children,
  onClick,
  disabled,
  className,
  testId,
  lock,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
  lock?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "w-full h-12 rounded-2xl font-bold text-[15px] text-white",
        "bg-gradient-to-r from-[#2F6BFF] to-[#4C8DFF]",
        "shadow-[0_8px_28px_rgba(47,107,255,0.45)]",
        "disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none",
        "active:scale-[0.98] transition-all flex items-center justify-center gap-2",
        className,
      )}
    >
      {lock && <Lock className="h-4 w-4" />}
      {children}
      {!lock && <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

export function CheckoutOutlineButton({
  children,
  onClick,
  className,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "w-full h-12 rounded-2xl font-bold text-[15px] text-white",
        "border border-white/20 bg-white/5 hover:bg-white/10",
        "active:scale-[0.98] transition-all flex items-center justify-center gap-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PromoHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(120,160,255,0.16)] bg-gradient-to-br from-[#152045]/90 via-[#0F1A38]/80 to-[#1A1030]/90 p-4 mb-1">
      <div className="absolute -right-4 -top-6 w-28 h-28 rounded-full bg-[#2F6BFF]/25 blur-2xl pointer-events-none" />
      <div className="absolute right-8 bottom-0 w-20 h-20 rounded-full bg-[#A855F7]/20 blur-2xl pointer-events-none" />
      <div className="relative flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F5B942] to-[#F97316] flex items-center justify-center shadow-[0_8px_24px_rgba(245,185,66,0.35)] shrink-0">
          <Gift className="h-7 w-7 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-extrabold text-base leading-tight">Apply Promo Code</p>
          <p className="text-[#8B9BB8] text-xs mt-0.5">Unlock savings before checkout</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center shrink-0">
          <Ticket className="h-5 w-5 text-[#4ADE80]" />
        </div>
      </div>
    </div>
  );
}

export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <div
      className={cn(
        "w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
        selected ? "border-[#2F6BFF]" : "border-white/25",
      )}
    >
      {selected && <div className="w-2.5 h-2.5 rounded-full bg-[#2F6BFF] shadow-[0_0_8px_rgba(47,107,255,0.8)]" />}
    </div>
  );
}

export function ProcessingPaymentPanel({
  verifyingDone,
  confirmingActive,
}: {
  verifyingDone: boolean;
  confirmingActive: boolean;
}) {
  const rows = [
    { label: "Verifying payment", done: verifyingDone, active: !verifyingDone },
    { label: "Confirming order", done: verifyingDone && !confirmingActive, active: confirmingActive },
    { label: "Finalizing purchase", done: false, active: false },
  ];
  return (
    <div className="py-8 px-2 text-center space-y-6" data-testid="checkout-processing">
      <div className="relative mx-auto w-28 h-28">
        <div className="absolute inset-0 rounded-full bg-[#2F6BFF]/25 blur-xl animate-pulse" />
        <div className="relative w-28 h-28 rounded-full border-2 border-[#2F6BFF]/40 bg-[rgba(18,28,54,0.85)] flex items-center justify-center shadow-[0_0_40px_rgba(47,107,255,0.35)]">
          <div className="w-12 h-8 rounded-md border-2 border-[#4C8DFF] bg-[#2F6BFF]/20 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-2 bg-[#2F6BFF]/50" />
            <div className="absolute bottom-1.5 left-1.5 right-1.5 h-1 rounded bg-white/30" />
          </div>
        </div>
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#4C8DFF] animate-spin" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-white">Processing Payment</h2>
        <p className="text-sm text-[#8B9BB8] mt-1">Please wait while we secure your order</p>
      </div>
      <div className="space-y-2.5 text-left max-w-xs mx-auto">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                r.done && "bg-[#22C55E] text-white",
                r.active && "border-2 border-[#2F6BFF]",
                !r.done && !r.active && "border border-white/20",
              )}
            >
              {r.done ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : r.active ? (
                <div className="w-3.5 h-3.5 border-2 border-[#4C8DFF] border-t-transparent rounded-full animate-spin" />
              ) : null}
            </div>
            <span className={cn("text-sm font-medium", r.done || r.active ? "text-white" : "text-[#8B9BB8]")}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaymentSuccessPanel({
  amount,
  methodLabel,
  transactionId,
  onViewOrder,
  onContinue,
  discountAmount,
  bonusEarned,
  promoCode,
}: {
  amount: string;
  methodLabel: string;
  transactionId: string;
  onViewOrder: () => void;
  onContinue: () => void;
  discountAmount?: number;
  bonusEarned?: number;
  promoCode?: string | null;
}) {
  return (
    <div className="py-4 space-y-5 text-center" data-testid="checkout-success">
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 rounded-full bg-[#22C55E]/30 blur-2xl" />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#22C55E] to-[#16A34A] flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.45)]">
          <Check className="h-12 w-12 text-white" strokeWidth={3} />
        </div>
        {/* confetti dots */}
        <span className="absolute -top-1 left-2 w-2 h-2 rounded-full bg-[#F5B942]" />
        <span className="absolute top-3 -right-1 w-1.5 h-1.5 rounded-full bg-[#2F6BFF]" />
        <span className="absolute -bottom-0.5 left-4 w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
        <span className="absolute bottom-2 -right-2 w-2 h-2 rounded-full bg-[#F472B6]" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-white">Payment Successful!</h2>
        <p className="text-sm text-[#8B9BB8] mt-1">Your order is confirmed</p>
      </div>
      <GlassCard className="p-4 space-y-3 text-left">
        <div className="flex justify-between text-sm">
          <span className="text-[#8B9BB8]">Amount Paid</span>
          <span className="font-bold text-white">${amount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#8B9BB8]">Payment Method</span>
          <span className="font-semibold text-white">{methodLabel}</span>
        </div>
        <div className="flex justify-between text-sm gap-2">
          <span className="text-[#8B9BB8] shrink-0">Transaction ID</span>
          <span className="font-mono text-xs text-[#4C8DFF] truncate">{transactionId}</span>
        </div>
        {!!discountAmount && discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[#8B9BB8]">Saved{promoCode ? ` (${promoCode})` : ""}</span>
            <span className="font-semibold text-[#4ADE80]">−${discountAmount.toFixed(2)}</span>
          </div>
        )}
        {!!bonusEarned && bonusEarned > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[#8B9BB8]">Bonus credit</span>
            <span className="font-semibold text-[#F5B942]">+${bonusEarned.toFixed(2)}</span>
          </div>
        )}
      </GlassCard>
      <CheckoutPrimaryButton onClick={onViewOrder} testId="button-view-order" className="!gap-2">
        View Order
      </CheckoutPrimaryButton>
      <CheckoutOutlineButton onClick={onContinue} testId="button-continue-shopping">
        Continue Shopping
      </CheckoutOutlineButton>
    </div>
  );
}
