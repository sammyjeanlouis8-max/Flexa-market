import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import "./premiumCheckout.css";

const STEPS = [
  { key: "promo", label: "Promo" },
  { key: "address", label: "Address" },
  { key: "delivery", label: "Delivery" },
  { key: "payment", label: "Payment" },
] as const;

export type CheckoutProgressStep = (typeof STEPS)[number]["key"] | "review" | "processing" | "success" | "confirmed";

function stepIndex(step: CheckoutProgressStep): number {
  if (step === "promo") return 0;
  if (step === "address") return 1;
  if (step === "delivery") return 2;
  if (step === "payment" || step === "review") return 3;
  return 4;
}

export default function CheckoutShell({
  step,
  onBack,
  children,
  footer,
  hideProgress = false,
}: {
  step: CheckoutProgressStep;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  hideProgress?: boolean;
}) {
  const active = stepIndex(step);

  return (
    <div className="fm-checkout" data-testid="premium-checkout">
      <div className="fm-checkout-shell">
        <header className="fm-checkout-header">
          {onBack ? (
            <button type="button" className="fm-checkout-back" onClick={onBack} aria-label="Back" data-testid="checkout-back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div style={{ width: 40 }} />
          )}
          <div className="fm-checkout-brand">
            <img src={`${import.meta.env.BASE_URL}flexa-logo-v2.png`} alt="Flexa Market" />
            <span>Flexa Market</span>
          </div>
          <div style={{ width: 40 }} />
        </header>

        {!hideProgress && active <= 3 && (
          <nav className="fm-checkout-progress" aria-label="Checkout progress">
            {STEPS.map((s, i) => {
              const state = i < active ? "is-done" : i === active ? "is-active" : "";
              return (
                <div key={s.key} className={`fm-checkout-step ${state}`}>
                  <div className="fm-checkout-step-dot">{i < active ? "✓" : i + 1}</div>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </nav>
        )}

        <div className="fm-checkout-body">{children}</div>
        {footer ? <div className="fm-checkout-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
