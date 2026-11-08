import { useForm, type FieldErrors } from "react-hook-form";
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
import { Children, type ReactNode, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { X, Globe, Loader2, ChevronRight, ArrowLeft, Check, Images, ImagePlus, Video, AlertTriangle, Package, Tag, Truck, Eye, Sparkles, FileText, Send, CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES, citiesFor, stateForCity, statesFor } from "@/lib/countries";
import { MULTI_CURRENCY_COUNTRIES, getCurrencySymbolByCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { STRIPE_SUPPORTED_COUNTRIES, MONCASH_COUNTRIES, isStripeOnlySale } from "@/lib/paymentCountries";
import ListingCard from "@/components/ListingCard";
import { VideoUploadChooser } from "@/components/VideoUploadCenter";
import { apiFetch } from "@/lib/api";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { startVideoUpload } from "@/lib/videoUploadQueue";
import { probeVideoDuration } from "@/lib/probeVideoDuration";
import sellPreviewCar from "@/assets/sell-preview-car.webp";
import { listingCarriersForCountry } from "@/lib/listingCarriers";
import SellerCenterShell, { SellAccordionSection, SELL_STEPS } from "@/components/seller/SellerCenterShell";
import {
  SELL_VALIDATION_EN,
  collectExtraPublishErrors,
  countErrorsBySection,
  defaultSellValidationMessages,
  firstSectionWithErrors,
  formatSectionMissingLabel,
  sectionForField,
  type SellSectionId,
} from "@/lib/sellValidation";

const MAX_IMAGES = 5;
/** Existing business rule: new listings require at least 2 photos (1 when editing). */
const MIN_IMAGES = 2;
const OTHER_CITY = "__other__";
const DRAFT_KEY = "flexa_sell_draft_v2";
const LOCAL_DELIVERY_COUNTRIES = new Set(["Haiti"]);

function PayoutMethodCards({ stripeFirst, children }: { stripeFirst: boolean; children: ReactNode }) {
  const cards = Children.toArray(children);
  return (
    <div className={`p-3 grid ${stripeFirst ? "grid-cols-1" : "grid-cols-2"} gap-2.5`}>
      {stripeFirst ? cards.reverse() : cards}
    </div>
  );
}

// Small required-field status: red asterisk when empty, green check once filled.
function ReqDot({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 rounded-full ml-1.5 align-middle shrink-0 transition-colors",
        filled ? "bg-emerald-500" : "bg-red-500",
      )}
    />
  );
}

function FieldErrorIcon({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <CircleAlert
      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 pointer-events-none"
      aria-hidden
      data-testid="field-error-icon"
    />
  );
}

function buildSellSchema(messages: typeof SELL_VALIDATION_EN) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, messages.titleRequired)
      .min(3, messages.titleTooShort),
    description: z
      .string()
      .trim()
      .min(1, messages.descriptionRequired)
      .min(10, messages.descriptionRequired),
    price: z.preprocess(
      (val) => {
        if (val === "" || val === null || val === undefined) return undefined;
        const n = typeof val === "number" ? val : Number(val);
        return Number.isFinite(n) ? n : undefined;
      },
      z
        .number({
          required_error: messages.priceInvalid,
          invalid_type_error: messages.priceInvalid,
        })
        .positive(messages.pricePositive),
    ),
    categoryId: z.coerce.number().positive(messages.categoryRequired),
    subcategoryId: z.coerce.number().optional().nullable(),
    condition: z.enum(["new", "like_new", "good", "fair", "poor"]),
    country: z.string().min(1, messages.countryRequired),
    city: z.string().min(1, messages.cityRequired),
    state: z.string().optional(),
    location: z.string().trim().min(2, messages.locationRequired),
    stockQuantity: z.preprocess(
      (val) => {
        if (val === "" || val === null || val === undefined) return null;
        const n = typeof val === "number" ? val : Number(val);
        return Number.isFinite(n) ? n : undefined;
      },
      z.number().int(messages.quantityInvalid).positive(messages.quantityInvalid).optional().nullable(),
    ),
  });
}

type SellFormValues = z.infer<ReturnType<typeof buildSellSchema>>;

interface UploadedImage {
  objectPath: string;
  previewUrl: string;
  fileName: string;
}

function getStorageUrl(objectPath: string): string {
  // Public CDN URLs and same-origin Wasabi proxy URLs are already displayable.
  if (
    objectPath.startsWith("http://") ||
    objectPath.startsWith("https://") ||
    objectPath.startsWith("/api/")
  ) return objectPath;
  const trimmed = objectPath.startsWith("/objects/")
    ? objectPath.slice("/objects/".length)
    : objectPath;
  return `/api/storage/objects/${trimmed}`;
}

export default function Sell() {
  const purchasesDisabled = isAndroidApp();
  const { user, token, isLoading: authLoading } = useAuth();
  const { isRestricted, showRestrictionToast } = useRestriction();
  const userRole = (user as any)?.role;
  const isAdmin =
    userRole === "admin" ||
    userRole === "superadmin" ||
    !!(user as any)?.isAdmin ||
    !!(user as any)?.isSuperAdmin;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [aiDescLoading, setAiDescLoading] = useState(false);

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
  const [uploadingSource, setUploadingSource] = useState<"gallery" | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<"parents" | "subs">("parents");
  const [pendingParent, setPendingParent] = useState<{ id: number; slug: string; name: string; icon: string; children?: { id: number; slug: string; name: string; icon: string }[] } | null>(null);
  const photoSectionRef = useRef<HTMLDivElement | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const { data: categories } = useGetCategories();
  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const [adminUpdatePending, setAdminUpdatePending] = useState(false);
  const isPending = isEditMode
    ? (isAdmin ? adminUpdatePending : updateListing.isPending)
    : createListing.isPending;

  // Fetch existing listing when editing
  // editId ?? 0: when null, id=0 → enabled:!!0=false → query skipped automatically
  const { data: existingListing } = useGetListing(editId ?? 0);
  const [editPrefilled, setEditPrefilled] = useState(false);

  const { uploadFile } = useUpload({
    onError: (error) => setUploadErrorMessage(error.message),
    throwOnError: true,
  });

  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentReady, setPaymentReady] = useState<boolean | null>(null);
  const [submitRestricted, setSubmitRestricted] = useState(false);
  const [cardPayoutMethod, setCardPayoutMethod] = useState<"fm_wallet" | "stripe" | null>(null);
  const [stripeAccountActive, setStripeAccountActive] = useState(false);
  const [stripeAccountConnected, setStripeAccountConnected] = useState(false);
  const [savingPayoutMethod, setSavingPayoutMethod] = useState(false);
  const [isStripeCountry, setIsStripeCountry] = useState(false);
  const [intlShippingCost, setIntlShippingCost] = useState<string>("");
  const [intlCarriers, setIntlCarriers] = useState<string[]>([]);
  const [sellerDeliveryMethod, setSellerDeliveryMethod] = useState<"motorcycle" | "car" | "bus" | "self_delivery">("motorcycle");
  const [dominicanDeliveryChoice, setDominicanDeliveryChoice] = useState<"carrier" | "self_delivery">("carrier");
  const [itemSize, setItemSize] = useState<string>("");
  const [weightLbs, setWeightLbs] = useState<string>("");
  const [pkgLength, setPkgLength] = useState<string>("");
  const [pkgWidth,  setPkgWidth]  = useState<string>("");
  const [pkgHeight, setPkgHeight] = useState<string>("");
  const [myListingCount, setMyListingCount] = useState<{ totalCount: number; activeCount: number } | null>(null);
  const [showValidationBanner, setShowValidationBanner] = useState(false);
  const [sectionErrorCounts, setSectionErrorCounts] = useState<Record<SellSectionId, number>>({
    info: 0,
    media: 0,
    pricing: 0,
    delivery: 0,
    review: 0,
  });
  const validationBannerRef = useRef<HTMLDivElement | null>(null);

  const validationMessages = useMemo(
    () => defaultSellValidationMessages((key, opts) => t(key, opts as any)),
    [t, i18n.language],
  );
  const sellSchema = useMemo(() => buildSellSchema(validationMessages), [validationMessages]);

  const form = useForm<SellFormValues>({
    resolver: zodResolver(sellSchema) as any,
    defaultValues: {
      title: "",
      description: "",
      price: undefined as unknown as number,
      categoryId: 0,
      subcategoryId: null as number | null,
      condition: "good" as const,
      country: user?.country ?? "",
      city: "",
      state: "",
      location: user?.location ?? "",
      stockQuantity: null as number | null,
    },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const selectedCountry = form.watch("country") ?? "";
  const isStripeOnlySeller = isStripeOnlySale(user?.country, selectedCountry);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/auth/login");
  }, [user, authLoading]);

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
    let cancelled = false;
    setPaymentReady(null);
    const tk = localStorage.getItem("flexamarket_token") ?? "";
    const stripeSupported = isStripeOnlySeller || STRIPE_SUPPORTED_COUNTRIES.has(user.country ?? "");
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
      if (cancelled) return;
      const stripeStatus = stripeData?.stripeAccountStatus;
      const stripeActive = stripeStatus === "active";
      const stripeConnected = stripeActive || stripeStatus === "connected";
      const currentMethod = payoutData?.cardPayoutMethod ?? (isStripeOnlySeller ? null : "fm_wallet");
      setStripeAccountActive(stripeActive);
      setStripeAccountConnected(stripeConnected);
      // New Stripe-only listings have their own mandatory payout policy. Do not mutate
      // the saved legacy preference or redirect existing orders.
      setCardPayoutMethod(isStripeOnlySeller ? "stripe" : currentMethod);
      // Kat FM: seller chose fm_wallet → always ready (earnings auto-credited to FM wallet)
      const hasKatFM = currentMethod === "fm_wallet";
      if (isStripeOnlySeller) {
        setPaymentReady(stripeActive);
      } else if (hasKatFM) {
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
    return () => { cancelled = true; };
  }, [user?.id, user?.country, selectedCountry, isStripeOnlySeller]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPayoutMethod = useCallback(async (method: "fm_wallet" | "stripe") => {
    if (isStripeOnlySeller) return;
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
      toast({ title: t("common.error"), description: t("tr.paymentSaveErrorDesc"), variant: "destructive" });
    } finally {
      setSavingPayoutMethod(false);
    }
  }, [stripeAccountActive, toast, isStripeOnlySeller]);

  // Regular sellers must always post from their registered profile country.
  // Admins and super admins may select another country.
  useEffect(() => {
    if (!user?.country || isEditMode) return;
    if (!isAdmin || !form.getValues("country")) {
      form.setValue("country", user.country);
    }
  }, [user?.country, isAdmin, isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDominicanDeliveryChoice(l.deliveryMethod === "self_delivery" ? "self_delivery" : "carrier");
    if (l.shippingCost)    setIntlShippingCost(String(l.shippingCost));
    if (Array.isArray(l.shippingCarriers) && l.shippingCarriers.length > 0) setIntlCarriers(l.shippingCarriers);
    if (l.listingVideoUrl) setListingVideoUrl(l.listingVideoUrl);
    if (l.itemSize) setItemSize(l.itemSize);
    setEditPrefilled(true);
  }, [existingListing, isEditMode, editPrefilled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft system — refs & callbacks (declared early so onSubmit can call clearDraft) ──
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRestoreAttemptedRef = useRef(false);
  const draftDataRef = useRef({
    currency: "USD" as "USD" | "HTG" | "DOP", uploadedImages: [] as UploadedImage[], listingVideoUrl: null as string | null,
    dominicanDeliveryChoice, sellerDeliveryMethod, intlShippingCost, intlCarriers,
    weightLbs, pkgLength, pkgWidth, pkgHeight,
  });

  const saveDraft = useCallback(() => {
    if (isEditMode || !draftRestoreAttemptedRef.current) return;
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
  }, [form, isEditMode]);

  const clearDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraftSavedAt(null);
    setDraftRestored(false);
  }, []);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith("image/")) return validationMessages.photoUnsupported;
    if (file.size > 10 * 1024 * 1024) return "Each image must be under 10MB.";
    return null;
  };

  const handleFiles = async (files: FileList | File[]) => {
    setUploadErrorMessage(null);
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
      setUploadingSource("gallery");
      try {
        const result = await uploadFile(file);
        if (!result) {
          toast({
            title: t("sell.uploadFailedTitle"),
            description: uploadErrorMessage ?? t("sell.uploadFailedDescription"),
            variant: "destructive",
          });
          continue;
        }
        const newImage: UploadedImage = {
          objectPath: result.objectPath,
          previewUrl: getStorageUrl(result.objectPath),
          fileName: file.name,
        };
        setUploadedImages(prev => prev.length < MAX_IMAGES ? [...prev, newImage] : prev);
        setUploadErrorMessage(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not upload the image.";
        setUploadErrorMessage(message);
        toast({ title: t("sell.uploadFailedTitle"), description: message, variant: "destructive" });
      } finally {
        setUploadingSlot(null);
        setUploadingSource(null);
      }
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (values: SellFormValues) => {
    // Kat FM eligibility grants a publication-only exception, not an account unlock.
    if (isRestricted && (isEditMode || isStripeOnlySeller)) {
      setSubmitRestricted(true);
      setSubmitError(t("sell.accountRestricted"));
      showRestrictionToast();
      return;
    }
    setSubmitRestricted(false);
    setSubmitError(null);
    if (uploadingSlot !== null || videoUploading || savingPayoutMethod) {
      const msg = uploadingSlot !== null
        ? t("sell.waitForPhotoUpload")
        : videoUploading
          ? t("sell.waitForVideoUpload")
          : t("sell.waitForPaymentSave");
      setSubmitError(msg);
      toast({ title: t("sell.operationPending"), description: msg, variant: "destructive" });
      return;
    }
    const minPhotos = isEditMode ? 1 : MIN_IMAGES;
    const isLocalDelivery = LOCAL_DELIVERY_COUNTRIES.has(values.country ?? "");
    const isDominicanSelfDelivery = values.country === "Dominican Republic" && dominicanDeliveryChoice === "self_delivery";
    const shippingCarriers = values.country === "Dominican Republic"
      ? intlCarriers.filter(carrier => listingCarriersForCountry(values.country).includes(carrier))
      : intlCarriers;
    const extraErrors = collectExtraPublishErrors(
      {
        photoCount: uploadedImages.length,
        minPhotos,
        country: values.country ?? "",
        dominicanDeliveryChoice: values.country === "Dominican Republic" ? dominicanDeliveryChoice : null,
        intlCarriers: shippingCarriers,
        sellerDeliveryMethod,
        isLocalDeliveryCountry: isLocalDelivery,
      },
      validationMessages,
    );
    if (Object.keys(extraErrors).length > 0) {
      applyPublishErrors(extraErrors);
      return;
    }
    // Payment setup is informational here, not a prerequisite for publishing.
    const imageUrls = uploadedImages.map(img => getStorageUrl(img.objectPath));
    const payload = { ...values, currency, images: imageUrls, subcategoryId: values.subcategoryId ?? undefined, stockQuantity: values.stockQuantity ?? undefined, itemSize: itemSize || undefined, listingVideoUrl: listingVideoUrl ?? undefined, shippingCost: !isLocalDelivery ? Number(intlShippingCost || 0) : null, shippingCarriers: !isLocalDelivery && !isDominicanSelfDelivery ? shippingCarriers : [], deliveryMethod: isLocalDelivery ? sellerDeliveryMethod : isDominicanSelfDelivery ? "self_delivery" : null, weightLbs: weightLbs ? Number(weightLbs) : undefined, packageLengthIn: pkgLength ? Number(pkgLength) : undefined, packageWidthIn: pkgWidth ? Number(pkgWidth) : undefined, packageHeightIn: pkgHeight ? Number(pkgHeight) : undefined };

    const handleSuccess = (_listing: any) => {
      const l = _listing as any;
      if (isEditMode && editId) {
        // Edit mode: invalidate ALL home-page feed caches so price/currency
        // changes appear immediately in the VIP section, boosted feed, and
        // personalized feed — not just the listing-detail page.
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(editId) });
        queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey(l.sellerId ?? (existingListing as any)?.sellerId) });
        queryClient.invalidateQueries({ queryKey: ["boosted-feed"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/home"] });
        queryClient.invalidateQueries({ queryKey: ["personalized-feed"] });
        toast({ title: t("tr.listingUpdated"), description: t("tr.listingUpdatedDesc") });
        setLocation(`/listings/${editId}`);
        return;
      }
      // Create mode
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/stats/home"] });
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
      if (e?.data?.code === "USER_RESTRICTED" || raw === "USER_RESTRICTED") {
        setSubmitRestricted(true);
        setSubmitError(t("sell.accountRestricted"));
        showRestrictionToast();
        return;
      }
      const isRawJson =
        typeof raw === "string" &&
        (raw.trimStart().startsWith("[") || raw.trimStart().startsWith("{\"code\""));
      const isNetwork =
        e?.message === "Failed to fetch" ||
        e?.name === "TypeError" ||
        e?.status === 0 ||
        typeof navigator !== "undefined" && !navigator.onLine;
      const description = isNetwork
        ? validationMessages.networkError
        : !raw || isRawJson
          ? validationMessages.serverError
          : String(raw);
      setSubmitError(description);
      toast({
        title: t("errors.submitFailed", { defaultValue: "Submission failed" }),
        description,
        variant: "destructive",
      });
    };

    if (isEditMode && editId && isAdmin) {
      setAdminUpdatePending(true);
      apiFetch<any>(`/api/admin/listings/${editId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
        .then(handleSuccess)
        .catch(handleError)
        .finally(() => setAdminUpdatePending(false));
    } else if (isEditMode && editId) {
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

  const applyPublishErrors = useCallback((
    fieldErrors: Record<string, string>,
    rhfErrors?: FieldErrors<SellFormValues>,
  ) => {
    const merged: Record<string, string> = { ...fieldErrors };
    if (rhfErrors) {
      for (const [key, err] of Object.entries(rhfErrors)) {
        const msg = (err as { message?: string } | undefined)?.message;
        if (typeof msg === "string" && msg) merged[key] = msg;
      }
    }

    for (const [key, message] of Object.entries(fieldErrors)) {
      if (key === "photos" || key === "deliveryMethod" || key === "shippingCarriers") continue;
      form.setError(key as keyof SellFormValues, { type: "manual", message });
    }

    const counts = countErrorsBySection(Object.keys(merged));
    setSectionErrorCounts(counts);
    setShowValidationBanner(true);
    setSubmitError(validationMessages.bannerTitle);

    const firstSection = firstSectionWithErrors(counts);
    if (firstSection) {
      const stepIndex = SELL_STEPS.findIndex((s) => s.id === firstSection);
      setOpenSection(firstSection);
      setSellerStep(stepIndex >= 0 ? stepIndex : 0);
    }

    const firstField = Object.keys(merged)[0];
    window.requestAnimationFrame(() => {
      validationBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        if (!firstField || firstField === "photos") {
          photoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        const field =
          document.querySelector<HTMLElement>(`[name="${firstField}"]`) ??
          document.querySelector<HTMLElement>(`[data-form-field="${firstField}"]`) ??
          document.querySelector<HTMLElement>(`[data-testid="input-${firstField}"]`) ??
          document.querySelector<HTMLElement>(`[data-testid="select-${firstField.replace("Id", "")}"]`);
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.focus({ preventScroll: true });
      }, 80);
    });
  }, [form, validationMessages.bannerTitle]);

  const onInvalidSubmit = (errors: FieldErrors<SellFormValues>) => {
    const minPhotos = isEditMode ? 1 : MIN_IMAGES;
    const country = form.getValues("country") ?? "";
    const isLocalDelivery = LOCAL_DELIVERY_COUNTRIES.has(country);
    const shippingCarriers = country === "Dominican Republic"
      ? intlCarriers.filter((carrier) => listingCarriersForCountry(country).includes(carrier))
      : intlCarriers;
    const extras = collectExtraPublishErrors(
      {
        photoCount: uploadedImages.length,
        minPhotos,
        country,
        dominicanDeliveryChoice: country === "Dominican Republic" ? dominicanDeliveryChoice : null,
        intlCarriers: shippingCarriers,
        sellerDeliveryMethod,
        isLocalDeliveryCountry: isLocalDelivery,
      },
      validationMessages,
    );
    applyPublishErrors(extras, errors);
  };

  const handlePublishClick = () => {
    setShowValidationBanner(false);
    setSectionErrorCounts({ info: 0, media: 0, pricing: 0, delivery: 0, review: 0 });
    void form.handleSubmit(onSubmit, onInvalidSubmit)();
  };

  // Country is watched from the form so it reacts to user selection
  const isLocalDeliveryCountry = LOCAL_DELIVERY_COUNTRIES.has(selectedCountry);
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
  const [listingVideoUrl, setListingVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [openSection, setOpenSection] = useState<"info" | "media" | "pricing" | "delivery" | "review">("info");
  const [sellerStep, setSellerStep] = useState(0);

  const goSection = (id: typeof openSection, step: number) => {
    setOpenSection(id);
    setSellerStep(step);
  };

  // Keep accordion error badges in sync after the user corrects fields.
  useEffect(() => {
    if (!showValidationBanner) return;
    const rhfKeys = Object.keys(form.formState.errors);
    const minPhotos = isEditMode ? 1 : MIN_IMAGES;
    const country = form.getValues("country") ?? "";
    const isLocalDelivery = LOCAL_DELIVERY_COUNTRIES.has(country);
    const shippingCarriers = country === "Dominican Republic"
      ? intlCarriers.filter((carrier) => listingCarriersForCountry(country).includes(carrier))
      : intlCarriers;
    const extras = collectExtraPublishErrors(
      {
        photoCount: uploadedImages.length,
        minPhotos,
        country,
        dominicanDeliveryChoice: country === "Dominican Republic" ? dominicanDeliveryChoice : null,
        intlCarriers: shippingCarriers,
        sellerDeliveryMethod,
        isLocalDeliveryCountry: isLocalDelivery,
      },
      validationMessages,
    );
    const allKeys = new Set([...rhfKeys, ...Object.keys(extras)]);
    const counts = countErrorsBySection(allKeys);
    setSectionErrorCounts(counts);
    if (allKeys.size === 0) {
      setShowValidationBanner(false);
      setSubmitError(null);
    }
  }, [
    showValidationBanner,
    form.formState.errors,
    uploadedImages.length,
    isEditMode,
    intlCarriers,
    dominicanDeliveryChoice,
    sellerDeliveryMethod,
    validationMessages,
    form,
  ]);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const MAX_VIDEO_SECONDS = 300;
  const MAX_VIDEO_BYTES   = 300 * 1024 * 1024; // 300 MB — matches server cap

  // Subscription plan check — user.subscriptionPlan comes from the API (all DB fields returned)
  const userPlan = (user as any)?.subscriptionPlan as string | null | undefined;
  const planExpiry = (user as any)?.subscriptionExpiresAt as string | null | undefined;
  const planExpired = planExpiry ? new Date(planExpiry) < new Date() : false;
  const hasVideoPlan = !!userPlan && userPlan !== "basic" && !planExpired;
  const hasActivePlan = !!userPlan && !planExpired;

  const handleVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast({ title: t("sell.videoTooBig"), variant: "destructive" });
      return;
    }
    setVideoUploading(true);
    try {
      if (!user) {
        toast({ title: validationMessages.videoUploadFailed, variant: "destructive" });
        return;
      }
      const seconds = await probeVideoDuration(file);
      if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
        toast({ title: validationMessages.videoTooLong, variant: "destructive" });
        return;
      }
      const uploadedUrl = await startVideoUpload(file, token, {
        ownerId: user.id,
        purpose: "listing",
        returnPath: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined,
      });
      setListingVideoUrl(uploadedUrl);
    } catch {
      toast({ title: validationMessages.videoUploadFailed, variant: "destructive" });
    } finally {
      setVideoUploading(false);
    }
  };

  // Keep draftDataRef current every render so saveDraft always reads latest non-form state
  draftDataRef.current = { currency, uploadedImages, listingVideoUrl, dominicanDeliveryChoice, sellerDeliveryMethod, intlShippingCost, intlCarriers, weightLbs, pkgLength, pkgWidth, pkgHeight };

  useEffect(() => {
    saveDraft();
  }, [dominicanDeliveryChoice, sellerDeliveryMethod, intlShippingCost, intlCarriers, weightLbs, pkgLength, pkgWidth, pkgHeight, saveDraft]);

  // ── Restore draft on first mount (skip in edit mode) ─────────────────────
  useEffect(() => {
    if (isEditMode) return; // don't restore draft when editing an existing listing
    if (authLoading || !user || draftRestoreAttemptedRef.current) return;
    draftRestoreAttemptedRef.current = true;
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
      // Only admins can override profile country. Wait for auth before making
      // that decision, and do not autosave defaults over the pending draft.
      if (f.country && isAdmin) form.setValue("country", f.country);
      const canRestoreDraftLocation = !f.country || f.country === user.country || isAdmin;
      if (f.title)           form.setValue("title", f.title);
      if (f.description)     form.setValue("description", f.description);
      if (f.price)           form.setValue("price", f.price);
      if (f.categoryId)      { form.setValue("categoryId", f.categoryId); setSelectedCategoryId(f.categoryId); }
      if (f.subcategoryId != null) form.setValue("subcategoryId", f.subcategoryId);
      if (f.condition)       form.setValue("condition", f.condition);
      if (canRestoreDraftLocation && f.city) { form.setValue("city", f.city); setCityDisplayValue(f.city); }
      if (canRestoreDraftLocation && f.state) form.setValue("state", f.state);
      if (canRestoreDraftLocation && f.location) form.setValue("location", f.location);
      if (f.stockQuantity != null) form.setValue("stockQuantity", f.stockQuantity);
      if (draft.currency)    setCurrency(draft.currency);
      if (Array.isArray(draft.images) && draft.images.length > 0) setUploadedImages(draft.images);
      if (draft.listingVideoUrl) setListingVideoUrl(draft.listingVideoUrl);
      if (draft.dominicanDeliveryChoice === "self_delivery" || draft.dominicanDeliveryChoice === "carrier") setDominicanDeliveryChoice(draft.dominicanDeliveryChoice);
      if (["motorcycle", "car", "bus", "self_delivery"].includes(draft.sellerDeliveryMethod)) setSellerDeliveryMethod(draft.sellerDeliveryMethod);
      if (typeof draft.intlShippingCost === "string") setIntlShippingCost(draft.intlShippingCost);
      if (Array.isArray(draft.intlCarriers)) setIntlCarriers(draft.intlCarriers.filter((value: unknown) => typeof value === "string"));
      if (typeof draft.weightLbs === "string") setWeightLbs(draft.weightLbs);
      if (typeof draft.pkgLength === "string") setPkgLength(draft.pkgLength);
      if (typeof draft.pkgWidth === "string") setPkgWidth(draft.pkgWidth);
      if (typeof draft.pkgHeight === "string") setPkgHeight(draft.pkgHeight);
      setDraftRestored(true);
    } catch { /* corrupt data — ignore */ }
  }, [authLoading, user?.id, isAdmin, isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save on form field changes ──────────────────────────────────────
  useEffect(() => {
    const sub = form.watch(() => saveDraft());
    return () => sub.unsubscribe();
  }, [form, saveDraft]);

  // ── Auto-save on non-form state changes ──────────────────────────────────
  useEffect(() => { saveDraft(); }, [currency, uploadedImages, listingVideoUrl, saveDraft]);

  const canAddMore = uploadedImages.length < MAX_IMAGES;
  const requiredPhotoCount = isEditMode ? 1 : MIN_IMAGES;
  const isPublishBusy =
    isPending || uploadingSlot !== null || videoUploading || savingPayoutMethod;
  const publishBusyLabel = uploadingSlot !== null
    ? t("sell.photosUploading", { defaultValue: "Photos are uploading" })
    : videoUploading
      ? t("sell.videoUploading", { defaultValue: "Uploading video…" })
      : savingPayoutMethod
        ? t("sell.waitForPaymentSave", { defaultValue: "Wait for the payment method to finish saving before publishing." })
        : null;

  const watchedVals = form.watch();
  const checklist = {
    title: (watchedVals.title ?? "").trim().length >= 3,
    category: Number(watchedVals.categoryId) > 0,
    description: (watchedVals.description ?? "").trim().length >= 10,
    photos: uploadedImages.length >= requiredPhotoCount,
    price: Number(watchedVals.price) > 0,
    stock: true, // optional
    delivery: !!(watchedVals.city && watchedVals.location && watchedVals.country),
  };

  const handleSaveDraftClick = () => {
    if (isEditMode) {
      toast({ title: t("sell.draftEditSkip", { defaultValue: "Drafts are for new listings only" }) });
      return;
    }
    saveDraft();
    toast({ title: t("sell.draftSaved", { defaultValue: "Draft saved" }) });
  };

  return (
    <SellerCenterShell>
      <div className="px-3 md:px-6 py-4 md:py-6 pb-28 md:pb-8">
        {/* Page header + actions */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] md:text-[26px] font-extrabold text-slate-900 tracking-tight">
              {isEditMode ? t("sell.editTitle") : t("sell.addNewProduct", { defaultValue: "Add New Product" })}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {t("sell.addNewProductDesc", { defaultValue: "Create a new product listing for your store." })}
            </p>
            {isEditMode && !editPrefilled && (
              <p className="text-sm text-muted-foreground mt-1">{t("sell.loadingEdit")}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraftClick}
            className="h-10 px-4 border-slate-300 text-slate-800 font-semibold rounded-full shrink-0 self-start bg-white hover:bg-slate-50 gap-1.5"
            data-testid="button-save-draft"
          >
            <FileText className="h-4 w-4" />
            {t("sell.saveAsDraft", { defaultValue: "Save as Draft" })}
          </Button>
        </div>

        {/* Progress stepper — green = complete, red = errors, grey = pending */}
        <div className="mb-4 overflow-x-auto scrollbar-none" data-testid="sell-stepper">
          <div className="flex items-center gap-0 min-w-[520px] md:min-w-0">
            {SELL_STEPS.map((step, i) => {
              const sectionId = step.id as SellSectionId;
              const errors = sectionErrorCounts[sectionId] ?? 0;
              const sectionComplete =
                (sectionId === "info" && checklist.title && checklist.category && checklist.description) ||
                (sectionId === "media" && checklist.photos) ||
                (sectionId === "pricing" && checklist.price) ||
                (sectionId === "delivery" && checklist.delivery) ||
                (sectionId === "review" && sellerStep >= 4 && Object.values(sectionErrorCounts).every((n) => n === 0) && checklist.title && checklist.photos && checklist.price && checklist.delivery);
              const active = sellerStep === i || openSection === sectionId;
              const isError = errors > 0;
              const isDone = !isError && sectionComplete;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goSection(sectionId, i)}
                  className="flex items-center flex-1 min-w-0"
                >
                  <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                    <span
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold border-2",
                        isError
                          ? "bg-red-500 border-red-500 text-white"
                          : isDone
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : active
                              ? "bg-[hsl(152,65%,22%)] border-[hsl(152,65%,22%)] text-white"
                              : "bg-slate-200 border-slate-200 text-slate-500",
                      )}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] md:text-[11px] font-semibold text-center leading-tight px-0.5 truncate w-full",
                        isError ? "text-red-600" : isDone ? "text-emerald-700" : active ? "text-slate-800" : "text-muted-foreground",
                      )}
                    >
                      {t(step.labelKey, { defaultValue: step.defaultLabel })}
                    </span>
                  </div>
                  {i < SELL_STEPS.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-4 md:w-8 shrink-0 mb-4",
                        isDone || (sectionErrorCounts[SELL_STEPS[i + 1].id as SellSectionId] === 0 && sellerStep > i)
                          ? "bg-emerald-400"
                          : "bg-slate-200",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {showValidationBanner && (
          <div
            ref={validationBannerRef}
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white px-4 py-3.5 flex items-start gap-3 shadow-sm"
            data-testid="sell-validation-banner"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold leading-snug">{validationMessages.bannerTitle}</p>
              <p className="text-[12px] text-white/90 mt-0.5 leading-snug">{validationMessages.bannerSubtitle}</p>
            </div>
          </div>
        )}

      {myListingCount !== null && myListingCount.activeCount >= 3 && myListingCount.activeCount < 4 && !hasActivePlan && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3">
          <span className="text-2xl leading-none mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700">{t("sell.lastFreeSlot")}</p>
            <p className="text-xs text-amber-600 mt-0.5">{t("sell.lastFreeSlotDesc")}</p>
          </div>
        </div>
      )}
      {myListingCount !== null && myListingCount.activeCount >= 4 && !hasActivePlan && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-orange-400/40 bg-orange-50 px-4 py-3">
          <span className="text-2xl leading-none mt-0.5">🚫</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-700">{t("sell.freeLimit", { count: myListingCount.activeCount, max: 4 })}</p>
            <p className="text-xs text-orange-600 mt-0.5">
              {purchasesDisabled ? t("androidPurchasePolicy.unavailable") : t("sell.freeLimitDesc")}
            </p>
            {!purchasesDisabled && <button
              type="button"
              onClick={() => setLocation("/subscription")}
              className="mt-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-3 py-1.5"
            >
              {t("sell.seePlans")}
            </button>}
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-3 md:space-y-4" noValidate>

          {/* ── Draft restored banner ─────────────────────────────────── */}
          {draftRestored && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 14px", borderRadius: 12,
              background: currency === "HTG" ? "#FFF7ED" : "#EFF6FF",
              border: `1px solid ${currency === "HTG" ? "#FED7AA" : "#BFDBFE"}`,
            }}>
              <span style={{ fontSize: 18 }}>{currency === "HTG" ? "⚠️" : "📋"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: currency === "HTG" ? "#C2410C" : "#1D4ED8" }}>
                  {t("sell.draftRestored")}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: currency === "HTG" ? "#EA580C" : "#3B82F6" }}>
                  {currency === "HTG"
                    ? t("sell.draftRestoredHtg", { defaultValue: "Draft currency: G HTG (Gourde). Confirm this is what you want." })
                    : t("sell.draftRestoredDesc")}
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

          <SellAccordionSection
            id="info"
            title={t("sell.productInformation", { defaultValue: "Product Information" })}
            icon={Package}
            open={openSection === "info"}
            onToggle={() => goSection("info", 0)}
            complete={checklist.title && checklist.category && checklist.description && sectionErrorCounts.info === 0}
            errorCount={sectionErrorCounts.info}
            missingLabel={formatSectionMissingLabel(sectionErrorCounts.info, validationMessages)}
            completedLabel={validationMessages.completed}
          >
          <FormField control={form.control} name="title" render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel className={cn(fieldState.error && "text-red-600")}>
                {t("sell.productTitle", { defaultValue: "Product Title" })} *
                <ReqDot filled={(field.value ?? "").trim().length >= 3} />
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    placeholder={t("sell.titlePlaceholder", { defaultValue: "Enter a product title" })}
                    {...field}
                    aria-invalid={!!fieldState.error}
                    className={cn(
                      fieldState.error && "border-red-500 bg-red-50/60 focus-visible:ring-red-500 pr-10",
                    )}
                    data-testid="input-title"
                  />
                  <FieldErrorIcon show={!!fieldState.error} />
                </div>
              </FormControl>
              <FormMessage className="text-red-600 font-medium" />
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
              <FormItem data-form-field="categoryId">
                <FormLabel className={cn(form.formState.errors.categoryId && "text-red-600")}>
                  {t("sell.category")} *
                  <ReqDot filled={Number(field.value) > 0} />
                </FormLabel>

                {/* Trigger row */}
                <FormControl>
                  <div className="relative">
                  <button
                    type="button"
                    name="categoryId"
                    onClick={openSheet}
                    data-testid="select-category"
                    aria-invalid={!!form.formState.errors.categoryId}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors",
                      form.formState.errors.categoryId
                        ? "border-red-500 bg-red-50/60 text-foreground"
                        : selectedCat
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
                  <FieldErrorIcon show={!!form.formState.errors.categoryId} />
                  </div>
                </FormControl>

                <FormMessage className="text-red-600 font-medium" />

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

          <FormField control={form.control} name="description" render={({ field, fieldState }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel className={cn("mb-0", fieldState.error && "text-red-600")}>
                  {t("sell.description")} *
                  <ReqDot filled={(field.value ?? "").trim().length >= 10} />
                </FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={aiDescLoading || !token || !(form.getValues("title") || "").trim()}
                  data-testid="button-ai-description"
                  onClick={async () => {
                    const title = (form.getValues("title") || "").trim();
                    if (!title || !token) {
                      toast({
                        title: t("sell.aiDescriptionNeedTitle", { defaultValue: "Add a title first" }),
                        variant: "destructive",
                      });
                      return;
                    }
                    setAiDescLoading(true);
                    try {
                      const catName = categories?.find((c: any) => c.id === selectedCategoryId)?.name
                        ?? categories?.flatMap((c: any) => c.children ?? []).find((c: any) => c.id === selectedCategoryId)?.name
                        ?? "";
                      const data = await apiFetch<{ content?: string }>("/api/flexa-ai/product-description", {
                        method: "POST",
                        body: JSON.stringify({
                          title,
                          category: catName,
                          condition: form.getValues("condition") || undefined,
                          price: form.getValues("price") || undefined,
                          language: (i18n.language || "en").slice(0, 2),
                          details: field.value || undefined,
                        }),
                      });
                      if (!data?.content) {
                        throw new Error(t("sell.aiDescriptionFailed", { defaultValue: "Could not generate description" }));
                      }
                      form.setValue("description", String(data.content).trim(), { shouldDirty: true, shouldValidate: true });
                      toast({ title: t("sell.aiDescriptionDone", { defaultValue: "Description drafted with Flexa AI" }) });
                    } catch (err: any) {
                      toast({
                        title: t("sell.aiDescriptionFailed", { defaultValue: "Could not generate description" }),
                        description: err?.message,
                        variant: "destructive",
                      });
                    } finally {
                      setAiDescLoading(false);
                    }
                  }}
                >
                  {aiDescLoading
                    ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {t("sell.aiDescription", { defaultValue: "Flexa AI" })}
                </Button>
              </div>
              <FormControl>
                <Textarea
                  placeholder={t("sell.descriptionPlaceholder")}
                  rows={4}
                  {...field}
                  aria-invalid={!!fieldState.error}
                  className={cn(fieldState.error && "border-red-500 bg-red-50/60 focus-visible:ring-red-500")}
                  data-testid="input-description"
                />
              </FormControl>
              <FormMessage className="text-red-600 font-medium" />
            </FormItem>
          )} />

          </SellAccordionSection>

          <SellAccordionSection
            id="media"
            title={t("sell.photosVideos", { defaultValue: "Photos & Videos" })}
            icon={Images}
            open={openSection === "media"}
            onToggle={() => goSection("media", 1)}
            complete={checklist.photos && sectionErrorCounts.media === 0}
            errorCount={sectionErrorCounts.media}
            missingLabel={formatSectionMissingLabel(sectionErrorCounts.media, validationMessages)}
            completedLabel={validationMessages.completed}
          >
          {/* Image upload section */}
          <div
            ref={photoSectionRef}
            role="group"
            aria-labelledby="sell-photos-label"
            aria-describedby={`sell-photo-requirement${uploadErrorMessage ? " sell-photo-error" : ""}`}
            aria-invalid={uploadedImages.length < requiredPhotoCount}
            aria-busy={uploadingSlot !== null}
          >
            <div id="sell-photos-label" className="text-sm font-medium text-foreground flex items-center mb-2">
              {t("sell.photos")}
              <ReqDot filled={uploadedImages.length >= requiredPhotoCount} />
              <span className="text-muted-foreground font-normal ml-1.5">({uploadedImages.length}/{MAX_IMAGES})</span>
            </div>
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
                    aria-label={`Retire foto ${i + 1}`}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-image-${i}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {canAddMore && (
                <label
                  className={cn(
                    "relative aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors bg-muted/30 flex flex-col items-center justify-center gap-1 overflow-hidden",
                    uploadingSlot !== null ? "cursor-wait opacity-70" : "cursor-pointer",
                  )}
                  data-testid="button-add-image"
                  aria-label={uploadingSource === "gallery" ? t("sell.photosUploading") : t("sell.chooseCameraOrGallery")}
                >
                  {uploadingSource === "gallery" ? (
                    <span role="status" aria-live="polite" className="flex flex-col items-center gap-1">
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin pointer-events-none" />
                      <span className="text-xs text-muted-foreground pointer-events-none">{t("sell.photosUploading")}</span>
                    </span>
                  ) : (
                    <>
                      <ImagePlus className="h-6 w-6 text-muted-foreground pointer-events-none" />
                      <span className="text-xs text-muted-foreground pointer-events-none">{t("sell.gallery")}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
                    data-testid={`input-image-${uploadedImages.length}`}
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                    disabled={uploadingSlot !== null}
                  />
                </label>
              )}
            </div>
            {uploadedImages.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">{t("sell.addPhotosHint")}</p>
            )}
            <p
              id="sell-photo-requirement"
              className={cn(
                "text-xs mt-1 font-medium",
                uploadedImages.length < requiredPhotoCount || sectionErrorCounts.media > 0
                  ? "text-red-600"
                  : "text-emerald-600",
              )}
              data-form-field="photos"
            >
              {uploadedImages.length < requiredPhotoCount || sectionErrorCounts.media > 0
                ? validationMessages.photoRequired
                : t("sell.photosReady", { max: MAX_IMAGES })}
            </p>
            {uploadErrorMessage && (
              <div id="sell-photo-error" className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                <p className="font-semibold">{validationMessages.photoUploadFailed}</p>
                <p>{uploadErrorMessage}</p>
                <p className="mt-1">{t("sell.uploadRetryHint")}</p>
              </div>
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

          </SellAccordionSection>

          <SellAccordionSection
            id="pricing"
            title={t("sell.pricingInventory", { defaultValue: "Pricing & Inventory" })}
            icon={Tag}
            open={openSection === "pricing"}
            onToggle={() => goSection("pricing", 2)}
            complete={checklist.price && sectionErrorCounts.pricing === 0}
            errorCount={sectionErrorCounts.pricing}
            missingLabel={formatSectionMissingLabel(sectionErrorCounts.pricing, validationMessages)}
            completedLabel={validationMessages.completed}
          >
          <FormField control={form.control} name="price" render={({ field, fieldState }) => (
            <FormItem>
              <div className="flex items-center justify-between mb-1.5">
                <FormLabel className={cn("mb-0", fieldState.error && "text-red-600")}>
                  {t("sell.price")} *
                  <ReqDot filled={Number(field.value) > 0} />
                </FormLabel>
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
                    className={cn(
                      "pl-7",
                      fieldState.error && "border-red-500 bg-red-50/60 focus-visible:ring-red-500 pr-10",
                    )}
                    aria-invalid={!!fieldState.error}
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-price"
                  />
                  <FieldErrorIcon show={!!fieldState.error} />
                </div>
              </FormControl>
              {currency === "HTG" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("sell.htgPriceHint", {
                    defaultValue: "Haitian Gourde (HTG) — displayed as G{{amount}}",
                    amount: field.value ? Math.round(Number(field.value)).toLocaleString() : "0",
                  })}
                </p>
              )}
              {currency === "DOP" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("sell.dopPriceHint", {
                    defaultValue: "Dominican Peso (DOP) — displayed as RD {{amount}}",
                    amount: field.value ? Math.round(Number(field.value)).toLocaleString() : "0",
                  })}
                </p>
              )}
              <FormMessage className="text-red-600 font-medium" />
            </FormItem>
          )} />


          <FormField control={form.control} name="stockQuantity" render={({ field }) => (
            <FormItem data-form-field="country">
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
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => videoFileInputRef.current?.click()}
                    disabled={videoUploading}
                    data-testid="button-video-pick"
                  >
                    {videoUploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("sell.videoUploading")}</>
                    ) : (
                      <><Video className="h-4 w-4 mr-2" />{t("sell.videoPick")}</>
                    )}
                  </Button>
                )}
                <VideoUploadChooser purpose="listing" onUse={setListingVideoUrl} />
              </>
            ) : (
              <div className="flex items-start gap-3 px-3 py-3 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
                <Video className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {!purchasesDisabled && <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("sell.videoUpgradeTitle")}</p>}
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {purchasesDisabled ? t("androidPurchasePolicy.unavailable") : t("sell.videoUpgradeMsg")}
                  </p>
                </div>
                {!purchasesDisabled && <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-900/30"
                  onClick={() => setLocation("/subscription")}
                  data-testid="button-video-upgrade"
                >
                  {t("sell.videoUpgradeBtn")}
                </Button>}
              </div>
            )}
          </div>

          <FormField control={form.control} name="condition" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("sell.condition")}<ReqDot filled={!!field.value} /></FormLabel>
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

          </SellAccordionSection>

          <SellAccordionSection
            id="delivery"
            title={t("sell.deliveryLocation", { defaultValue: "Delivery & Location" })}
            icon={Truck}
            open={openSection === "delivery"}
            onToggle={() => goSection("delivery", 3)}
            complete={checklist.delivery && sectionErrorCounts.delivery === 0}
            errorCount={sectionErrorCounts.delivery}
            missingLabel={formatSectionMissingLabel(sectionErrorCounts.delivery, validationMessages)}
            completedLabel={validationMessages.completed}
          >
          <FormField control={form.control} name="country" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                {t("sell.country", "Country")}
                <ReqDot filled={!!(field.value ?? "").trim()} />
                {isAdmin && (
                  <span className="ml-1 text-[10px] font-bold tracking-widest text-cyan-500 font-mono">ADM</span>
                )}
              </FormLabel>
              {isAdmin ? (
                <FormControl>
                  <select
                    name={field.name}
                    ref={field.ref}
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
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
                </FormControl>
              ) : (
                <FormControl>
                  <div tabIndex={-1} className="flex h-9 items-center justify-between rounded-md border border-input bg-muted/40 px-3 text-sm select-none">
                    <span>{countryFlag ? `${countryFlag} ` : ""}{field.value || "—"}</span>
                    <span className="text-xs text-muted-foreground">{t("sell.fromProfile", "From your profile")}</span>
                  </div>
                </FormControl>
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
            <FormField control={form.control} name="city" render={({ field, fieldState }) => (
              <FormItem data-form-field="city">
                <FormLabel className={cn(fieldState.error && "text-red-600")}>
                  {t("sell.city")} *
                  <ReqDot filled={!!(field.value ?? "").trim()} />
                  {countryFlag && (
                    <span className="text-xs text-muted-foreground ml-1 font-normal">
                      {countryFlag} {selectedCountry}
                    </span>
                  )}
                </FormLabel>
                {cityOptions.length > 0 ? (
                  <>
                    <FormControl>
                      <div className="relative">
                        <select
                          name={field.name}
                          ref={field.ref}
                          value={useOtherCity ? OTHER_CITY : cityDisplayValue}
                          onBlur={field.onBlur}
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
                          aria-invalid={!!fieldState.error}
                          className={cn(
                            "h-9 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring",
                            fieldState.error ? "border-red-500 bg-red-50/60 focus:ring-red-500" : "border-input",
                          )}
                          style={{ fontSize: "16px" }}
                        >
                          <option value="" disabled>{t("sell.cityPlaceholder")}</option>
                          {cityOptions.map((c) => (
                            <option key={c} value={c} data-testid={`city-option-${c}`}>{c}</option>
                          ))}
                          <option value={OTHER_CITY} data-testid="city-option-other">{t("sell.otherCity", { defaultValue: "Other city…" })}</option>
                        </select>
                        <FieldErrorIcon show={!!fieldState.error} />
                      </div>
                    </FormControl>
                    {useOtherCity && (
                      <FormControl>
                        <Input
                          placeholder={t("sell.cityPlaceholder")}
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          data-testid="input-city-other"
                          className={cn("mt-2", fieldState.error && "border-red-500 bg-red-50/60")}
                        />
                      </FormControl>
                    )}
                  </>
                ) : (
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder={selectedCountry ? t("sell.cityPlaceholder") : t("sell.selectCountryFirst", { defaultValue: "Select a country first" })}
                        {...field}
                        disabled={!selectedCountry}
                        aria-invalid={!!fieldState.error}
                        className={cn(fieldState.error && "border-red-500 bg-red-50/60 pr-10")}
                        data-testid="input-city"
                      />
                      <FieldErrorIcon show={!!fieldState.error} />
                    </div>
                  </FormControl>
                )}
                <FormMessage className="text-red-600 font-medium" />
              </FormItem>
            )} />

            <FormField control={form.control} name="location" render={({ field, fieldState }) => (
              <FormItem data-form-field="location">
                <FormLabel className={cn(fieldState.error && "text-red-600")}>
                  {t("sell.location")} *
                  <ReqDot filled={(field.value ?? "").trim().length >= 2} />
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder={t("sell.locationPlaceholder")}
                      {...field}
                      aria-invalid={!!fieldState.error}
                      className={cn(fieldState.error && "border-red-500 bg-red-50/60 pr-10")}
                      data-testid="input-location"
                    />
                    <FieldErrorIcon show={!!fieldState.error} />
                  </div>
                </FormControl>
                <FormMessage className="text-red-600 font-medium" />
              </FormItem>
            )} />
          </div>

          {/* ── Package weight & dimensions ───────────────────────────────────── */}
          {selectedCountry && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">⚖️ {t("sell.packageWeightTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isLocalDeliveryCountry
                    ? t("sell.packageWeightLocalDescription")
                    : t("sell.packageWeightInternationalDescription")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">{t("sell.packageWeightLabel")} *</label>
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
                      {Number(weightLbs) <= 5
                        ? `📦 ${t("sell.lightPackage")}`
                        : Number(weightLbs) <= 30
                          ? `📦 ${t("sell.mediumPackage")}`
                          : `🚗 ${t("sell.largePackage")}`}
                    </div>
                  )}
                </div>
              </div>
              {!isLocalDeliveryCountry && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">{t("sell.packageDimensionsLabel")}</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="number" min="0" step="0.1" placeholder={t("sell.packageLengthPlaceholder")} value={pkgLength} onChange={e => setPkgLength(e.target.value)} data-testid="input-pkg-length" />
                    <Input type="number" min="0" step="0.1" placeholder={t("sell.packageWidthPlaceholder")} value={pkgWidth}  onChange={e => setPkgWidth(e.target.value)}  data-testid="input-pkg-width"  />
                    <Input type="number" min="0" step="0.1" placeholder={t("sell.packageHeightPlaceholder")} value={pkgHeight} onChange={e => setPkgHeight(e.target.value)} data-testid="input-pkg-height" />
                  </div>
                  {pkgLength && pkgWidth && pkgHeight && Number(pkgLength) > 0 && Number(pkgWidth) > 0 && Number(pkgHeight) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("sell.dimensionalWeight")}: <strong>{(Number(pkgLength) * Number(pkgWidth) * Number(pkgHeight) / 139).toFixed(1)} lbs</strong>
                      {weightLbs && Number(weightLbs) > 0 && (
                        <> — {t("sell.carrierWillUse")}: <strong>{Math.max(Number(weightLbs), Number(pkgLength) * Number(pkgWidth) * Number(pkgHeight) / 139).toFixed(1)} lbs</strong></>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── FM delivery methods are Haiti-only ─────────────────────────── */}
          {selectedCountry && isLocalDeliveryCountry && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">{t("sell.deliveryMethodTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("sell.deliveryMethodDescription")}</p>
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
                  <span>{t("sell.deliveryMotorcycle")}</span>
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
                  <span>{t("sell.deliveryCar")}</span>
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
                  <span>{t("sell.deliveryBus")}</span>
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
                  <span>{t("sell.deliverySelf")}</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {sellerDeliveryMethod === "motorcycle"
                  ? t("sell.deliveryMotorcycleDescription")
                  : sellerDeliveryMethod === "car"
                  ? t("sell.deliveryCarDescription")
                  : sellerDeliveryMethod === "bus"
                  ? t("sell.deliveryBusDescription")
                  : t("sell.deliverySelfDescription")}
              </p>
            </div>
          )}

          {selectedCountry === "Dominican Republic" && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-semibold">{t("sell.deliveryMethodTitle")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["carrier", "self_delivery"] as const).map(choice => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setDominicanDeliveryChoice(choice)}
                    className={cn(
                      "px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                      dominicanDeliveryChoice === choice ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"
                    )}
                    aria-pressed={dominicanDeliveryChoice === choice}
                    data-testid={`dominican-delivery-${choice}`}
                  >
                    {t(choice === "carrier" ? "sell.deliveryCompany" : "sell.deliverySelf")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* ── Shipping options for non-Haiti listings ────────────────────── */}
          {selectedCountry && !isLocalDeliveryCountry && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">{t(selectedCountry === "Dominican Republic" && dominicanDeliveryChoice === "self_delivery" ? "sell.deliverySelf" : "sell.shippingOptionsTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t(selectedCountry === "Dominican Republic" && dominicanDeliveryChoice === "self_delivery" ? "sell.deliverySelfDescription" : "sell.shippingOptionsDescription")}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">{t("sell.shippingCostLabel")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("sell.shippingCostPlaceholder")}
                    className="pl-7"
                    value={intlShippingCost}
                    onChange={e => setIntlShippingCost(e.target.value)}
                    data-testid="input-shipping-cost"
                  />
                </div>
              </div>
              {!(selectedCountry === "Dominican Republic" && dominicanDeliveryChoice === "self_delivery") && <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">{t("sell.acceptedCarriersLabel")}</label>
                <div className="flex flex-wrap gap-2">
                  {listingCarriersForCountry(selectedCountry).map(carrier => {
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
                        data-testid={`carrier-${carrier.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                      >
                        {carrier === "Other" ? t("sell.otherCarrier") : carrier}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("sell.acceptedCarriersHint")}</p>
              </div>}
            </div>
          )}

          </SellAccordionSection>

          <SellAccordionSection
            id="review"
            title={t("sell.reviewPublish", { defaultValue: "Review & Publish" })}
            icon={Eye}
            open={openSection === "review"}
            onToggle={() => goSection("review", 4)}
            complete={false}
            errorCount={sectionErrorCounts.review}
            missingLabel={formatSectionMissingLabel(sectionErrorCounts.review, validationMessages)}
            completedLabel={validationMessages.completed}
          >
          {/* ── Live listing preview ─────────────────────────────────────────── */}
          {(() => {
            const vals = form.watch();
            const selCat = categories?.find(c => c.id === vals.categoryId);
            const selSub = selCat
              ? (selCat as any).children?.find((s: any) => s.id === vals.subcategoryId)
              : null;
            const selectedPreviewImages = uploadedImages.map(img => img.previewUrl);
            const usingSampleListing = selectedPreviewImages.length === 0;
            const previewImages = !usingSampleListing
              ? selectedPreviewImages
              : [sellPreviewCar];
            const hasContent = vals.title?.trim() || previewImages.length > 0;
            if (!hasContent) return null;
            const previewListing = {
              id: -1,
              title: usingSampleListing
                ? t("sell.previewSampleCarTitle")
                : vals.title?.trim() || t("sell.titlePlaceholder", "Your listing title"),
              price: Number(vals.price) || 127000,
              currency,
              images: previewImages,
              location: usingSampleListing ? "Miami" : vals.location || vals.city || "",
              city: usingSampleListing ? "Miami" : vals.city || null,
              country: usingSampleListing ? "United States" : vals.country || null,
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
                  {t("sell.preview", { defaultValue: "Preview — how buyers will see your listing" })}
                </p>
                <div className="max-w-[220px]">
                  <ListingCard listing={previewListing} preview previewFallbackImage={sellPreviewCar} />
                </div>
              </div>
            );
          })()}

          {/* ── Draft saved indicator ────────────────────────────────── */}
          {draftSavedAt && !createListing.isPending && !isEditMode && (
            <p className="text-[11px] text-slate-400 text-center m-0" data-testid="sell-draft-saved-at">
              💾 {t("sell.draftSavedAt", { defaultValue: "Draft saved" })} — {draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {/* ── Submit error with retry ───────────────────────────────── */}
          {submitError && !createListing.isPending && !showValidationBanner && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3" role="alert">
              <p className="m-0 mb-1 text-[13px] font-bold text-red-600">
                {submitRestricted
                  ? t("restriction.title")
                  : t("sell.publishErrorTitle", { defaultValue: "Publication error" })}
              </p>
              <p className="m-0 mb-2.5 text-[12px] text-red-700 leading-snug">
                {submitError}
              </p>
              <button
                type="button"
                onClick={() => submitRestricted ? setLocation("/support") : handlePublishClick()}
                disabled={isPublishBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-65"
              >
                {submitRestricted
                  ? t("restriction.contactSupport")
                  : t("common.tryAgain", { defaultValue: "Try again" })}
              </button>
            </div>
          )}

          {/* ── Payment method selector (hidden in edit mode) ──────── */}
          {paymentReady !== null && !isEditMode && (
            <div ref={paymentSectionRef} className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  {paymentReady ? (
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <p className="text-sm font-bold text-foreground">
                    {t("sell.payoutSectionTitle")}
                  </p>
                  {paymentReady && (
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      {t("sell.payoutActive")}
                    </span>
                  )}
                </div>
                {!paymentReady && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {isStripeOnlySeller ? t("sell.usStripeRequired") : t("sell.payoutSelectPrompt")}
                  </p>
                )}
                {isStripeOnlySeller && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t("sell.usStripeOnly")}
                  </p>
                )}
              </div>

              {/* Cards */}
              <PayoutMethodCards stripeFirst={isStripeOnlySeller}>

                {/* Kat FM */}
                {!isStripeOnlySeller && <button
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
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                        {t("sell.fmCardAlwaysAvailable")}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("sell.fmCardPayoutDescription")}
                  </p>
                  {savingPayoutMethod && cardPayoutMethod !== "fm_wallet" && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary absolute bottom-2 right-2" />
                  )}
                </button>}

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
                      <p className={`text-[10px] font-semibold mt-0.5 ${stripeAccountConnected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {stripeAccountConnected
                          ? stripeAccountActive
                            ? t("settings.connected")
                            : `${t("settings.connected")} · ${t("settings.pending")}`
                          : t("settings.notConnected")}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("sell.stripePayoutDescription")}
                  </p>
                  {cardPayoutMethod === "stripe" && (!stripeAccountConnected || (isStripeOnlySeller && !stripeAccountActive)) && (
                    <a
                      href="/settings"
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] font-bold text-[#635BFF] underline underline-offset-2 hover:no-underline"
                    >
                      {isStripeOnlySeller && stripeAccountConnected
                        ? t("sell.usStripeComplete")
                        : t("sell.connectStripeSettings")} →
                    </a>
                  )}
                  {savingPayoutMethod && cardPayoutMethod !== "stripe" && (
                    <Loader2 className="h-3 w-3 animate-spin text-[#635BFF] absolute bottom-2 right-2" />
                  )}
                </button>
              </PayoutMethodCards>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12 font-bold rounded-full bg-[#F97316] hover:bg-[#ea6a0c] text-white"
            disabled={isPublishBusy}
            aria-busy={isPublishBusy}
            data-testid="button-submit-listing"
          >
            {publishBusyLabel
              ? publishBusyLabel
              : isPending
                ? (isEditMode ? t("sell.savingChanges") : t("sell.publishing"))
                : (isEditMode ? t("sell.saveChanges") : t("sell.publishProduct", { defaultValue: "Publish Product" }))}
          </Button>
          </SellAccordionSection>
        </form>
      </Form>

      {/* Desktop right column — preview + checklist */}
      <aside className="hidden lg:block space-y-4 sticky top-20 self-start" data-testid="sell-preview-column">
        <div className="rounded-xl border border-border bg-white shadow-sm p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-3">
            {t("sell.preview", { defaultValue: "Product Preview" })}
          </p>
          {(() => {
            const vals = watchedVals;
            const selCat = categories?.find(c => c.id === vals.categoryId);
            const selSub = selCat ? (selCat as any).children?.find((s: any) => s.id === vals.subcategoryId) : null;
            const imgs = uploadedImages.map(img => img.previewUrl);
            const usingSample = imgs.length === 0;
            const previewImages = usingSample ? [sellPreviewCar] : imgs;
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
              <div className="max-w-[240px] mx-auto relative">
                <ListingCard listing={previewListing} preview previewFallbackImage={sellPreviewCar} />
              </div>
            );
          })()}
        </div>

        <div className="rounded-xl border border-border bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Check className="h-4 w-4" />
            </span>
            <p className="font-bold text-[14px]">{t("sell.listingChecklist", { defaultValue: "Listing Checklist" })}</p>
          </div>
          <ul className="space-y-2.5 text-[13px]">
            {[
              { ok: checklist.title, label: t("sell.listingTitle") },
              { ok: checklist.category, label: t("sell.category") },
              { ok: checklist.description, label: t("sell.description") },
              { ok: checklist.photos, label: t("sell.atLeastOnePhoto", { defaultValue: "At least 1 product photo" }) },
              { ok: checklist.price, label: t("sell.price") },
              { ok: !!watchedVals.stockQuantity, label: t("sell.stockQuantity", { defaultValue: "Quantity (inventory)" }) },
              { ok: checklist.delivery, label: t("sell.deliveryInfo", { defaultValue: "Delivery information" }) },
            ].map((row) => (
              <li key={row.label} className="flex items-center gap-2">
                <span className={row.ok ? "text-emerald-600" : "text-muted-foreground/40"}>
                  {row.ok ? <Check className="h-4 w-4" /> : <span className="inline-block w-4 h-4 rounded border border-border" />}
                </span>
                <span className={row.ok ? "text-foreground font-medium" : "text-muted-foreground"}>{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      </div>

      {/* Mobile sticky actions */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border px-3 py-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom))] flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraftClick}
          className="flex-1 h-11 border-[hsl(152,65%,28%)] text-[hsl(152,65%,28%)] font-bold rounded-full gap-1.5"
          data-testid="button-save-draft-mobile"
        >
          <FileText className="h-4 w-4" />
          {t("sell.saveDraft", { defaultValue: "Save Draft" })}
        </Button>
        <Button
          type="button"
          onClick={handlePublishClick}
          disabled={isPublishBusy}
          className="flex-1 h-11 bg-[#F6A07A] hover:bg-[#ef8f64] text-white font-bold rounded-full gap-1.5 shadow-sm"
          data-testid="button-publish-mobile"
        >
          {isPublishBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isPublishBusy
            ? (publishBusyLabel || t("sell.publishing", { defaultValue: "Publishing..." }))
            : isEditMode
              ? t("sell.saveChanges")
              : t("sell.publishProduct", { defaultValue: "Publish Product" })}
        </Button>
      </div>
      </div>
    </SellerCenterShell>
  );
}
