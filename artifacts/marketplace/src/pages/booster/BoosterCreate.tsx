import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Film, Loader2, Package, Plus, Search, ShoppingBag, Video, MessageCircle,
  Phone, Ban, Check, ImagePlus, X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import { startVideoUpload } from "@/lib/videoUploadQueue";
import { MAX_BOOST_VIDEO_BYTES } from "@/lib/boostVideoUpload";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { BoostAudiencePanel, type BoostAudiencePanelHandle } from "@/components/boost/BoostAudiencePanel";
import { AdaptiveVideoPlayer } from "@/components/media/AdaptiveVideoPlayer";
import { scrollToInvalidField } from "@/lib/formValidation";
import { formatPrice } from "@/lib/currency";
import { cn } from "@/lib/utils";
import BoosterLayout from "./BoosterLayout";

const MAX_VIDEO_SECONDS = 120;
const MIN_BUDGET = 2;
const DURATION_DAYS = [1, 3, 7, 14, 30] as const;
const STEPS = ["create", "audience", "action", "budget", "review"] as const;
type Step = (typeof STEPS)[number];
type AdType = "existing" | "new" | "video_only";
type CtaType = "buy_now" | "message" | "whatsapp" | "none";

type UserListing = {
  id: number;
  title: string;
  price: number;
  currency?: string | null;
  description?: string | null;
  images?: string[];
  boostVideoUrl?: string | null;
  listingVideoUrl?: string | null;
  status?: string;
};

type Category = { id: number; name: string };

function daysFromToday(n: number): { start: string; end: string } {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + n);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function BoosterCreate() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { uploadFile } = useUpload();
  const purchasesDisabled = isAndroidApp();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audiencePanelRef = useRef<BoostAudiencePanelHandle>(null);
  const createSectionRef = useRef<HTMLDivElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const actionSectionRef = useRef<HTMLDivElement>(null);
  const budgetSectionRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("create");
  const [adType, setAdType] = useState<AdType | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Existing product
  const [listings, setListings] = useState<UserListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingQuery, setListingQuery] = useState("");
  const [selectedListing, setSelectedListing] = useState<UserListing | null>(null);

  // New product
  const [categories, setCategories] = useState<Category[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [newDesc, setNewDesc] = useState("");
  const [newCondition, setNewCondition] = useState<"new" | "used">("new");
  const [newImages, setNewImages] = useState<{ preview: string; url: string | null }[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [createdListingId, setCreatedListingId] = useState<number | null>(null);

  // Video-only title/desc
  const [adTitle, setAdTitle] = useState("");
  const [adDescription, setAdDescription] = useState("");

  // Video
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  // Audience — always account country (never GPS/IP)
  const accountCountry = user?.country || "Haiti";
  const [audienceType, setAudienceType] = useState<"advantage_plus" | "custom">("advantage_plus");
  const [departments, setDepartments] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [radiusKm, setRadiusKm] = useState(25);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [geoError, setGeoError] = useState<string | null>(null);

  // CTA
  const [ctaType, setCtaType] = useState<CtaType>("buy_now");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  // Budget
  const [budget, setBudget] = useState(MIN_BUDGET);
  const [customBudget, setCustomBudget] = useState("");
  const [durationDays, setDurationDays] = useState<number>(3);
  const [busy, setBusy] = useState(false);

  const { start: startDate, end: endDate } = useMemo(() => daysFromToday(durationDays), [durationDays]);
  const dailySpend = budget / Math.max(1, durationDays);

  const hasProduct = adType === "existing" || adType === "new";
  const listingId = adType === "existing"
    ? selectedListing?.id ?? null
    : adType === "new"
      ? createdListingId
      : null;

  const resolvedTitle = useMemo(() => {
    if (adType === "existing" && selectedListing) return selectedListing.title;
    if (adType === "new" && newTitle.trim()) return newTitle.trim();
    return adTitle.trim();
  }, [adType, selectedListing, newTitle, adTitle]);

  const resolvedPrice = useMemo(() => {
    if (adType === "existing" && selectedListing) return selectedListing.price;
    if (adType === "new") {
      const n = parseFloat(newPrice);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }, [adType, selectedListing, newPrice]);

  const resolvedImages = useMemo(() => {
    if (adType === "existing" && selectedListing?.images) return selectedListing.images;
    if (adType === "new") return newImages.map((i) => i.url).filter(Boolean) as string[];
    return [];
  }, [adType, selectedListing, newImages]);

  const filteredListings = useMemo(() => {
    const q = listingQuery.trim().toLowerCase();
    const base = listings.filter((l) => l.status !== "hidden" && l.status !== "deleted");
    if (!q) return base;
    return base.filter((l) => l.title.toLowerCase().includes(q));
  }, [listings, listingQuery]);

  const libraryVideos = useMemo(() => {
    return listings
      .map((l) => ({
        id: l.id,
        title: l.title,
        url: l.boostVideoUrl || l.listingVideoUrl || null,
        thumb: l.images?.[0] || null,
      }))
      .filter((v) => !!v.url);
  }, [listings]);

  // Load seller listings when choosing existing / for library
  useEffect(() => {
    if (!token || !user?.id) return;
    if (adType !== "existing" && adType !== "video_only" && adType !== "new") return;
    if (listings.length > 0) return;
    setListingsLoading(true);
    fetch(`/api/users/${user.id}/listings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setListings(Array.isArray(d) ? d : (d.listings ?? [])))
      .catch(() => setListings([]))
      .finally(() => setListingsLoading(false));
  }, [adType, token, user?.id, listings.length]);

  useEffect(() => {
    if (adType !== "new" || categories.length > 0) return;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((cats) => {
        const list = Array.isArray(cats) ? cats : cats.categories || [];
        setCategories(list);
        if (list[0]?.id) setNewCategoryId(list[0].id);
      })
      .catch(() => {});
  }, [adType, categories.length]);

  // Buy Now only when product attached — auto-downgrade otherwise
  useEffect(() => {
    if (!hasProduct && ctaType === "buy_now") setCtaType("none");
  }, [hasProduct, ctaType]);

  const onPickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const toAdd = Array.from(files).slice(0, 5 - newImages.length);
    setImageUploading(true);
    for (const file of toAdd) {
      if (!file.type.startsWith("image/")) continue;
      const preview = URL.createObjectURL(file);
      setNewImages((prev) => [...prev, { preview, url: null }]);
      try {
        const res = await uploadFile(file) as { objectPath?: string; url?: string } | null;
        const url = res?.objectPath
          ? (res.objectPath.startsWith("/") ? res.objectPath : `/api/storage/objects/${res.objectPath}`)
          : res?.url ?? null;
        setNewImages((prev) => {
          const idx = prev.findIndex((it) => it.preview === preview);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { preview, url };
          return next;
        });
      } catch {
        setNewImages((prev) => prev.filter((it) => it.preview !== preview));
        URL.revokeObjectURL(preview);
        toast({ title: t("booster.create.uploadFailed"), variant: "destructive" });
      }
    }
    setImageUploading(false);
  };

  const createProduct = async (): Promise<number | null> => {
    if (createdListingId) return createdListingId;
    const price = parseFloat(newPrice);
    const urls = newImages.map((i) => i.url).filter(Boolean) as string[];
    if (!newTitle.trim() || !Number.isFinite(price) || price <= 0 || urls.length === 0 || newDesc.trim().length < 20) {
      toast({
        title: t("boostWizard.errorGeneric", { defaultValue: "Please complete the product form" }),
        variant: "destructive",
      });
      return null;
    }
    setCreatingProduct(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          price,
          categoryId: newCategoryId ?? 1,
          condition: newCondition,
          location: user?.location || accountCountry,
          country: accountCountry,
          images: urls,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || t("booster.create.launchFailed"), variant: "destructive" });
        return null;
      }
      setCreatedListingId(data.id);
      setAdTitle(newTitle.trim());
      return data.id as number;
    } catch {
      toast({ title: t("booster.create.launchFailed"), variant: "destructive" });
      return null;
    } finally {
      setCreatingProduct(false);
    }
  };

  const onPickVideo = async (file: File) => {
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
    setUploadPercent(0);
    try {
      if (!user?.id || !token) throw new Error("auth");
      const url = await startVideoUpload(file, token, {
        ownerId: user.id,
        purpose: "boost",
        returnPath: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined,
        onProgress: setUploadPercent,
      });
      if (!url) throw new Error("no url");
      setVideoUrl(url);
      setUploadPercent(100);
      toast({ title: t("boost.videoReadyPreview", { defaultValue: "Video ready for preview." }) });
    } catch {
      toast({ title: t("booster.create.uploadFailed"), variant: "destructive" });
      setVideoUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const selectLibraryVideo = (url: string, titleHint?: string) => {
    setVideoUrl(url);
    setMediaPreview(url);
    if (!adTitle.trim() && titleHint) setAdTitle(titleHint);
  };

  const validateStep = (s: Step): boolean => {
    const next: Record<string, string> = {};
    if (s === "create") {
      if (!adType) next.adType = t("booster.create.chooseType", { defaultValue: "Choose ad type" });
      if (adType === "existing" && !selectedListing) {
        next.product = t("booster.create.selectProduct", { defaultValue: "Select your product" });
      }
      if (adType === "new") {
        if (!newTitle.trim()) next.title = t("boostWizard.errorTitleRequired", { defaultValue: "Title is required" });
        if (!newPrice || !(parseFloat(newPrice) > 0)) next.price = t("boostWizard.errorPriceTooLow", { defaultValue: "Enter a valid price" });
        if (!newImages.some((i) => i.url)) next.images = t("boostWizard.errorImageRequired", { defaultValue: "Please select a category." }).replace("category", "image") || "Please upload a product image.";
        if (newDesc.trim().length < 20) next.desc = t("booster.create.descMin", { defaultValue: "Minimum 20 characters." });
      }
      if (adType === "video_only" && !adTitle.trim()) {
        next.title = t("booster.create.adTitle");
      }
      if (!videoUrl) {
        next.video = t("boost.geoSelectVideoError", { defaultValue: "Please upload a video." });
      }
    }
    if (s === "audience") {
      if (accountCountry === "Haiti" && audienceType === "custom" && departments.length === 0) {
        const msg = t("boost.geoSelectAreaError", {
          defaultValue: "Please select at least one geographic area to continue.",
        });
        next.geo = msg;
        setGeoError(msg);
      } else {
        setGeoError(null);
      }
    }
    if (s === "action") {
      if (ctaType === "whatsapp" && whatsappNumber.replace(/\D/g, "").length < 8) {
        next.whatsapp = t("booster.cta.whatsappHint", { defaultValue: "Include country code. Digits only after save." });
      }
      if (ctaType === "buy_now" && !hasProduct) {
        next.cta = t("booster.cta.buyNowNeedsProduct", { defaultValue: "Buy Now requires a product" });
      }
    }
    if (s === "budget") {
      if (!(budget >= MIN_BUDGET)) {
        next.budget = t("booster.budget.minNote", { defaultValue: "Minimum campaign budget: $2 USD." });
      }
    }
    setFieldErrors(next);
    if (Object.keys(next).length === 0) return true;

    const order = ["adType", "product", "images", "title", "price", "desc", "video", "geo", "cta", "whatsapp", "budget"];
    const first = order.find((k) => next[k]);
    const el =
      first === "geo" ? audiencePanelRef.current?.getGeoSectionEl()
      : first === "video" ? videoSectionRef.current
      : first === "whatsapp" || first === "cta" ? actionSectionRef.current
      : first === "budget" ? budgetSectionRef.current
      : createSectionRef.current;
    scrollToInvalidField(el);
    return false;
  };

  const canNext = () => {
    if (step === "create") {
      if (!adType) return false;
      if (!videoUrl) return false;
      if (adType === "existing") return !!selectedListing;
      if (adType === "new") {
        return !!newTitle.trim() && !!newPrice && newImages.some((i) => i.url) && newDesc.trim().length >= 20;
      }
      return !!adTitle.trim();
    }
    if (step === "audience") return true;
    if (step === "action") {
      if (ctaType === "whatsapp") return whatsappNumber.replace(/\D/g, "").length >= 8;
      if (ctaType === "buy_now") return hasProduct;
      return true;
    }
    if (step === "budget") return budget >= MIN_BUDGET && durationDays >= 1;
    return true;
  };

  const goNext = async () => {
    if (!validateStep(step)) return;
    if (step === "create" && adType === "new" && !createdListingId) {
      const id = await createProduct();
      if (!id) return;
    }
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  };

  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };

  const ctaLabel = (type: CtaType) => {
    if (type === "buy_now") return t("buttons.buyNow", { defaultValue: "Buy Now" });
    if (type === "message") return t("booster.cta.message", { defaultValue: "Message on Flexa" });
    if (type === "whatsapp") return t("booster.cta.whatsapp", { defaultValue: "WhatsApp" });
    return t("booster.cta.none", { defaultValue: "No Button" });
  };

  const submit = async (mode: "draft" | "launch") => {
    if (!token) {
      navigate("/auth/login");
      return;
    }
    if (purchasesDisabled) return;
    if (mode === "launch") {
      if (ctaType === "buy_now" && !listingId) {
        toast({
          title: t("booster.cta.buyNowNeedsProduct", { defaultValue: "Buy Now requires a product" }),
          variant: "destructive",
        });
        return;
      }
      if (accountCountry === "Haiti" && audienceType === "custom" && departments.length === 0) {
        const msg = t("boost.geoSelectAreaError", {
          defaultValue: "Please select at least one geographic area to continue.",
        });
        setGeoError(msg);
        setStep("audience");
        setTimeout(() => scrollToInvalidField(audiencePanelRef.current?.getGeoSectionEl()), 50);
        return;
      }
      if (!videoUrl || !(budget >= MIN_BUDGET)) {
        return;
      }
    }
    setBusy(true);
    try {
      let finalListingId = listingId;
      if (adType === "new" && !finalListingId) {
        finalListingId = await createProduct();
        if (!finalListingId) return;
      }
      const res = await fetch("/api/booster/campaigns", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          adFormat: "video",
          adTitle: resolvedTitle || "Promotional Video",
          adDescription: adType === "new" ? newDesc.trim() : adDescription.trim(),
          videoUrl,
          imageUrl: resolvedImages[0] || null,
          listingId: finalListingId,
          budget,
          startDate,
          endDate,
          ctaType,
          whatsappNumber: ctaType === "whatsapp" ? whatsappNumber.replace(/\D/g, "") : null,
          ctaText: ctaLabel(ctaType),
          audience: {
            country: accountCountry,
            state: departments[0] || null,
            states: departments.length > 0 ? departments : null,
            cities,
            radiusKm,
            audienceType,
            ageMin,
            ageMax,
            gender,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: data.error || t("booster.create.launchFailed"),
          variant: "destructive",
        });
        if (data.code === "INSUFFICIENT_WALLET") {
          navigate("/wallet");
        }
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

  if (purchasesDisabled) {
    return (
      <BoosterLayout title={t("booster.create.title")} subtitle={t("androidPurchasePolicy.unavailable")}>
        <div className="bp-card text-sm text-slate-600">{t("androidPurchasePolicy.unavailable")}</div>
      </BoosterLayout>
    );
  }

  return (
    <BoosterLayout
      title={t("booster.create.title", { defaultValue: "Create Promotional Video" })}
      subtitle={t("booster.create.subtitle", { defaultValue: "Promote a product or video with Flexa Boost." })}
    >
      <div className="bp-steps" role="list">
        {STEPS.map((s, i) => (
          <span
            key={s}
            role="listitem"
            className={`bp-step-pill${step === s ? " on" : STEPS.indexOf(step) > i ? " done" : ""}`}
          >
            {i + 1}. {t(`booster.steps.${s}`, {
              defaultValue: s === "action" ? "Action" : s.charAt(0).toUpperCase() + s.slice(1),
            })}
          </span>
        ))}
      </div>

      {/* ── CREATE ─────────────────────────────────────────────── */}
      {step === "create" && (
        <div className="space-y-3" ref={createSectionRef}>
          <div className={cn("bp-card space-y-3", fieldErrors.adType && "fb-field-invalid")}>
            <h2 className="text-sm font-extrabold text-slate-800">
              {t("booster.create.chooseType", { defaultValue: "Choose ad type" })}
            </h2>
            {fieldErrors.adType && <p className="fb-field-error">{fieldErrors.adType}</p>}
            <div className="bp-adtype-grid">
              {([
                ["existing", Package, t("booster.create.promoteExisting", { defaultValue: "Promote Existing Product" }), t("booster.create.promoteExistingDesc", { defaultValue: "Select a product you already sell." })],
                ["new", Plus, t("booster.create.createPromote", { defaultValue: "Create & Promote Product" }), t("booster.create.createPromoteDesc", { defaultValue: "Add a new product, then promote it." })],
                ["video_only", Film, t("booster.create.videoOnly", { defaultValue: "Promote Video Only" }), t("booster.create.videoOnlyDesc", { defaultValue: "Services, events, brands — no product required." })],
              ] as const).map(([id, Icon, label, desc]) => (
                <button
                  key={id}
                  type="button"
                  className={cn("bp-adtype", adType === id && "on")}
                  onClick={() => {
                    setAdType(id);
                    if (id === "video_only" && ctaType === "buy_now") setCtaType("none");
                    if ((id === "existing" || id === "new") && ctaType === "none") setCtaType("buy_now");
                  }}
                  data-testid={`booster-adtype-${id}`}
                >
                  <Icon className="h-5 w-5 text-violet-600 mb-1.5" />
                  <div className="font-bold text-sm leading-snug">{label}</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">{desc}</div>
                  {adType === id && (
                    <span className="bp-adtype-check"><Check className="h-3.5 w-3.5" /></span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {adType === "existing" && (
            <div className="bp-card space-y-3">
              <label className="bp-label">{t("booster.create.selectProduct", { defaultValue: "Select your product" })}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="bp-input pl-9!"
                  style={{ paddingLeft: "2.25rem" }}
                  value={listingQuery}
                  onChange={(e) => setListingQuery(e.target.value)}
                  placeholder={t("booster.create.searchProducts", { defaultValue: "Search your products…" })}
                />
              </div>
              {listingsLoading ? (
                <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-violet-600" /></div>
              ) : filteredListings.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  {t("booster.create.noProducts", { defaultValue: "No products found on your account." })}
                </p>
              ) : (
                <div className="bp-product-list">
                  {filteredListings.map((l) => {
                    const on = selectedListing?.id === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        className={cn("bp-product-row", on && "on")}
                        onClick={() => {
                          setSelectedListing(l);
                          setAdTitle(l.title);
                          setAdDescription(l.description || "");
                          if (l.boostVideoUrl || l.listingVideoUrl) {
                            selectLibraryVideo((l.boostVideoUrl || l.listingVideoUrl)!, l.title);
                          }
                        }}
                        data-testid={`booster-product-${l.id}`}
                      >
                        {l.images?.[0] ? (
                          <img src={l.images[0]} alt="" className="bp-product-thumb" />
                        ) : (
                          <div className="bp-product-thumb empty"><Package className="h-4 w-4" /></div>
                        )}
                        <div className="min-w-0 text-left flex-1">
                          <div className="font-bold text-sm truncate">{l.title}</div>
                          <div className="text-xs text-violet-700 font-semibold">
                            {formatPrice(l.price, accountCountry, l.currency ?? "USD")}
                          </div>
                        </div>
                        {on && <Check className="h-4 w-4 text-violet-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {adType === "new" && (
            <div className="bp-card space-y-3">
              <label className="bp-label">{t("booster.create.productImages", { defaultValue: "Product images" })}</label>
              <div className="flex flex-wrap gap-2">
                {newImages.map((img, idx) => (
                  <div key={img.preview} className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200">
                    <img src={img.preview} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white grid place-items-center"
                      onClick={() => {
                        URL.revokeObjectURL(img.preview);
                        setNewImages((prev) => prev.filter((_, i) => i !== idx));
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {newImages.length < 5 && (
                  <label className="h-20 w-20 rounded-xl border border-dashed border-violet-300 grid place-items-center text-violet-600 cursor-pointer">
                    {imageUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPickImages(e.target.files)} />
                  </label>
                )}
              </div>
              <label className="bp-label">{t("booster.create.adTitle")}</label>
              <input className="bp-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} data-testid="booster-new-title" />
              <label className="bp-label">{t("sell.price", { defaultValue: "Price" })} (USD)</label>
              <input className="bp-input" type="number" min={0.01} step={0.01} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} data-testid="booster-new-price" />
              <label className="bp-label">{t("sell.category", { defaultValue: "Category" })}</label>
              <select className="bp-select" value={newCategoryId ?? ""} onChange={(e) => setNewCategoryId(Number(e.target.value) || null)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="bp-label">{t("sell.condition", { defaultValue: "Condition" })}</label>
              <div className="bp-chip-row">
                {(["new", "used"] as const).map((c) => (
                  <button key={c} type="button" className={`bp-chip${newCondition === c ? " on" : ""}`} onClick={() => setNewCondition(c)}>
                    {c === "new" ? t("condition.new", { defaultValue: "New" }) : t("condition.used", { defaultValue: "Used" })}
                  </button>
                ))}
              </div>
              <label className="bp-label">{t("booster.create.adDescription")}</label>
              <textarea className="bp-textarea" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} data-testid="booster-new-desc" />
              <p className="text-[11px] text-slate-500">{t("booster.create.descMin", { defaultValue: "Minimum 20 characters." })}</p>
            </div>
          )}

          {adType === "video_only" && (
            <div className="bp-card space-y-3">
              <label className="bp-label">{t("booster.create.adTitle")}</label>
              <input
                className="bp-input"
                value={adTitle}
                onChange={(e) => setAdTitle(e.target.value)}
                placeholder={t("booster.create.videoOnlyTitlePh", { defaultValue: "Event, service, or brand name" })}
                data-testid="booster-ad-title"
              />
              <label className="bp-label">{t("booster.create.adDescription")}</label>
              <textarea
                className="bp-textarea"
                value={adDescription}
                onChange={(e) => setAdDescription(e.target.value)}
                placeholder={t("booster.create.adDescriptionPh")}
              />
            </div>
          )}

          {adType && (
            <div
              className={cn("bp-card space-y-3", fieldErrors.video && "fb-field-invalid")}
              ref={videoSectionRef}
            >
              <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Video className="h-4 w-4 text-violet-600" />
                {t("booster.create.uploadMedia")}
              </h2>
              {fieldErrors.video && <p className="fb-field-error">{fieldErrors.video}</p>}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onPickVideo(f);
                }}
              />
              {uploading ? (
                <div className="bp-upload">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-violet-600" />
                  <div className="text-xs font-semibold text-violet-700 mt-2">
                    {uploadPercent < 100
                      ? t("boost.videoUploadingPct", { percent: uploadPercent, defaultValue: "Uploading video: {{percent}}%" })
                      : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                  </div>
                  <div className="h-1.5 rounded-full bg-violet-100 overflow-hidden max-w-xs mx-auto mt-2">
                    <div className="h-full bg-violet-600 transition-all" style={{ width: `${uploadPercent}%` }} />
                  </div>
                </div>
              ) : mediaPreview ? (
                <div className="space-y-2">
                  <AdaptiveVideoPlayer src={mediaPreview} maxHeight={280} muted controls />
                  <button
                    type="button"
                    className="bp-btn bp-btn-ghost w-full"
                    onClick={() => videoInputRef.current?.click()}
                    data-testid="booster-upload"
                  >
                    {t("boostWizard.step3Change", { defaultValue: "Change Video" })}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="bp-upload"
                  onClick={() => videoInputRef.current?.click()}
                  data-testid="booster-upload"
                >
                  <div className="font-bold text-violet-700">{t("booster.create.uploadMedia")}</div>
                  <div className="text-xs text-slate-500 mt-1">{t("booster.create.max2min")}</div>
                </button>
              )}

              {libraryVideos.length > 0 && (
                <div>
                  <label className="bp-label">
                    {t("booster.create.reuseVideo", { defaultValue: "Or reuse a video from your account" })}
                  </label>
                  <div className="bp-chip-row">
                    {libraryVideos.slice(0, 8).map((v) => (
                      <button
                        key={`${v.id}-${v.url}`}
                        type="button"
                        className={`bp-chip${videoUrl === v.url ? " on" : ""}`}
                        onClick={() => selectLibraryVideo(v.url!, v.title)}
                      >
                        {v.title.slice(0, 28)}{v.title.length > 28 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AUDIENCE ───────────────────────────────────────────── */}
      {step === "audience" && (
        <div className="bp-card flexa-boost">
          <BoostAudiencePanel
            ref={audiencePanelRef}
            country={accountCountry}
            audienceType={audienceType}
            onAudienceType={setAudienceType}
            audStates={departments}
            setAudStates={setDepartments}
            audCities={cities}
            setAudCities={setCities}
            audRadiusKm={radiusKm}
            setAudRadiusKm={setRadiusKm}
            ageMin={ageMin}
            ageMax={ageMax}
            setAgeMin={setAgeMin}
            setAgeMax={setAgeMax}
            gender={gender}
            setGender={setGender}
            geoError={geoError}
            onGeoErrorClear={() => { setGeoError(null); setFieldErrors((e) => ({ ...e, geo: "" })); }}
            estimatedLabel={t("booster.audience.noReachEstimate", {
              defaultValue: "Audience estimates appear only when reliable data is available.",
            })}
          />
        </div>
      )}

      {/* ── ACTION / CTA ───────────────────────────────────────── */}
      {step === "action" && (
        <div className="bp-card space-y-3" ref={actionSectionRef}>
          <h2 className="text-sm font-extrabold text-slate-800">
            {t("booster.cta.title", { defaultValue: "Call to action" })}
          </h2>
          <p className="text-xs text-slate-500">
            {t("booster.cta.subtitle", { defaultValue: "Optional. Choose one primary button for your ad." })}
          </p>
          <div className="bp-cta-grid">
            {([
              ["buy_now", ShoppingBag, t("buttons.buyNow", { defaultValue: "Buy Now" }), !hasProduct],
              ["message", MessageCircle, t("booster.cta.message", { defaultValue: "Message on Flexa" }), false],
              ["whatsapp", Phone, t("booster.cta.whatsapp", { defaultValue: "WhatsApp" }), false],
              ["none", Ban, t("booster.cta.none", { defaultValue: "No Button" }), false],
            ] as const).map(([id, Icon, label, disabled]) => (
              <button
                key={id}
                type="button"
                disabled={disabled}
                className={cn("bp-cta-option", ctaType === id && "on", disabled && "disabled")}
                onClick={() => setCtaType(id)}
                data-testid={`booster-cta-${id}`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {disabled && (
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {t("booster.cta.buyNowNeedsProduct", { defaultValue: "Requires a product" })}
                  </span>
                )}
              </button>
            ))}
          </div>
          {ctaType === "whatsapp" && (
            <div>
              <label className="bp-label">{t("booster.cta.whatsappNumber", { defaultValue: "WhatsApp business number" })}</label>
              <input
                className="bp-input"
                inputMode="tel"
                placeholder="+509 XXXX XXXX"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                data-testid="booster-whatsapp"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {t("booster.cta.whatsappHint", { defaultValue: "Include country code. Digits only after save." })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── BUDGET ─────────────────────────────────────────────── */}
      {step === "budget" && (
        <div className={cn("bp-card space-y-3", fieldErrors.budget && "fb-field-invalid")} ref={budgetSectionRef}>
          <label className="bp-label">{t("booster.budget.total")} (USD)</label>
          {fieldErrors.budget && <p className="fb-field-error">{fieldErrors.budget}</p>}
          <div className="bp-chip-row mb-2">
            {[2, 5, 10, 20, 50].map((b) => (
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
              min={MIN_BUDGET}
              step={0.01}
              value={customBudget}
              onChange={(e) => {
                setCustomBudget(e.target.value);
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) setBudget(n);
              }}
            />
          )}
          <p className="text-[11px] text-slate-500">
            {t("booster.budget.minNote", { defaultValue: "Minimum campaign budget: $2 USD." })}
          </p>

          <label className="bp-label">{t("booster.budget.duration", { defaultValue: "Duration" })}</label>
          <div className="bp-chip-row">
            {DURATION_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className={`bp-chip${durationDays === d ? " on" : ""}`}
                onClick={() => setDurationDays(d)}
                data-testid={`booster-days-${d}`}
              >
                {d} {t("booster.budget.days")}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>{t("booster.budget.total")}</span><strong>${budget.toFixed(2)} USD</strong></div>
            <div className="flex justify-between"><span>{t("booster.budget.daily", { defaultValue: "Est. daily spend" })}</span><strong>${dailySpend.toFixed(2)}</strong></div>
            <div className="flex justify-between"><span>{t("booster.review.duration")}</span><strong>{startDate} → {endDate}</strong></div>
            <p className="text-[11px] text-slate-500 pt-1">
              {t("booster.budget.noGuarantee", { defaultValue: "Budgets do not guarantee views, clicks, or sales." })}
            </p>
          </div>
        </div>
      )}

      {/* ── REVIEW ─────────────────────────────────────────────── */}
      {step === "review" && (
        <div className="bp-card grid gap-4 md:grid-cols-2">
          <div className="bp-preview-card" style={{ background: "#fff", color: "#0f172a" }}>
            <div className="relative">
              <div className="absolute top-2 left-2 z-10">
                <span className="bp-sponsored-pill" style={{ background: "#dc2626" }}>{t("boostAd.sponsored")}</span>
              </div>
              {mediaPreview || videoUrl ? (
                <AdaptiveVideoPlayer
                  src={mediaPreview || videoUrl || ""}
                  poster={resolvedImages[0]}
                  maxHeight={320}
                  muted
                  controls
                />
              ) : (
                <div className="bp-preview-media" />
              )}
            </div>
            {hasProduct && (
              <div className="flex items-start gap-3 p-3 border-t border-slate-100">
                {resolvedImages[0] ? (
                  <img src={resolvedImages[0]} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-slate-100 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{resolvedTitle || "—"}</div>
                  {resolvedPrice > 0 && (
                    <div className="text-sm font-semibold text-violet-700">
                      {formatPrice(resolvedPrice, accountCountry, "USD")}
                    </div>
                  )}
                  {(adDescription || newDesc) && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                      {(adType === "new" ? newDesc : adDescription).slice(0, 90)}
                    </p>
                  )}
                </div>
              </div>
            )}
            {!hasProduct && (
              <div className="bp-preview-meta" style={{ color: "#0f172a" }}>
                <div className="font-bold">{resolvedTitle || "—"}</div>
                {user?.name ? <div className="opacity-70 text-xs mt-1">{user.name}</div> : null}
              </div>
            )}
            {ctaType !== "none" && (
              <div className="px-3 pb-3">
                <div className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-sm font-bold px-3 py-2.5">
                  {ctaLabel(ctaType)}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div><strong>{t("booster.review.type")}:</strong>{" "}
              {adType === "existing"
                ? t("booster.create.promoteExisting", { defaultValue: "Promote Existing Product" })
                : adType === "new"
                  ? t("booster.create.createPromote", { defaultValue: "Create & Promote Product" })
                  : t("booster.create.videoOnly", { defaultValue: "Promote Video Only" })}
            </div>
            <div>
              <strong>{t("boost.targetAreas", { defaultValue: "Target Areas" })}:</strong>{" "}
              {accountCountry}
              {departments.length ? ` · ${departments.join(", ")}` : audienceType === "advantage_plus" ? " · Automatic" : ""}
              {cities.length ? ` · ${cities.slice(0, 3).join(", ")}` : ""}
            </div>
            <div><strong>{t("booster.cta.title", { defaultValue: "CTA" })}:</strong> {ctaLabel(ctaType)}</div>
            <div><strong>{t("booster.review.budget")}:</strong> ${budget.toFixed(2)} ({durationDays} {t("booster.budget.days")})</div>
            <div><strong>{t("booster.budget.daily", { defaultValue: "Est. daily spend" })}:</strong> ${dailySpend.toFixed(2)} / day</div>
            <div className="text-xs text-slate-500 pt-2">{t("booster.review.walletNote")}</div>
            <button type="button" className="bp-btn bp-btn-ghost mt-2" onClick={() => setStep("create")}>
              {t("common.edit", { defaultValue: "Edit" })}
            </button>
          </div>
        </div>
      )}

      <div className="bp-actions">
        {step !== "create" && (
          <button type="button" className="bp-btn bp-btn-ghost" onClick={goBack} disabled={busy || creatingProduct}>
            {t("booster.back")}
          </button>
        )}
        {step !== "review" ? (
          <button
            type="button"
            className="bp-btn bp-btn-primary"
            disabled={!canNext() || creatingProduct || uploading}
            onClick={() => void goNext()}
            data-testid="booster-next"
          >
            {creatingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : t("booster.next")}
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("booster.create.payPublish", { defaultValue: "Pay & Publish" })}
            </button>
          </>
        )}
      </div>
    </BoosterLayout>
  );
}
