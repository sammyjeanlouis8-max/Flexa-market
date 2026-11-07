import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import BoosterLayout from "../BoosterLayout";
import { clearDraft, formatDuration, loadDraft } from "../draft";

/**
 * Review step: persists draft then hands off to the existing /boost/:listingId
 * payment infrastructure so wallet/Stripe/USDT rails stay untouched.
 * Video-only drafts without a listing create via /api/boost/video-only when wallet-ready,
 * otherwise open the BoostWizard path through my-boosts.
 */
export default function ReviewConfirmPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const draft = loadDraft();
  const [launching, setLaunching] = useState(false);

  const audienceLabel = draft.audienceType === "advantage_plus"
    ? "Advantage+ AI"
    : [
        draft.country,
        draft.state,
        draft.cities.length ? draft.cities.join(", ") : null,
        draft.radiusKm ? `${draft.radiusKm} km` : null,
      ].filter(Boolean).join(" · ");

  const launch = async () => {
    if (!draft.mediaUrl || !draft.adTitle) {
      toast({ title: "Draft enkonplè — retounen nan Create", variant: "destructive" });
      navigate("/booster/create");
      return;
    }
    if (!token) {
      toast({ title: "Konekte pou lanse", variant: "destructive" });
      return;
    }

    setLaunching(true);
    try {
      // Persist audience/budget into session for the classic Boost pay page.
      try {
        sessionStorage.setItem("bp_handoff_audience", JSON.stringify({
          country: draft.country,
          state: draft.state || null,
          cities: draft.cities,
          radiusKm: draft.radiusKm,
          audienceType: draft.audienceType,
          ageMin: draft.ageMin,
          ageMax: draft.ageMax,
          gender: draft.gender,
          objective: draft.objective,
        }));
        sessionStorage.setItem("bp_handoff_budget", String(draft.budget));
        sessionStorage.setItem("bp_handoff_plan", draft.plan);
        sessionStorage.setItem("bp_handoff_video", draft.mediaType === "video" ? (draft.mediaUrl || "") : "");
        sessionStorage.setItem("bp_handoff_media_type", draft.mediaType);
      } catch { /* ok */ }

      if (draft.listingId) {
        // Attach promo video to listing path via classic Boost payment page
        clearDraft();
        navigate(`/boost/${draft.listingId}?boosterPro=1`);
        return;
      }

      // Video-only / image promo without listing — use video-only API (wallet)
      if (draft.mediaType === "video" && draft.mediaUrl) {
        const res = await fetch("/api/boost/video-only", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            videoUrl: draft.mediaUrl,
            budget: draft.budget,
            plan: draft.plan,
            audienceCountry: draft.country,
            audience: {
              country: draft.country,
              state: draft.state || null,
              cities: draft.cities,
              radiusKm: draft.radiusKm,
              audienceType: draft.audienceType,
            },
            ctaType: "none",
            ctaText: draft.adTitle,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) {
          toast({
            title: "Balans promo ensifizan",
            description: "Rechaje wallet promo ou pou lanse anons lan.",
            variant: "destructive",
          });
          navigate("/wallet");
          return;
        }
        if (!res.ok) {
          toast({
            title: data.error ?? "Pa t kapab lanse",
            variant: "destructive",
          });
          return;
        }
        clearDraft();
        toast({ title: "Boost lanse ✓" });
        navigate("/booster/campaigns");
        return;
      }

      toast({
        title: "Chwazi yon pwodui",
        description: "Pou anons imaj, konekte ak yon lis ki egziste oswa kreye youn.",
        variant: "destructive",
      });
      navigate("/booster/create");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <BoosterLayout
      title="Review & Confirmation"
      subtitle="Verifye detay yo anvan ou lanse. Peman rete sou sistèm Flexa ki deja pwouve."
    >
      <div className="bp-stepper" aria-hidden>
        <div className="bp-step-dot done" />
        <div className="bp-step-dot done" />
        <div className="bp-step-dot done" />
        <div className="bp-step-dot active" />
      </div>

      <div className="bp-card">
        {(draft.mediaPreviewUrl || draft.mediaUrl) && (
          <div className="bp-media-preview" style={{ marginBottom: 12 }}>
            {draft.mediaType === "video" && draft.mediaUrl ? (
              <video src={draft.mediaUrl} poster={draft.mediaPreviewUrl ?? undefined} muted playsInline />
            ) : (
              <img src={draft.mediaPreviewUrl || draft.mediaUrl || ""} alt="" />
            )}
            {draft.mediaDurationSec != null && (
              <span className="bp-media-badge">{formatDuration(draft.mediaDurationSec)}</span>
            )}
          </div>
        )}
        <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>{draft.adTitle || "Untitled ad"}</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--bp-muted)", lineHeight: 1.7 }}>
          <li><strong style={{ color: "var(--bp-text)" }}>Ad Type:</strong> {draft.mediaType === "video" ? "Video" : "Image"}</li>
          <li><strong style={{ color: "var(--bp-text)" }}>Audience:</strong> {audienceLabel || "—"}</li>
          <li><strong style={{ color: "var(--bp-text)" }}>Budget:</strong> ${draft.budget.toFixed(2)} · {draft.plan}</li>
          <li><strong style={{ color: "var(--bp-text)" }}>Duration:</strong> {draft.startDate} → {draft.endDate}</li>
          {draft.adDescription ? (
            <li><strong style={{ color: "var(--bp-text)" }}>Description:</strong> {draft.adDescription}</li>
          ) : null}
        </ul>
      </div>

      <div className="bp-actions" style={{ flexDirection: "column" }}>
        <button
          type="button"
          className="bp-btn bp-btn-success bp-btn-block"
          disabled={launching}
          onClick={() => void launch()}
          data-testid="booster-launch"
        >
          {launching ? "Lanse…" : "Launch Boost ✓"}
        </button>
        <button
          type="button"
          className="bp-btn bp-btn-ghost bp-btn-block"
          onClick={() => navigate("/booster/budget")}
        >
          Back
        </button>
      </div>
    </BoosterLayout>
  );
}
