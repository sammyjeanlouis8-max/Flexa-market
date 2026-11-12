import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import BoosterLayout from "./BoosterLayout";

type MediaTab = "approved" | "rejected" | "in_review";

interface MediaReview {
  id: number;
  assetUrl: string;
  mediaType: string;
  status: string;
  progressDisplay: string;
  progressStep: number;
  formalReason: string | null;
  violationCategory: string | null;
  evidenceTimestampLabel: string | null;
  evidenceImageUrl: string | null;
  canAppeal: boolean;
  appealStatus: string;
  delayed: boolean;
  createdAt: string;
}

export default function BoosterMediaReviews() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<MediaTab>("in_review");
  const [reviews, setReviews] = useState<MediaReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MediaReview | null>(null);
  const [appealNote, setAppealNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/media-reviews/mine?scope=boost_video&tab=${tab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => { void load(); }, [load]);

  const submitAppeal = async () => {
    if (!token || !selected) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/media-reviews/${selected.id}/appeal`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note: appealNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: data.error || t("booster.media.appealFailed", { defaultValue: "Could not submit appeal" }),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("booster.media.appealSubmitted", { defaultValue: "Appeal in review" }),
      });
      setSelected(null);
      setAppealNote("");
      setTab("rejected");
      await load();
    } catch {
      toast({
        title: t("booster.media.appealFailed", { defaultValue: "Could not submit appeal" }),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { key: MediaTab; label: string }[] = [
    {
      key: "approved",
      label: t("booster.media.tabApproved", { defaultValue: "Approved videos" }),
    },
    {
      key: "rejected",
      label: t("booster.media.tabRejected", { defaultValue: "Rejected videos" }),
    },
    {
      key: "in_review",
      label: t("booster.media.tabInReview", { defaultValue: "Videos in review" }),
    },
  ];

  return (
    <BoosterLayout
      title={t("booster.media.title", { defaultValue: "Video moderation" })}
      subtitle={t("booster.media.subtitle", {
        defaultValue: "Approved, rejected, and in-review promotional videos.",
      })}
    >
      <div className="bp-tabs" role="tablist">
        {tabs.map((k) => (
          <button
            key={k.key}
            type="button"
            role="tab"
            aria-selected={tab === k.key}
            className={`bp-tab${tab === k.key ? " on" : ""}`}
            onClick={() => setTab(k.key)}
            data-testid={`booster-media-tab-${k.key}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="bp-card">
        {loading ? (
          <div className="bp-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : reviews.length === 0 ? (
          <div className="bp-empty">
            <p>{t("booster.media.empty", { defaultValue: "No videos in this category yet." })}</p>
            <Link href="/booster/create" className="bp-btn bp-btn-primary" style={{ display: "inline-flex", marginTop: "1rem", gap: 8 }}>
              <Plus className="h-4 w-4" /> {t("booster.nav.create")}
            </Link>
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="bp-campaign" data-testid={`booster-media-${r.id}`} style={{ alignItems: "start" }}>
              <div className="bp-thumb" style={{ display: "grid", placeItems: "center", background: "#0f172a" }}>
                <ShieldAlert className="h-5 w-5 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm truncate">
                  {r.violationCategory
                    ? t(`booster.media.category.${r.violationCategory}`, { defaultValue: r.violationCategory })
                    : t("booster.media.videoItem", { defaultValue: "Promotional video" })}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`bp-badge ${r.status}`}>
                    {r.appealStatus === "open"
                      ? t("booster.media.appealInReview", { defaultValue: "Appeal in review" })
                      : t(`booster.media.status.${r.status}`, { defaultValue: r.status })}
                  </span>
                  {["pending", "analyzing", "verifying"].includes(r.status) && (
                    <span className="text-xs text-slate-500">{r.progressDisplay}</span>
                  )}
                </div>
                {r.delayed && (
                  <div className="text-xs text-amber-600 mt-1">
                    {t("booster.media.delayed", {
                      defaultValue: "Review is taking longer than usual. Your video stays private.",
                    })}
                  </div>
                )}
                {r.status === "rejected" && r.formalReason && (
                  <div className="text-xs text-slate-600 mt-2 space-y-1">
                    <div>{r.formalReason}</div>
                    {r.evidenceTimestampLabel && (
                      <div>
                        {t("booster.media.atTimestamp", {
                          defaultValue: "At {{time}}",
                          time: r.evidenceTimestampLabel,
                        })}
                      </div>
                    )}
                    {r.evidenceImageUrl && (
                      <img
                        src={r.evidenceImageUrl}
                        alt=""
                        className="rounded mt-1 max-w-[180px] blur-sm"
                        style={{ filter: "blur(6px)" }}
                      />
                    )}
                  </div>
                )}
                <div className="bp-campaign-actions" style={{ marginTop: 8 }}>
                  {r.status === "rejected" && r.canAppeal && (
                    <button
                      type="button"
                      className="bp-btn bp-btn-ghost"
                      onClick={() => { setSelected(r); setAppealNote(""); }}
                      data-testid={`booster-media-appeal-${r.id}`}
                    >
                      {t("booster.media.requestAppeal", { defaultValue: "Request an appeal" })}
                    </button>
                  )}
                  {r.status === "rejected" && (
                    <Link
                      href="/booster/create"
                      className="bp-btn bp-btn-ghost"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t("booster.media.replaceVideo", { defaultValue: "Replace video" })}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className="bp-card" style={{ marginTop: "1rem" }} data-testid="booster-appeal-panel">
          <div className="font-bold text-sm mb-2">
            {t("booster.media.appealTitle", { defaultValue: "Request an appeal" })}
          </div>
          <p className="text-xs text-slate-500 mb-2">
            {t("booster.media.appealHint", {
              defaultValue: "Explain why you believe this decision is incorrect. The contested decision stays private during review.",
            })}
          </p>
          {selected.formalReason && (
            <div className="text-xs mb-2 p-2 rounded bg-slate-50">
              <strong>{t("booster.media.contestedDecision", { defaultValue: "Contested decision" })}:</strong>{" "}
              {selected.formalReason}
            </div>
          )}
          <textarea
            className="w-full border rounded p-2 text-sm"
            rows={4}
            value={appealNote}
            onChange={(e) => setAppealNote(e.target.value)}
            placeholder={t("booster.media.appealPlaceholder", {
              defaultValue: "Why is this decision incorrect?",
            })}
            data-testid="booster-appeal-note"
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="bp-btn bp-btn-primary"
              disabled={submitting || appealNote.trim().length < 8}
              onClick={() => void submitAppeal()}
              data-testid="booster-appeal-submit"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("booster.media.submitAppeal", { defaultValue: "Submit appeal" })}
            </button>
            <button
              type="button"
              className="bp-btn bp-btn-ghost"
              onClick={() => setSelected(null)}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </div>
      )}
    </BoosterLayout>
  );
}
