import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateListing, useUpdateListing, useGetListing, useGetCategories, getGetListingsQueryKey, getGetListingQueryKey, getGetUserListingsQueryKey } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { useRestriction } from "@/hooks/useRestriction";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { X, Globe, Loader2, ChevronRight, ArrowLeft, Check, Camera, Images, ImagePlus, Video, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES, citiesFor, stateForCity, statesFor } from "@/lib/countries";
import { MULTI_CURRENCY_COUNTRIES, getCurrencySymbolByCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { STRIPE_SUPPORTED_COUNTRIES, MONCASH_COUNTRIES } from "@/lib/paymentCountries";
import ListingCard from "@/components/ListingCard";

const MAX_IMAGES = 5;
const OTHER_CITY = "__other__";
const DRAFT_KEY = "flexa_sell_draft_v2";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description too short"),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  categoryId: z.coerce.number().positive("Select a category"),
  subcategoryId: z.coerce.number().optional().nullable(),
  condition: z.enum(["new", "like_new", "good", "fair", "poor"]),
  country: z.string().min(1, "Select a country"),
  city: z.string().min(1, "Enter a city"),
  state: z.string().optional(),
  location: z.string().min(2, "Enter a location"),
  stockQuantity: z.coerce.number().int().positive().optional().nullable(),
});

interface UploadedImage {
  objectPath: string;
  previewUrl: string;
  fileName: string;
}

function getStorageUrl(objectPath: string): string {
  // Cloudinary / full CDN URLs — use directly
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) return objectPath;
  const trimmed = objectPath.startsWith("/objects/")
    ? objectPath.slice("/objects/".length)
    : objectPath;
  return `/api/storage/objects/${trimmed}`;
}

export default function Sell() {
  const { user } = useAuth();
  const { isRestricted, showRestrictionToast } = useRestriction();
  const isAdmin = !!(user as any)?.isAdmin || !!(user as any)?.isSuperAdmin;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ── Edit mode detection ────────────────────────────────────────────────────
  const editId = (() => {
    const raw = new URLSearchParams(window.location.search).get("edit");
    const n = raw ? parseInt(raw, 10) : NaN;
    return isNaN(n) ? null : n;
  })();
  const isEditMode = editId !== null;

  const [currency, setCurrency] = useState<"USD" | "HTG" | "DOP">("USD");
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<"parents" | "subs">("parents");
  const [pendingParent, setPendingParent] = useState<{ id: number; slug: string; name: string; icon: string; children?: { id: number; slug: string; name: string; icon: string }[] } | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { data: categories } = useGetCategories();
  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const isPending = isEditMode ? updateListing.isPending : createListing.isPending;

  // Fetch existing listing when editing
  // editId ?? 0: when null, id=0 → enabled:!!0=false → query skipped automatically
  const { data: existingListing } = useGetListing(editId ?? 0);
  const [editPrefilled, setEditPrefilled] = useState(false);

  const { uploadFile } = useUpload();

  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentReady, setPaymentReady] = useState<boolean | null>(null);
  const [cardPayoutMethod, setCardPayoutMethod] = useState<"fm_wallet" | "stripe" | null>(null);
  const [stripeAccountActive, setStripeAccountActive] = useState(false);
  const [savingPayoutMethod, setSavingPayoutMethod] = useState(false);
  const [isStripeCountry, setIsStripeCountry] = useState(false);
  const [intlShippingCost, setIntlShippingCost] = useState<string>("");
  const [intlCarriers, setIntlCarriers] = useState<string[]>([]);
  const [sellerDeliveryMethod, setSellerDeliveryMethod] = useState<"motorcycle" | "car" | "bus" | "self_delivery">("motorcycle");
  const [itemSize, setItemSize] = useState<string>("");
  const [weightLbs, setWeightLbs] = useState<string>("");
  const [pkgLength, setPkgLength] = useState<string>("");
  const [pkgWidth,  setPkgWidth]  = useState<string>("");
  const [pkgHeight, setPkgHeight] = useState<string>("");
  const [myListingCount, setMyListingCount] = useState<{ totalCount: number; activeCount: number } | null>(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      price: 0,
      categoryId: 0,
      subcategoryId: null as number | null,
      condition: "good" as const,
      country: user?.country ?? "",
      city: "",
      state: "",
      location: user?.location ?? "",
      stockQuantity: null as number | null,
    },
  });

  useEffect(() => {
    if (!user) setLocation("/auth/login");
  }, [user]);

  useEffect(() => {
    const tk = localStorage.getItem("flexamarket_token") ?? "";
    if (!tk) return;
    fetch("/api/listings/my-count", { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMyListingCount(d); })
      .catch(() => null);
  }, []);

  // Payment method validation
  useEffect(() => {
    if (!user) return;
    const tk = localStorage.getItem("flexamarket_token") ?? "";
    const stripeSupported = STRIPE_SUPPORTED_COUNTRIES.has(user.country ?? "");
    const isMoncashCountry = MONCASH_COUNTRIES.has(user.country ?? "");
    setIsStripeCountry(stripeSupported);

    const stripeCheck = fetch("/api/stripe/connect/status", {
      headers: { Authorization: `Bearer ${tk}` },
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // Always fetch payout account — need cardPayoutMethod for Kat FM check
    const payoutCheck = fetch("/api/seller/payout-account", {
      headers: { Authorization: `Bearer ${tk}` },
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    Promise.all([stripeCheck, payoutCheck]).then(([stripeData, payoutData]) => {
      const stripeActive = stripeData?.stripeAccountStatus === "active";
      const currentMethod = payoutData?.cardPayoutMethod ?? null;
      setStripeAccountActive(stripeActive);
      setCardPayoutMethod(currentMethod);
      // Kat FM: seller chose fm_wallet → always ready (earnings auto-credited to FM wallet)
      const hasKatFM = currentMethod === "fm_wallet";
      if (hasKatFM) {
        setPaymentReady(true);
      } else if (stripeSupported) {
        setPaymentReady(stripeActive);
      } else if (isMoncashCountry) {
        const hasMoncash = !!(payoutData?.moncashNumber);
        setPaymentReady(stripeActive || hasMoncash);
      } else {
        setPaymentReady(stripeActive);
      }
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPayoutMethod = useCallback(async (method: "fm_wallet" | "stripe") => {
    const tk = localStorage.getItem("flexamarket_token") ?? "";
    setSavingPayoutMethod(true);
    try {
      const res = await fetch("/api/seller/payout-account/card-method", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ method }),
      });
      if (!res.ok) throw new Error();
      setCardPayoutMethod(method);
      if (method === "fm_wallet") {
        setPaymentReady(true);
      } else {
        setPaymentReady(stripeAccountActive);
      }
    } catch {
      toast({ title: "Erè", description: "Pa kapab sovgade metòd peman an.", variant: "destructive" });
    } finally {
      setSavingPayoutMethod(false);
    }
  }, [stripeAccountActive, toast]);

  // Sync country from profile into the form whenever the user object loads.
  useEffect(() => {
    if (user?.country && !form.getValues("country")) {
      form.setValue("country", user.country);
    }
  }, [user?.country]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-fill form from existing listing (edit mode) ───────────────────────
  useEffect(() => {
    if (!isEditMode || !existingListing || editPrefilled) return;
    const l = existingListing as any;
    form.setValue("title",         l.title ?? "");
    form.setValue("description",   l.description ?? "");
    form.setValue("price",         l.price ?? 0);
    form.setValue("condition",     l.condition ?? "good");
    form.setValue("country",       l.country ?? "");
    form.setValue("city",          l.city ?? "");
    if (l.city) setCityDisplayValue(l.city);
    form.setValue("state",         l.state ?? "");
    form.setValue("location",      l.location ?? "");
    if (l.stockQuantity != null) form.setValue("stockQuantity", l.stockQuantity);
    if (l.currency) setCurrency(l.currency as "USD" | "HTG" | "DOP");
    if (l.categoryId) {
      form.setValue("categoryId", l.categoryId);
      setSelectedCategoryId(l.categoryId);
    }
    if (l.subcategoryId != null) form.setValue("subcategoryId", l.subcategoryId);
    if (Array.isArray(l.images) && l.images.length > 0) {
      const restored: UploadedImage[] = l.images.map((url: string) => {
        const objectPath = url.startsWith("/api/storage/objects/")
          ? url.slice("/api/storage/objects/".length)
          : url;
        return { objectPath, previewUrl: url, fileName: objectPath.split("/").pop() ?? "image" };
      });
      setUploadedImages(restored);
    }
    if (l.deliveryMethod) setSellerDeliveryMethod(l.deliveryMethod as "motorcycle" | "car" | "bus" | "self_delivery");
    if (l.shippingCost)    setIntlShippingCost(String(l.shippingCost));
    if (Array.isArray(l.shippingCarriers) && l.shippingCarriers.length > 0) setIntlCarriers(l.shippingCarriers);
    if (l.listingVideoUrl) setListingVideoUrl(l.listingVideoUrl);
    if (l.itemSize) setItemSize(l.itemSize);
    setEditPrefilled(true);
  }, [existingListing, isEditMode, editPrefilled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft system — refs & callbacks (declared early so onSubmit can call clearDraft) ──
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftDataRef = useRef<{ currency: "USD" | "HTG" | "DOP"; uploadedImages: UploadedImage[]; listingVideoUrl: string | null }>({
    currency: "USD", uploadedImages: [], listingVideoUrl: null,
  });

  const saveDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          form: form.getValues(),
          ...draftDataRef.current,
          savedAt: new Date().toISOString(),
        }));
        setDraftSavedAt(new Date());
      } catch { /* storage quota */ }
    }, 1200);
  }, [form]);

  const clearDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraftSavedAt(null);
    setDraftRestored(false);
  }, []);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please select image files only.";
    if (file.size > 10 * 1024 * 1024) return "Each image must be under 10MB.";
    return null;
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const currentCount = uploadedImages.length;
    const remaining = MAX_IMAGES - currentCount;
    const toUpload = fileArray.slice(0, remaining);

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      const err = validateFile(file);
      if (err) { toast({ title: "Invalid file", description: err, variant: "destructive" }); continue; }
      const slotIndex = currentCount + i;
      setUploadingSlot(slotIndex);
      try {
        const result = await uploadFile(file);
        if (!result) { toast({ title: "Upload failed", description: "Could not upload the image.", variant: "destructive" }); continue; }
        const newImage: UploadedImage = {
          objectPath: result.objectPath,
          previewUrl: getStorageUrl(result.objectPath),
          fileName: file.name,
        };
        setUploadedImages(prev => prev.length < MAX_IMAGES ? [...prev, newImage] : prev);
      } catch {
        toast({ title: "Upload failed", description: "Could not upload the image.", variant: "destructive" });
      } finally {
        setUploadingSlot(null);
      }
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (values: z.infer<typeof schema>) => {
    if (isRestricted) { showRestrictionToast(); return; }
    setSubmitError(null);
    const imageUrls = uploadedImages.map(img => getStorageUrl(img.objectPath));
    if (!isEditMode && imageUrls.length < 2) {
      toast({ title: "Ou bezwen omwen 2 foto pou pibliye yon anonn.", variant: "destructive" });
      return;
    }
    const isLocalDelivery = ["Haiti", "Dominican Republic"].includes(values.country ?? "");
    const payload = { ...values, currency, images: imageUrls, subcategoryId: values.subcategoryId ?? undefined, stockQuantity: values.stockQuantity ?? undefined, itemSize: itemSize || undefined, listingVideoUrl: listingVideoUrl ?? undefined, shippingCost: !isLocalDelivery && intlShippingCost ? Number(intlShippingCost) : undefined, shippingCarriers: !isLocalDelivery && intlCarriers.length > 0 ? intlCarriers : undefined, deliveryMethod: isLocalDelivery ? sellerDeliveryMethod : undefined, weightLbs: weightLbs ? Number(weightLbs) : undefined, packageLengthIn: pkgLength ? Number(pkgLength) : undefined, packageWidthIn: pkgWidth ? Number(pkgWidth) : undefined, packageHeightIn: pkgHeight ? Number(pkgHeight) : undefined };

    const handleSuccess = (_listing: any) => {
      const l = _listing as any;
      if (isEditMode && editId) {
        // Edit mode: invalidate caches and go back to the listing
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(editId) });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey(l.sellerId ?? (existingListing as any)?.sellerId) });
        toast({ title: "Anonn modifye!", description: "Chanjman yo sovgade avèk siksè." });
        setLocation(`/listings/${editId}`);
        return;
      }
      // Create mode
      clearDraft();
      if (l.moderationStatus === "rejected") {
        toast({ title: t("sell.moderation.rejectedTitle"), description: t("sell.moderation.rejectedDesc"), variant: "destructive" });
        setLocation("/profile");
      } else if (l.moderationStatus === "pending") {
        toast({ title: t("sell.moderation.pendingTitle"), description: t("sell.moderation.pendingDesc") });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        setLocation("/profile");
      } else {
        toast({ title: t("sell.moderation.approvedTitle"), description: t("sell.moderation.approvedDesc") });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        setLocation(`/listings/${l.id}`);
      }
    };

    const handleError = (e: any) => {
      const raw: unknown = e?.data?.error;
      const isRawJson =
        typeof raw === "string" &&
        (raw.trimStart().startsWith("[") || raw.trimStart().startsWith("{\"code\""));
      const description = !raw || isRawJson
        ? t("sell.createError", "Something went wrong. Please check all fields and try again.")
        : String(raw);
      setSubmitError(description);
      toast({ title: t("errors.submitFailed", "Submission failed"), description, variant: "destructive" });
    };

    if (isEditMode && editId) {
      updateListing.mutate(
        { id: editId, data: payload as any },
        { onSuccess: handleSuccess, onError: handleError },
      );
    } else {
      createListing.mutate(
        { data: payload as any },
        { onSuccess: handleSuccess, onError: handleError },
      );
    }
  };

  // Country is watched from the form so it reacts to user selection
  const selectedCountry = form.watch("country") ?? "";
  const countryFlag = selectedCountry ? COUNTRY_FLAGS[selectedCountry] : null;
  const cityOptions = useMemo(() => citiesFor(selectedCountry), [selectedCountry]);
  const stateOptions = useMemo(() => statesFor(selectedCountry), [selectedCountry]);

  // Reset currency to USD whenever country changes (unless the selected currency
  // is still valid for the new country).
  useEffect(() => {
    const options = MULTI_CURRENCY_COUNTRIES[selectedCountry];
    if (!options) {
      // Country has no local currency option — always USD
      setCurrency("USD");
    } else {
      const valid = options.some(o => o.code === currency);
      if (!valid) setCurrency("USD");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry]);
  const [useOtherCity, setUseOtherCity] = useState(false);
  // Separate display state for the city Select — gives us instant, reliable
  // reset control without relying on React Hook Form's internal re-render timing.
  const [cityDisplayValue, setCityDisplayValue] = useState("");

  // Auto-fill state when city is picked from the known list
  const autoFillState = useCallback((pickedCity: string) => {
    const derived = stateForCity(pickedCity);
    if (derived) form.setValue("state", derived, { shouldDirty: true });
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video upload ──────────────────────────────────────────────────────────
  const { uploadFile: uploadVideoFile, progress: videoUploadProgress } = useUpload();
  const [listingVideoUrl, setListingVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const MAX_VIDEO_SECONDS = 180;
  const MAX_VIDEO_BYTES   = 300 * 1024 * 1024; // 300 MB — matches server cap

  // Subscription plan check — user.subscriptionPlan comes from the API (all DB fields returned)
  const userPlan = (user as any)?.subscriptionPlan as string | null | undefined;
  const planExpiry = (user as any)?.subscriptionExpiresAt as string | null | undefined;
  const planExpired = planExpiry ? new Date(planExpiry) < new Date() : false;
  const hasVideoPlan = !!userPlan && userPlan !== "basic" && !planExpired;
  const hasActivePlan = !!userPlan && !planExpired;

  const probeVideoDuration = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
      v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode-failed")); };
      v.src = url;
    });

  const handleVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast({ title: t("sell.videoTooBig"), variant: "destructive" });
      return;
    }
    try {
      const seconds = await probeVideoDuration(file);
      if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
        toast({ title: t("sell.videoTooLong"), variant: "destructive" });
        return;
      }
    } catch {
      // Can't read duration (e.g. HEVC/MOV on iOS) — allow upload; server enforces size limit
    }
    setVideoUploading(true);
    try {
      const result = await uploadVideoFile(file);
      if (!result) {
        toast({ title: t("sell.videoUploadFailed"), variant: "destructive" });
        return;
      }
      setListingVideoUrl(result.objectPath);
    } finally {
      setVideoUploading(false);
    }
  };

  // Keep draftDataRef current every render so saveDraft always reads latest non-form state
  draftDataRef.current = { currency, uploadedImages, listingVideoUrl };

  // ── Restore draft on first mount (skip in edit mode) ─────────────────────
  useEffect(() => {
    if (isEditMode) return; // don't restore draft when editing an existing listing
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft?.savedAt) return;
      // Expire drafts older than 7 days
      if (Date.now() - new Date(draft.savedAt).getTime() > 7 * 24 * 3_600_000) {
        localStorage.removeItem(DRAFT_KEY); return;
      }
      const f = draft.form ?? {};
      if (f.title)           form.setValue("title", f.title);
      if (f.description)     form.setValue("description", f.description);
      if (f.price)           form.setValue("price", f.price);
      if (f.categoryId)      { form.setValue("categoryId", f.categoryId); setSelectedCategoryId(f.categoryId); }
      if (f.subcategoryId != null) form.setValue("subcategoryId", f.subcategoryId);
      if (f.condition)       form.setValue("condition", f.condition);
      if (f.city)            { form.setValue("city", f.city); setCityDisplayValue(f.city); }
      if (f.state)           form.setValue("state", f.state);
      if (f.location)        form.setValue("location", f.location);
      if (f.stockQuantity != null) form.setValue("stockQuantity", f.stockQuantity);
      if (draft.currency)    setCurrency(draft.currency);
      if (Array.isArray(draft.images) && draft.images.length > 0) setUploadedImages(draft.images);
      if (draft.listingVideoUrl) setListingVideoUrl(draft.listingVideoUrl);
      setDraftRestored(true);
    } catch { /* corrupt data — ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save on form field changes ──────────────────────────────────────
  useEffect(() => {
    const sub = form.watch(() => saveDraft());
    return () => sub.unsubscribe();
  }, [form, saveDraft]);

  // ── Auto-save on non-form state changes ──────────────────────────────────
  useEffect(() => { saveDraft(); }, [currency, uploadedImages, listingVideoUrl, saveDraft]);

  const canAddMore = uploadedImages.length < MAX_IMAGES;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold text-foreground mb-2">
        {isEditMode ? t("sell.editTitle") : t("sell.pageTitle")}
      </h1>
      {isEditMode && !editPrefilled && (
        <p className="text-sm text-muted-foreground mb-4">{t("sell.loadingEdit")}</p>
      )}

      {myListingCount !== null && myListingCount.activeCount >= 3 && myListingCount.activeCount < 4 && !hasActivePlan && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/40 px-4 py-3">
          <span className="text-2xl leading-none mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{t("sell.lastFreeSlot")}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{t("sell.lastFreeSlotDesc")}</p>
          </div>
        </div>
      )}
      {myListingCount !== null && myListingCount.activeCount >= 4 && !hasActivePlan && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-orange-400/40 bg-orange-50 dark:bg-orange-950/40 px-4 py-3">
          <span className="text-2xl leading-none mt-0.5">🚫</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-700 dark:text-orange-300">{t("sell.freeLimit", { count: myListingCount.activeCount, max: 4 })}</p>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">{t("sell.freeLimitDesc")}</p>
            <button
              type="button"
              onClick={() => setLocation("/subscription")}
              className="mt-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-3 py-1.5"
            >
              {t("sell.seePlans")}
            </button>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* ── Draft restored banner ─────────────────────────────────── */}
          {draftRestored && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 12,
              background: "#EFF6FF", border: "1px solid #BFDBFE",
            }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>
                  {t("sell.draftRestored")}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#3B82F6" }}>
                  {t("sell.draftRestoredDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  form.reset();
                  setUploadedImages([]);
                  setListingVideoUrl(null);
                  setCurrency("USD");
                }}
                style={{ fontSize: 11, color: "#93C5FD", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap" }}
              >
                {t("sell.clearDraft")}
              </button>
            </div>
          )}

          {/* Image upload section */}
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              {t("sell.photos")} <span className="text-muted-foreground font-normal">({uploadedImages.length}/{MAX_IMAGES})</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {uploadedImages.map((img, i) => (
                <div
                  key={img.objectPath}
                  className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted group"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.fileName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3C/svg%3E";
                    }}
                  />
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-medium">{t("sell.coverPhoto")}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-image-${i}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {canAddMore && (
                <>
                  <div
                    className="relative aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors bg-muted/30 cursor-pointer flex flex-col items-center justify-center gap-1"
                    onClick={() => fileInputRefs.current[uploadedImages.length]?.click()}
                    data-testid="button-add-image"
                  >
                    {uploadingSlot === uploadedImages.length ? (
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{t("sell.gallery")}</span>
                      </>
                    )}
                    <input
                      ref={el => { fileInputRefs.current[uploadedImages.length] = el; }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      data-testid={`input-image-${uploadedImages.length}`}
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
                        e.target.value = "";
                      }}
                      disabled={uploadingSlot !== null}
                    />
                  </div>
                  <label
                    className="relative aspect-square rounded-lg border-2 border-dashed border-primary/40 hover:border-primary transition-colors bg-primary/5 cursor-pointer flex flex-col items-center justify-center gap-1"
                    data-testid="button-camera-image"
                  >
                    <Camera className="h-6 w-6 text-primary" />
                    <span className="text-xs text-primary">{t("sell.camera")}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFiles([file]);
                        e.target.value = "";
                      }}
                      disabled={uploadingSlot !== null}
                    />
                  </label>
                </>
              )}
            </div>
            {uploadedImages.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">{t("sell.addPhotosHint")}</p>
            )}

            {/* ── Professional photo tips card ── */}
            <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
                {t("sell.photoTipsTitle")}
              </p>
              <ul className="space-y-1">
                {([
                  t("sell.photoTip1"),
                  t("sell.photoTip2"),
                  t("sell.photoTip3"),
                  t("sell.photoTip4"),
                ] as string[]).map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <span className="mt-0.5 shrink-0 text-amber-500">✓</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("sell.listingTitle")}</FormLabel>
              <FormControl><Input placeholder={t("sell.titlePlaceholder")} {...field} data-testid="input-title" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("sell.description")}</FormLabel>
              <FormControl><Textarea placeholder={t("sell.descriptionPlaceholder")} rows={4} {...field} data-testid="input-description" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="price" render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between mb-1.5">
                <FormLabel className="mb-0">{t("sell.price")}</FormLabel>
                {/* Country-aware currency selector */}
                {(() => {
                  const options = MULTI_CURRENCY_COUNTRIES[selectedCountry] ?? [{ code: "USD", symbol: "$", label: "$ USD" }];
                  if (options.length <= 1) return null;
                  return (
                    <div className="flex items-center gap-0 border border-border rounded-lg overflow-hidden">
                      {options.map(opt => (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => setCurrency(opt.code as "USD" | "HTG" | "DOP")}
                          className={cn(
                            "px-3 py-1 text-xs font-bold transition-colors",
                            currency === opt.code
                              ? "bg-primary text-white"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <FormControl>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">
                    {getCurrencySymbolByCode(currency).trim()}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step={currency === "USD" ? "0.01" : "1"}
                    placeholder={currency === "USD" ? "0.00" : "0"}
                    className="pl-7"
                    {...field}
                    data-testid="input-price"
                  />
                </div>
              </FormControl>
              {currency === "HTG" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Goud Ayisyen (HTG) — Prix la pral afiche kòm G{field.value ? Math.round(Number(field.value)).toLocaleString() : "0"}
                </p>
              )}
              {currency === "DOP" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Peso Dominikèn (DOP) — Prix la pral afiche kòm{" "}
                  <strong>RD {field.value ? Math.round(Number(field.value)).toLocaleString() : "0"}</strong>
                </p>
              )}
              <FormMessage />
            </FormItem>
          )} />

          {/* Category picker — sheet-based, Facebook Marketplace style */}
          <FormField control={form.control} name="categoryId" render={({ field }) => {
            const selectedSubId = form.watch("subcategoryId");
            const selectedCat = categories?.find(c => c.id === field.value);
            const selectedSub = selectedCat
              ? (selectedCat as any).children?.find((s: any) => s.id === selectedSubId)
              : null;

            const openSheet = () => {
              setSheetStep("parents");
              setPendingParent(null);
              setCatSheetOpen(true);
            };

            const selectParent = (cat: NonNullable<typeof categories>[number]) => {
              const subs = (cat as any).children ?? [];
              if (subs.length > 0) {
                setPendingParent(cat);
                setSheetStep("subs");
              } else {
                field.onChange(cat.id);
                setSelectedCategoryId(cat.id);
                form.setValue("subcategoryId", null);
                if (cat.id !== 4 && cat.id !== 5) setItemSize("");
                setCatSheetOpen(false);
              }
            };

            const selectSub = (sub: any) => {
              if (!pendingParent) return;
              field.onChange(pendingParent.id);
              setSelectedCategoryId(pendingParent.id);
              form.setValue("subcategoryId", sub.id);
              if (pendingParent.id !== 4 && pendingParent.id !== 5) setItemSize("");
              setCatSheetOpen(false);
            };

            return (
              <FormItem>
                <FormLabel>{t("sell.category")}</FormLabel>

                {/* Trigger row */}
                <button
                  type="button"
                  onClick={openSheet}
                  data-testid="select-category"
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors",
                    selectedCat
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {selectedCat ? (
                    <>
                      <span className="text-2xl leading-none shrink-0">{selectedCat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {t(`categories.${selectedCat.slug}`, { defaultValue: selectedCat.name })}
                        </div>
                        {selectedSub && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {selectedSub.name}
                          </div>
                        )}
                      </div>
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    </>
                  ) : (
                    <>
                      <span className="text-xl shrink-0">📂</span>
                      <span className="flex-1 text-sm">{t("sell.selectCategory", "Select a category…")}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                  )}
                </button>

                <FormMessage />

                {/* Sheet */}
                <Sheet open={catSheetOpen} onOpenChange={(open) => {
                  setCatSheetOpen(open);
                  if (!open) setSheetStep("parents");
                }}>
                  <SheetContent
                    side="bottom"
                    className="h-[85vh] flex flex-col p-0 rounded-t-2xl"
                  >
                    <SheetHeader className="flex-row items-center gap-2 px-4 pt-4 pb-3 border-b shrink-0">
                      {sheetStep === "subs" && (
                        <button
                          type="button"
                          onClick={() => setSheetStep("parents")}
                          className="p-1.5 rounded-full hover:bg-muted transition-colors"
                          aria-label="Back"
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </button>
                      )}
                      <SheetTitle className="text-base font-bold flex-1">
                        {sheetStep === "parents"
                          ? t("sell.category")
                          : (pendingParent
                              ? `${pendingParent.icon}  ${t(`categories.${pendingParent.slug}`, { defaultValue: pendingParent.name })}`
                              : t("sell.subcategory"))
                        }
                      </SheetTitle>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto overscroll-contain">
                      {sheetStep === "parents" && (
                        <ul className="divide-y divide-border">
                          {(categories ?? []).map(cat => {
                            const isSelected = field.value === cat.id;
                            return (
                              <li key={cat.id}>
                                <button
                                  type="button"
                                  onClick={() => selectParent(cat)}
                                  data-testid={`button-category-${cat.slug}`}
                                  className={cn(
                                    "w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors active:bg-primary/10",
                                    isSelected
                                      ? "bg-primary/5 text-primary"
                                      : "hover:bg-muted/60 text-foreground"
                                  )}
                                >
                                  <span className="text-2xl w-8 text-center shrink-0">{cat.icon}</span>
                                  <span className="flex-1 text-sm font-medium">
                                    {t(`categories.${cat.slug}`, { defaultValue: cat.name })}
                                  </span>
                                  {isSelected && !((cat as any).children?.length > 0)
                                    ? <Check className="h-4 w-4 text-primary shrink-0" />
                                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  }
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {sheetStep === "subs" && pendingParent && (
                        <ul className="divide-y divide-border">
                          {((pendingParent as any).children ?? []).map((sub: any) => {
                            const isSelected = form.watch("subcategoryId") === sub.id
                              && field.value === pendingParent.id;
                            return (
                              <li key={sub.id}>
                                <button
                                  type="button"
                                  onClick={() => selectSub(sub)}
                                  data-testid={`button-subcategory-${sub.slug}`}
                                  className={cn(
                                    "w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors active:bg-primary/10",
                                    isSelected
                                      ? "bg-primary/5 text-primary"
                                      : "hover:bg-muted/60 text-foreground"
                                  )}
                                >
                                  {sub.icon && (
                                    <span className="text-xl w-8 text-center shrink-0">{sub.icon}</span>
                                  )}
                                  <span className="flex-1 text-sm font-medium">{sub.name}</span>
                                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </FormItem>
            );
          }} />

          <FormField control={form.control} name="stockQuantity" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("sell.stockQuantity", "Kantite an stock")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("sell.stockQuantityPlaceholder", "Kite vid si ou gen yon sèl atik")}
                  value={field.value ?? ""}
                  onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  data-testid="input-stock-quantity"
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t("sell.stockQuantityHint", "Ekri kantite si ou gen plizyè. Sistèm nan pral diminye otomatikman chak fwa ou vann youn.")}</p>
              <FormMessage />
            </FormItem>
          )} />

          {/* ── Video upload section ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Video className="h-4 w-4 text-muted-foreground" />
              {t("sell.videoLabel")}
            </p>
            {hasVideoPlan ? (
              <>
                <p className="text-xs text-muted-foreground">{t("sell.videoHint")}</p>
                <input
                  ref={videoFileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  data-testid="input-video-file"
                  onChange={handleVideoSelected}
                />
                {listingVideoUrl ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-green-500/40 bg-green-50 dark:bg-green-950/20">
                    <Video className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-300 truncate" data-testid="text-video-attached">
                      {t("sell.videoAttached")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setListingVideoUrl(null)}
                      className="ml-auto text-muted-foreground hover:text-destructive p-0.5 rounded"
                      data-testid="button-video-remove"
                      aria-label={t("sell.videoRemove")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => videoFileInputRef.current?.click()}
                      disabled={videoUploading}
                      data-testid="button-video-pick"
                    >
                      {videoUploading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("sell.videoUploading")} {videoUploadProgress}%</>
                      ) : (
                        <><Video className="h-4 w-4 mr-2" />{t("sell.videoPick")}</>
                      )}
                    </Button>
                    {videoUploading && (
                      <div
                        className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={videoUploadProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        data-testid="video-upload-progress"
                      >
                        <div
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${videoUploadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-start gap-3 px-3 py-3 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
                <Video className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("sell.videoUpgradeTitle")}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t("sell.videoUpgradeMsg")}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-900/30"
                  onClick={() => setLocation("/subscription")}
                  data-testid="button-video-upgrade"
                >
                  {t("sell.videoUpgradeBtn")}
                </Button>
              </div>
            )}
          </div>

          <FormField control={form.control} name="condition" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("sell.condition")}</FormLabel>
              <FormControl>
                <select
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  data-testid="select-condition"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  style={{ fontSize: "16px" }}
                >
                  <option value="" disabled>{t("sell.selectCondition")}</option>
                  <option value="new">{t("listing.conditions.new")}</option>
                  <option value="like_new">{t("listing.conditions.like_new")}</option>
                  <option value="good">{t("listing.conditions.good")}</option>
                  <option value="fair">{t("listing.conditions.fair")}</option>
                  <option value="poor">{t("listing.conditions.for_parts")}</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Size — only for Fashion (4) or Shoes (5) */}
          {(selectedCategoryId === 4 || selectedCategoryId === 5) && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">
                {selectedCategoryId === 5 ? t("sell.itemSizeShoe") : t("sell.itemSizeClothing")}
              </label>
              <select
                value={itemSize}
                onChange={(e) => setItemSize(e.target.value)}
                data-testid="select-item-size"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ fontSize: "16px" }}
              >
                <option value="">{t("sell.selectSize")}</option>
                {selectedCategoryId === 5 ? (
                  [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46].map((s) => (
                    <option key={s} value={String(s)}>{s}</option>
                  ))
                ) : (
                  ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Country — editable for admins, read-only for regular users */}
          <FormField control={form.control} name="country" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                {t("sell.country", "Country")}
                {isAdmin && (
                  <span className="ml-1 text-[10px] font-bold tracking-widest text-cyan-500 font-mono">ADM</span>
                )}
              </FormLabel>
              {isAdmin ? (
                <select
                  value={field.value ?? ""}
                  onChange={e => {
                    field.onChange(e.target.value);
                    form.setValue("city", "");
                    form.setValue("state", "");
                    setCityDisplayValue("");
                    setUseOtherCity(false);
                  }}
                  className="h-9 w-full rounded-md border border-cyan-300 dark:border-cyan-700 bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  style={{ fontSize: "16px" }}
                >
                  <option value="">— {t("sell.selectCountry", "Chwazi peyi")} —</option>
                  {SUPPORTED_COUNTRIES.map(c => (
                    <option key={c} value={c}>{COUNTRY_FLAGS[c] ? `${COUNTRY_FLAGS[c]} ` : ""}{c}</option>
                  ))}
                </select>
              ) : (
                <div className="flex h-9 items-center justify-between rounded-md border border-input bg-muted/40 px-3 text-sm select-none">
                  <span>{countryFlag ? `${countryFlag} ` : ""}{field.value || "—"}</span>
                  <span className="text-xs text-muted-foreground">{t("sell.fromProfile", "From your profile")}</span>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )} />

          {/* ── State / Department ────────────────────────────────────────── */}
          <FormField control={form.control} name="state" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                {t("sell.state", "State / Department")}
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  ({t("sell.stateAutoFilled", "auto-filled from city")})
                </span>
              </FormLabel>
              {stateOptions.length > 0 ? (
                <select
                  value={field.value ?? ""}
                  onChange={e => field.onChange(e.target.value)}
                  data-testid="select-state"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  style={{ fontSize: "16px" }}
                >
                  <option value="">{t("sell.statePlaceholder", "Select state / department…")}</option>
                  {stateOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <FormControl>
                  <Input
                    placeholder={t("sell.statePlaceholderText", "e.g. Ouest, Florida…")}
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-state"
                  />
                </FormControl>
              )}
              <FormMessage />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="city" render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("sell.city")}
                  {countryFlag && (
                    <span className="text-xs text-muted-foreground ml-1 font-normal">
                      {countryFlag} {selectedCountry}
                    </span>
                  )}
                </FormLabel>
                {cityOptions.length > 0 ? (
                  <>
                    <select
                      value={useOtherCity ? OTHER_CITY : cityDisplayValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === OTHER_CITY) {
                          setUseOtherCity(true);
                          setCityDisplayValue(OTHER_CITY);
                          field.onChange("");
                        } else {
                          setUseOtherCity(false);
                          setCityDisplayValue(v);
                          field.onChange(v);
                          autoFillState(v);
                        }
                      }}
                      data-testid="select-city"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      style={{ fontSize: "16px" }}
                    >
                      <option value="" disabled>{t("sell.cityPlaceholder")}</option>
                      {cityOptions.map((c) => (
                        <option key={c} value={c} data-testid={`city-option-${c}`}>{c}</option>
                      ))}
                      <option value={OTHER_CITY} data-testid="city-option-other">Lòt vil…</option>
                    </select>
                    {useOtherCity && (
                      <FormControl>
                        <Input
                          placeholder={t("sell.cityPlaceholder")}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          data-testid="input-city-other"
                          className="mt-2"
                        />
                      </FormControl>
                    )}
                  </>
                ) : (
                  <FormControl>
                    <Input
                      placeholder={selectedCountry ? t("sell.cityPlaceholder") : t("sell.selectCountryFirst", "Select a country first")}
                      {...field}
                      disabled={!selectedCountry}
                      data-testid="input-city"
                    />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("sell.location")}</FormLabel>
                <FormControl><Input placeholder={t("sell.locationPlaceholder")} {...field} data-testid="input-location" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* ── Package weight & dimensions ───────────────────────────────────── */}
          {selectedCountry && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">⚖️ Pwa &amp; Dimansyon Pakè</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {["Haiti", "Dominican Republic"].includes(selectedCountry)
                    ? "Pwa ede chofè a prepare pou livrezon. Moto pou &lt;30 lbs, machin pou plis."
                    : "Transportè entènasyonal (FedEx, UPS, DHL) kalkile pri selon pwa. Antre pwa pou achtè ka wè pri otomatik."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Pwa (livres / lbs) *</label>
                  <Input
                    type="number" min="0.1" step="0.1"
                    placeholder="ex: 2.5"
                    value={weightLbs}
                    onChange={e => setWeightLbs(e.target.value)}
                    data-testid="input-weight-lbs"
                  />
                  {weightLbs && !isNaN(Number(weightLbs)) && (
                    <p className="text-xs text-muted-foreground mt-0.5">≈ {(Number(weightLbs) * 0.453592).toFixed(2)} kg</p>
                  )}
                </div>
                <div className="flex items-center justify-center">
                  {weightLbs && Number(weightLbs) > 0 && (
                    <div className={`rounded-lg px-3 py-2 text-center text-xs font-medium ${Number(weightLbs) <= 5 ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : Number(weightLbs) <= 30 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"}`}>
                      {Number(weightLbs) <= 5 ? "📦 Pake lejè" : Number(weightLbs) <= 30 ? "📦 Pake mwayen" : "🚗 Gwo pake"}
                    </div>
                  )}
                </div>
              </div>
              {!["Haiti", "Dominican Republic"].includes(selectedCountry) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Dimansyon pakè (pouces / inches) — opsyonèl</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="number" min="0" step="0.1" placeholder="Longè (L)" value={pkgLength} onChange={e => setPkgLength(e.target.value)} data-testid="input-pkg-length" />
                    <Input type="number" min="0" step="0.1" placeholder="Lajè (W)" value={pkgWidth}  onChange={e => setPkgWidth(e.target.value)}  data-testid="input-pkg-width"  />
                    <Input type="number" min="0" step="0.1" placeholder="Wotè (H)" value={pkgHeight} onChange={e => setPkgHeight(e.target.value)} data-testid="input-pkg-height" />
                  </div>
                  {pkgLength && pkgWidth && pkgHeight && Number(pkgLength) > 0 && Number(pkgWidth) > 0 && Number(pkgHeight) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Pwa dimensional: <strong>{(Number(pkgLength) * Number(pkgWidth) * Number(pkgHeight) / 139).toFixed(1)} lbs</strong>
                      {weightLbs && Number(weightLbs) > 0 && (
                        <> — Transportè pral itilize: <strong>{Math.max(Number(weightLbs), Number(pkgLength) * Number(pkgWidth) * Number(pkgHeight) / 139).toFixed(1)} lbs</strong></>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Local delivery method (Haiti/DR only) — seller chooses ─────────── */}
          {selectedCountry && ["Haiti", "Dominican Republic"].includes(selectedCountry) && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">Metòd livrezon</p>
                <p className="text-xs text-muted-foreground mt-0.5">Chwazi ki tip chaofè ou vle pou livrezon atik ou a.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSellerDeliveryMethod("motorcycle")}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                    sellerDeliveryMethod === "motorcycle"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-muted-foreground"
                  )}
                  data-testid="seller-delivery-motorcycle"
                >
                  <span className="text-lg">🏍️</span>
                  <span>Moto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSellerDeliveryMethod("car")}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                    sellerDeliveryMethod === "car"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-muted-foreground"
                  )}
                  data-testid="seller-delivery-car"
                >
                  <span className="text-lg">🚗</span>
                  <span>Machin</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSellerDeliveryMethod("bus")}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                    sellerDeliveryMethod === "bus"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-muted-foreground"
                  )}
                  data-testid="seller-delivery-bus"
                >
                  <span className="text-lg">🚌</span>
                  <span>Bis Pwovens</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSellerDeliveryMethod("self_delivery")}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                    sellerDeliveryMethod === "self_delivery"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-muted-foreground"
                  )}
                  data-testid="seller-delivery-self"
                >
                  <span className="text-lg">🚶</span>
                  <span>Machann Livre</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {sellerDeliveryMethod === "motorcycle"
                  ? "Plis vit, pri mwens chè. Bon pou ti pake."
                  : sellerDeliveryMethod === "car"
                  ? "Pi bon pou gwo atik oswa pake ki lou."
                  : sellerDeliveryMethod === "bus"
                  ? "Voye pa bis pwovens — achtè konfime resepsyon lè li resevwa."
                  : "Ou menm ou livre — achtè konfime lè li resevwa atik la."}
              </p>
            </div>
          )}

          {/* ── International shipping (non-Haiti/DR listings only) ───────────── */}
          {selectedCountry && !["Haiti", "Dominican Republic"].includes(selectedCountry) && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">Shipping options</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set the shipping cost and accepted carriers for international buyers.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Shipping cost (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00 (leave blank for free shipping)"
                    className="pl-7"
                    value={intlShippingCost}
                    onChange={e => setIntlShippingCost(e.target.value)}
                    data-testid="input-shipping-cost"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">Accepted carriers</label>
                <div className="flex flex-wrap gap-2">
                  {(["UPS", "FedEx", "DHL", "USPS", "Other"] as const).map(carrier => {
                    const active = intlCarriers.includes(carrier);
                    return (
                      <button
                        key={carrier}
                        type="button"
                        onClick={() => setIntlCarriers(prev => active ? prev.filter(c => c !== carrier) : [...prev, carrier])}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"
                        )}
                        data-testid={`carrier-${carrier.toLowerCase()}`}
                      >
                        {carrier}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Select all carriers you can ship with. Buyers choose at checkout.</p>
              </div>
            </div>
          )}

          {/* ── Live listing preview ─────────────────────────────────────────── */}
          {(() => {
            const vals = form.watch();
            const selCat = categories?.find(c => c.id === vals.categoryId);
            const selSub = selCat
              ? (selCat as any).children?.find((s: any) => s.id === vals.subcategoryId)
              : null;
            const previewImages = uploadedImages.map(img => img.previewUrl);
            const hasContent = vals.title?.trim() || previewImages.length > 0;
            if (!hasContent) return null;
            const previewListing = {
              id: -1,
              title: vals.title?.trim() || t("sell.titlePlaceholder", "Your listing title"),
              price: Number(vals.price) || 0,
              currency,
              images: previewImages,
              location: vals.location || vals.city || "",
              city: vals.city || null,
              country: vals.country || null,
              condition: vals.condition || "good",
              isBoosted: false,
              status: "active",
              sellerName: user?.name ?? "",
              sellerRating: 0,
              sellerIsVerified: (user as any)?.isVerified ?? false,
              favoriteCount: 0,
              isFavorited: false,
              createdAt: new Date().toISOString(),
              categoryIcon: selCat?.icon ?? null,
              subcategory: selSub?.name ?? null,
              sellerId: undefined,
            };
            return (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("sell.preview", "Aperçu — how buyers will see your listing")}
                </p>
                <div className="max-w-[220px]">
                  <ListingCard listing={previewListing} preview />
                </div>
              </div>
            );
          })()}

          {/* ── Draft saved indicator ────────────────────────────────── */}
          {draftSavedAt && !createListing.isPending && !isEditMode && (
            <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
              💾 Brouyon sovgade — {draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {/* ── Submit error with retry ───────────────────────────────── */}
          {submitError && !createListing.isPending && (
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA" }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#DC2626" }}>
                Erè piblikasyon
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#B91C1C", lineHeight: 1.4 }}>
                {submitError}
              </p>
              <button
                type="button"
                onClick={() => form.handleSubmit(onSubmit)()}
                style={{
                  fontSize: 13, fontWeight: 600, color: "#ffffff",
                  background: "#DC2626", border: "none", borderRadius: 8,
                  padding: "7px 16px", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                🔄 Eseye ankò
              </button>
            </div>
          )}

          {/* ── Payment method selector (hidden in edit mode) ──────── */}
          {paymentReady !== null && !isEditMode && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  {paymentReady ? (
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <p className="text-sm font-bold text-foreground">
                    Metòd pou resevwa kòb ou
                  </p>
                  {paymentReady && (
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Aktif
                    </span>
                  )}
                </div>
                {!paymentReady && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Chwazi youn nan opsyon yo pou w ka pibliye pwodwi ou
                  </p>
                )}
              </div>

              {/* Cards */}
              <div className="p-3 grid grid-cols-2 gap-2.5">

                {/* Kat FM */}
                <button
                  type="button"
                  onClick={() => { if (cardPayoutMethod !== "fm_wallet") selectPayoutMethod("fm_wallet"); }}
                  disabled={savingPayoutMethod}
                  className={`relative flex flex-col items-start gap-2 rounded-xl p-3.5 border-2 transition-all text-left ${
                    cardPayoutMethod === "fm_wallet"
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/60"
                  }`}
                >
                  {cardPayoutMethod === "fm_wallet" && (
                    <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-base leading-none shrink-0">
                      💳
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground leading-none">Kat FM</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Toujou disponib</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Kòb vant ou tonbe dirèkteman nan pòtfèy FM ou — pa bezwen konfigire anyen.
                  </p>
                  {savingPayoutMethod && cardPayoutMethod !== "fm_wallet" && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary absolute bottom-2 right-2" />
                  )}
                </button>

                {/* Stripe — always visible */}
                <button
                  type="button"
                  onClick={() => { if (cardPayoutMethod !== "stripe") selectPayoutMethod("stripe"); }}
                  disabled={savingPayoutMethod}
                  className={`relative flex flex-col items-start gap-2 rounded-xl p-3.5 border-2 transition-all text-left ${
                    cardPayoutMethod === "stripe"
                      ? "border-[#635BFF] bg-[#635BFF]/5"
                      : "border-border bg-muted/30 hover:border-[#635BFF]/40 hover:bg-muted/60"
                  }`}
                >
                  {cardPayoutMethod === "stripe" && (
                    <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#635BFF] flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#635BFF]/10 flex items-center justify-center text-base leading-none shrink-0">
                      💳
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground leading-none">Stripe</p>
                      <p className={`text-[10px] font-semibold mt-0.5 ${stripeAccountActive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {stripeAccountActive ? "Konekte" : "Pa konekte"}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Resevwa peman pa kat kredi dirèkteman nan kont bank ou.
                  </p>
                  {cardPayoutMethod === "stripe" && !stripeAccountActive && (
                    <a
                      href="/settings"
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] font-bold text-[#635BFF] underline underline-offset-2 hover:no-underline"
                    >
                      Konekte Stripe nan Paramèt →
                    </a>
                  )}
                  {savingPayoutMethod && cardPayoutMethod !== "stripe" && (
                    <Loader2 className="h-3 w-3 animate-spin text-[#635BFF] absolute bottom-2 right-2" />
                  )}
                </button>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full font-bold"
            disabled={isPending || videoUploading || uploadingSlot !== null || (!isEditMode && uploadedImages.length < 2) || (!isEditMode && paymentReady === false)}
            data-testid="button-submit-listing"
          >
            {isPending
              ? (isEditMode ? "Ap sovgade…" : t("sell.publishing"))
              : (isEditMode ? "Sovgade chanjman yo" : t("sell.publishListing"))}
          </Button>
        </form>
      </Form>
    </div>
  );
}
