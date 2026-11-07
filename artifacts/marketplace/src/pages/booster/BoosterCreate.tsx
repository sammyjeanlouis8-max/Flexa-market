import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Film, Image as ImageIcon, Loader2, Sparkles, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { startVideoUpload } from "@/lib/videoUploadQueue";
import { MAX_BOOST_VIDEO_BYTES } from "@/lib/boostVideoUpload";
import BoosterLayout from "./BoosterLayout";

const MAX_VIDEO_SECONDS = 120;
const BUDGET_PRESETS = [2, 5, 10, 20];
const STEPS = ["create", "audience", "budget", "review"] as const;
type Step = (typeof STEPS)[number];

type Meta = {
  haitiDepartments: string[];
  communesByDepartment: Record<string, string[]>;
  radiusKm: number[];
};

export default function BoosterCreate() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("create");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [adFormat, setAdFormat] = useState<"video" | "image">("video");
  const [adTitle, setAdTitle] = useState("");
  const [adDescription, setAdDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [audienceType, setAudienceType] = useState<"advantage_plus" | "custom">("advantage_plus");
  const [department, setDepartment] = useState("Ouest");
  const [cities, setCities] = useState<string[]>(["Port-au-Prince"]);
  const [radiusKm, setRadiusKm] = useState(25);
  const [savedAudienceId, setSavedAudienceId] = useState<number | "">("");
  const [savedAudiences, setSavedAudiences] = useState<Array<{ id: number; name: string; state: string | null; cities: string[]; radiusKm: number | null }>>([]);

  const [budget, setBudget] = useState(10);
  const [customBudget, setCustomBudget] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [estimate, setEstimate] = useState<{ reach: number; impressions: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/booster/meta", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setMeta(d))
      .catch(() => {});
    fetch("/api/booster/audiences", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSavedAudiences(d.audiences || []))
      .catch(() => {});
  }, [token]);

  const communes = meta?.communesByDepartment?.[department] || [];
  const days = useMemo(() => {
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
    return Math.max(1, Math.ceil((b - a) / 86_400_000));
  }, [startDate, endDate]);

  useEffect(() => {
    if (!token || days < 1) return;
    const plan = days <= 1 ? "1day" : days <= 3 ? "3day" : "7day";
    const timer = setTimeout(() => {
      fetch("/api/boost/estimate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          budget,
          audience: {
            country: user?.country || "Haiti",
            state: department,
            cities,
            radiusKm,
            audienceType,
          },
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.estimatedReach === "number") {
            setEstimate({
              reach: d.estimatedReach,
              impressions: Math.round(d.estimatedReach * 2),
            });
          }
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [token, budget, days, department, cities, radiusKm, audienceType, user?.country]);

  const applySaved = (id: number) => {
    setSavedAudienceId(id);
    const a = savedAudiences.find((x) => x.id === id);
    if (!a) return;
    if (a.state) setDepartment(a.state);
    if (a.cities?.length) setCities(a.cities);
    if (a.radiusKm) setRadiusKm(a.radiusKm);
    setAudienceType("custom");
  };

  const uploadImage = async (file: File): Promise<string> => {
    const presignRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "image/jpeg",
      }),
    });
    if (!presignRes.ok) throw new Error("presign failed");
    const data = await presignRes.json();
    const putUrl = data.uploadURL || data.uploadUrl;
    if (!putUrl) throw new Error("no upload url");
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
    if (!putRes.ok) throw new Error("put failed");
    if (typeof data.url === "string" && (data.url.startsWith("http") || data.url.startsWith("/api/storage/"))) {
      return data.url;
    }
    const objectPath = String(data.objectPath || "");
    return `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;
  };

  const onPickMedia = async (file: File) => {
    if (adFormat === "image") {
      if (!file.type.startsWith("image/")) {
        toast({ title: t("booster.create.needImage"), variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        const url = await uploadImage(file);
        setImageUrl(url);
        setMediaPreview(url);
      } catch {
        toast({ title: t("booster.create.uploadFailed"), variant: "destructive" });
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!file.type.startsWith("video/")) {
      toast({ title: t("booster.create.needVideo"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_BOOST_VIDEO_BYTES) {
      toast({ title: t("booster.create.videoTooLarge"), variant: "destructive" });
      return;
    }
    const probe = document.createElement("video");
    probe.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    probe.src = objectUrl;
    await new Promise<void>((resolve) => {
      probe.onloadedmetadata = () => resolve();
      probe.onerror = () => resolve();
    });
    if (Number.isFinite(probe.duration) && probe.duration > MAX_VIDEO_SECONDS + 0.5) {
      URL.revokeObjectURL(objectUrl);
      toast({ title: t("booster.create.videoTooLong"), variant: "destructive" });
      return;
    }
    setMediaPreview(objectUrl);
    setUploading(true);
    try {
      if (!user?.id) throw new Error("auth");
      const url = await startVideoUpload(file, token, {
        ownerId: user.id,
        purpose: "boost",
      });
      if (!url) throw new Error("no url");
      setVideoUrl(url);
      toast({ title: t("booster.create.videoReady") });
    } catch {
      toast({ title: t("booster.create.uploadFailed"), variant: "destructive" });
      setVideoUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const canNext = () => {
    if (step === "create") {
      if (!adTitle.trim()) return false;
      if (adFormat === "video") return !!videoUrl;
      return !!imageUrl;
    }
    if (step === "audience") return !!department;
    if (step === "budget") return budget >= 2 && days >= 1;
    return true;
  };

  const goNext = () => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  };
  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };

  const submit = async (mode: "draft" | "launch") => {
    if (!token) {
      navigate("/auth/login");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/booster/campaigns", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          adFormat,
          adTitle: adTitle.trim(),
          adDescription: adDescription.trim(),
          videoUrl,
          imageUrl,
          budget,
          startDate,
          endDate,
          audience: {
            country: user?.country || "Haiti",
            state: department,
            cities,
            radiusKm,
            audienceType,
            audienceName: savedAudienceId
              ? savedAudiences.find((a) => a.id === savedAudienceId)?.name
              : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: data.error || t("booster.create.launchFailed"),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: mode === "draft" ? t("booster.create.draftSaved") : t("booster.create.launched"),
      });
      navigate("/booster");
    } catch {
      toast({ title: t("booster.create.launchFailed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BoosterLayout
      title={t("booster.create.title")}
      subtitle={t("booster.create.subtitle")}
    >
      <div className="bp-steps">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`bp-step-pill${step === s ? " on" : STEPS.indexOf(step) > i ? " done" : ""}`}
          >
            {i + 1}. {t(`booster.steps.${s}`)}
          </span>
        ))}
      </div>

      {step === "create" && (
        <div className="bp-card space-y-3">
          <div className="bp-format-grid">
            <button
              type="button"
              className={`bp-format${adFormat === "image" ? " on" : ""}`}
              onClick={() => { setAdFormat("image"); setVideoUrl(null); }}
              data-testid="booster-format-image"
            >
              <ImageIcon className="h-5 w-5 text-violet-600 mb-2" />
              <div className="font-bold">{t("booster.create.imageAd")}</div>
              <div className="text-xs text-slate-500 mt-1">{t("booster.create.imageAdDesc")}</div>
            </button>
            <button
              type="button"
              className={`bp-format${adFormat === "video" ? " on" : ""}`}
              onClick={() => { setAdFormat("video"); setImageUrl(null); }}
              data-testid="booster-format-video"
            >
              <Film className="h-5 w-5 text-violet-600 mb-2" />
              <div className="font-bold">{t("booster.create.videoAd")}</div>
              <div className="text-xs text-slate-500 mt-1">{t("booster.create.videoAdDesc")}</div>
            </button>
          </div>

          <label className="bp-upload" data-testid="booster-upload">
            <input
              type="file"
              accept={adFormat === "video" ? "video/*" : "image/*"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickMedia(f);
              }}
            />
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-violet-600" />
            ) : mediaPreview ? (
              adFormat === "video" ? (
                <video src={mediaPreview} className="mx-auto max-h-48 rounded-lg" controls muted />
              ) : (
                <img src={mediaPreview} alt="" className="mx-auto max-h-48 rounded-lg" />
              )
            ) : (
              <>
                <div className="font-bold text-violet-700">{t("booster.create.uploadMedia")}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {adFormat === "video" ? t("booster.create.max2min") : t("booster.create.imageHint")}
                </div>
              </>
            )}
          </label>

          <label className="bp-label">{t("booster.create.adTitle")}</label>
          <input
            className="bp-input"
            value={adTitle}
            onChange={(e) => setAdTitle(e.target.value)}
            placeholder={t("booster.create.adTitlePh")}
            data-testid="booster-ad-title"
          />
          <label className="bp-label">{t("booster.create.adDescription")}</label>
          <textarea
            className="bp-textarea"
            value={adDescription}
            onChange={(e) => setAdDescription(e.target.value)}
            placeholder={t("booster.create.adDescriptionPh")}
            data-testid="booster-ad-description"
          />
        </div>
      )}

      {step === "audience" && (
        <div className="bp-card">
          <div className="bp-format-grid mb-3">
            <button
              type="button"
              className={`bp-format${audienceType === "advantage_plus" ? " on" : ""}`}
              onClick={() => setAudienceType("advantage_plus")}
            >
              <Sparkles className="h-4 w-4 text-violet-600 mb-1" />
              <div className="font-bold text-sm">{t("booster.audience.advantage")}</div>
            </button>
            <button
              type="button"
              className={`bp-format${audienceType === "custom" ? " on" : ""}`}
              onClick={() => setAudienceType("custom")}
            >
              <SlidersHorizontal className="h-4 w-4 text-violet-600 mb-1" />
              <div className="font-bold text-sm">{t("booster.audience.manual")}</div>
            </button>
          </div>

          <label className="bp-label">{t("booster.audience.location")}</label>
          <input className="bp-input" value={user?.country || "Haiti"} readOnly />

          <label className="bp-label">{t("booster.audience.department")}</label>
          <div className="bp-chip-row">
            {(meta?.haitiDepartments || ["Ouest", "Artibonite"]).map((d) => (
              <button
                key={d}
                type="button"
                className={`bp-chip${department === d ? " on" : ""}`}
                onClick={() => { setDepartment(d); setCities([]); }}
              >
                {d}
              </button>
            ))}
          </div>

          <label className="bp-label">{t("booster.audience.cities")}</label>
          <div className="bp-chip-row">
            {communes.slice(0, 16).map((c) => {
              const on = cities.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  className={`bp-chip${on ? " on" : ""}`}
                  onClick={() =>
                    setCities((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c].slice(0, 8)))
                  }
                >
                  {c}
                </button>
              );
            })}
          </div>

          <label className="bp-label">{t("booster.audience.radius")} — {radiusKm} km</label>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full accent-violet-600"
          />

          {savedAudiences.length > 0 && (
            <>
              <label className="bp-label">{t("booster.audience.saved")}</label>
              <select
                className="bp-select"
                value={savedAudienceId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { setSavedAudienceId(""); return; }
                  applySaved(Number(v));
                }}
              >
                <option value="">{t("booster.audience.chooseSaved")}</option>
                {savedAudiences.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {step === "budget" && (
        <div className="bp-card">
          <label className="bp-label">{t("booster.budget.total")}</label>
          <div className="bp-chip-row mb-2">
            {BUDGET_PRESETS.map((b) => (
              <button
                key={b}
                type="button"
                className={`bp-chip${budget === b && !customBudget ? " on" : ""}`}
                onClick={() => { setBudget(b); setCustomBudget(""); }}
              >
                ${b}
              </button>
            ))}
            <button
              type="button"
              className={`bp-chip${customBudget ? " on" : ""}`}
              onClick={() => setCustomBudget(String(budget))}
            >
              {t("booster.budget.custom")}
            </button>
          </div>
          {customBudget !== "" && (
            <input
              className="bp-input"
              type="number"
              min={2}
              step={0.01}
              value={customBudget}
              onChange={(e) => {
                setCustomBudget(e.target.value);
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) setBudget(n);
              }}
            />
          )}

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="bp-label">{t("booster.budget.start")}</label>
              <input className="bp-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="bp-label">{t("booster.budget.end")}</label>
              <input className="bp-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">{days} {t("booster.budget.days")}</p>

          <div className="mt-4 rounded-xl bg-violet-50 border border-violet-100 p-3">
            <div className="font-bold text-sm text-violet-900">{t("booster.budget.estimated")}</div>
            <div className="text-sm mt-1">
              {t("booster.budget.reach")}:{" "}
              <strong>
                {estimate
                  ? `${estimate.reach.toLocaleString()} – ${Math.round(estimate.reach * 1.4).toLocaleString()}`
                  : "—"}
              </strong>
            </div>
            <div className="text-sm">
              {t("booster.budget.impressions")}:{" "}
              <strong>
                {estimate
                  ? `${estimate.impressions.toLocaleString()} – ${Math.round(estimate.impressions * 1.5).toLocaleString()}`
                  : "—"}
              </strong>
            </div>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="bp-card grid gap-4 md:grid-cols-2">
          <div className="bp-preview-card">
            {adFormat === "video" && mediaPreview ? (
              <video src={mediaPreview} className="bp-preview-media" muted controls playsInline />
            ) : imageUrl || mediaPreview ? (
              <img src={imageUrl || mediaPreview || ""} alt="" className="bp-preview-media" />
            ) : (
              <div className="bp-preview-media" />
            )}
            <div className="bp-preview-meta">
              <div className="font-bold">{adTitle || "—"}</div>
              <div className="opacity-80 text-xs mt-1 line-clamp-2">{adDescription}</div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div><strong>{t("booster.review.type")}:</strong> {adFormat === "video" ? t("booster.create.videoAd") : t("booster.create.imageAd")}</div>
            <div><strong>{t("booster.review.audience")}:</strong> {department}{cities.length ? ` · ${cities.join(", ")}` : ""} · {radiusKm}km</div>
            <div><strong>{t("booster.review.budget")}:</strong> ${budget.toFixed(2)}</div>
            <div><strong>{t("booster.review.duration")}:</strong> {startDate} → {endDate} ({days}d)</div>
            <div className="text-xs text-slate-500 pt-2">{t("booster.review.walletNote")}</div>
          </div>
        </div>
      )}

      <div className="bp-actions">
        {step !== "create" && (
          <button type="button" className="bp-btn bp-btn-ghost" onClick={goBack} disabled={busy}>
            {t("booster.back")}
          </button>
        )}
        {step !== "review" ? (
          <button
            type="button"
            className="bp-btn bp-btn-primary"
            disabled={!canNext()}
            onClick={goNext}
            data-testid="booster-next"
          >
            {t("booster.next")}
          </button>
        ) : (
          <>
            <button type="button" className="bp-btn bp-btn-ghost" disabled={busy} onClick={() => void submit("draft")}>
              {t("booster.create.saveDraft")}
            </button>
            <button
              type="button"
              className="bp-btn bp-btn-success"
              disabled={busy || !canNext()}
              onClick={() => void submit("launch")}
              data-testid="booster-launch"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("booster.create.launch")}
            </button>
          </>
        )}
      </div>
    </BoosterLayout>
  );
}
