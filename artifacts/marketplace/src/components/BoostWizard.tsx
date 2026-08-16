import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  X, ArrowLeft, Package, Video, Plus, Upload, Check, Loader2,
  MessageCircle, Zap, Store, ChevronRight, Globe, ImagePlus, Users, AlertCircle,
} from "lucide-react";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS, citiesFor } from "@/lib/countries";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Step = "type" | "select" | "newForm" | "videoOnly" | "audience" | "uploadVideo" | "confirm" | "success";
type BoostType = "existing" | "new" | "video_only";

interface UserListing { id: number; title: string; price: number; images: string[]; }
interface Category { id: number; name: string; }
interface Props { open: boolean; onClose: () => void; }

const MAX_VIDEO_SECONDS = 180;
const MAX_VIDEO_BYTES = 350 * 1024 * 1024; // 350 MB — matches server cap
const MIN_BUDGET = 5;
const MAX_BUDGET = 500;
const DEFAULT_BUDGET = 12.99;

function toStorageUrl(path: string): string {
  if (!path) return "";
  // Already an absolute URL (https://...)
  if (/^https?:\/\//i.test(path)) return path;
  // Already a root-relative URL (/api/storage/objects/... or /objects/...)
  if (path.startsWith("/")) return path;
  // Bare object path without leading slash
  return `/api/storage/objects/${path}`;
}

export default function BoostWizard({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const isSuperAdmin = !!(user?.isSuperAdmin);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { uploadFile } = useUpload();

  const [step, setStep] = useState<Step>(() => {
    if (open) {
      try {
        const s = sessionStorage.getItem("bw_step") as Step | null;
        if (s && s !== "success" && s !== "confirm" && s !== "type") return s;
      } catch { /* sessionStorage unavailable */ }
    }
    return "type";
  });
  const [boostType, setBoostType] = useState<BoostType | null>(() => {
    if (open) {
      try {
        const bt = sessionStorage.getItem("bw_type") as BoostType | null;
        if (bt) return bt;
      } catch { /* sessionStorage unavailable */ }
    }
    return null;
  });

  // Flow A — existing product
  const [listings, setListings] = useState<UserListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListing, setSelectedListing] = useState<UserListing | null>(null);

  // Flow B — new product
  const [categories, setCategories] = useState<Category[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [newDesc, setNewDesc] = useState("");
  const [newCondition, setNewCondition] = useState<"new" | "used">("new");
  const [newLocation, setNewLocation] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newImageItems, setNewImageItems] = useState<{ preview: string; url: string | null }[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createdListingId, setCreatedListingId] = useState<number | null>(null);

  // Flow C — video only
  const [externalLink, setExternalLink] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [ctaText, setCtaText] = useState("");

  // Audience targeting (video-only flow).
  // Super-admins default to "ALL" (target every country).
  const [audienceCountry, setAudienceCountry] = useState<string>("");
  const [audienceGender, setAudienceGender] = useState<"all" | "male" | "female">("all");
  const [audienceAgeMin, setAudienceAgeMin] = useState(18);
  const [audienceAgeMax, setAudienceAgeMax] = useState(65);
  const [audienceCity, setAudienceCity] = useState("");

  // Video upload
  const [videoUrl, setVideoUrl] = useState<string | null>(() => {
    if (open) {
      try { return sessionStorage.getItem("bw_video_url"); } catch { /* ok */ }
    }
    return null;
  });
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Budget + reach estimate
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [estimatedViews, setEstimatedViews] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // Result
  const [confirming, setConfirming] = useState(false);
  const [resultListingId, setResultListingId] = useState<number | null>(null);
  const [shortfallUsd, setShortfallUsd] = useState<number | null>(null);

  // Persist step + boostType + videoUrl to sessionStorage while wizard is open (iOS reload survival)
  useEffect(() => {
    if (!open || step === "type") return;
    try {
      sessionStorage.setItem("bw_step", step);
      if (boostType) sessionStorage.setItem("bw_type", boostType);
      if (videoUrl) sessionStorage.setItem("bw_video_url", videoUrl);
      else sessionStorage.removeItem("bw_video_url");
    } catch { /* sessionStorage unavailable */ }
  }, [open, step, boostType, videoUrl]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("type");
      setBoostType(null);
      setSelectedListing(null);
      setVideoUploadError(null);
      try {
        sessionStorage.removeItem("bw_step");
        sessionStorage.removeItem("bw_type");
        sessionStorage.removeItem("bw_video_url");
      } catch { /* ok */ }
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
      setVideoUrl(null);
      setVideoObjectUrl(null);
      setNewTitle(""); setNewPrice(""); setNewDesc(""); setCreatedListingId(null);
      setNewCondition("new"); setNewLocation(""); setNewStock("");
      setNewImageItems(prev => { prev.forEach(it => URL.revokeObjectURL(it.preview)); return []; });
      setImageUploading(false); setFormErrors({});
      setExternalLink(""); setWhatsappEnabled(false); setWhatsappNumber(""); setCtaText("");
      setAudienceCountry(user?.country ?? "Haiti");
      setAudienceGender("all"); setAudienceAgeMin(18); setAudienceAgeMax(65); setAudienceCity("");
      setShortfallUsd(null); setResultListingId(null);
      setListings([]); setListingsLoading(false);
      setBudget(DEFAULT_BUDGET); setEstimatedViews(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch estimated reach whenever confirm step is shown or budget changes
  useEffect(() => {
    if (step !== "confirm") return;
    const country = (audienceCountry || user?.country) ?? "Haiti";
    const state = country === "Haiti" ? (user?.state ?? "Ouest") : null;
    setIsEstimating(true);
    setEstimatedViews(null);
    fetch("/api/boost/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        plan: "7day",
        budget,
        audience: { country, state, audienceType: "advantage_plus", ageMin: 18, ageMax: 65, gender: "all", objective: "auto" },
      }),
    })
      .then(r => r.json())
      .then(d => setEstimatedViews(typeof d.estimatedReach === "number" ? d.estimatedReach : null))
      .catch(() => setEstimatedViews(null))
      .finally(() => setIsEstimating(false));
  }, [step, budget, audienceCountry, user?.country, token]);

  // Default super-admin audience country to ALL when wizard opens
  useEffect(() => {
    if (isSuperAdmin && audienceCountry === "") setAudienceCountry("ALL");
  }, [isSuperAdmin, open]);

  // Load user listings (Flow A)
  useEffect(() => {
    if (step !== "select" || !user?.id || listings.length > 0) return;
    setListingsLoading(true);
    fetch(`/api/users/${user.id}/listings`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => setListings(Array.isArray(d) ? d : (d.listings ?? [])))
      .catch(() => {})
      .finally(() => setListingsLoading(false));
  }, [step, user?.id, token, listings.length]);

  // Load categories (Flow B)
  useEffect(() => {
    if (step !== "newForm" || categories.length > 0) return;
    fetch("/api/categories")
      .then(r => r.json())
      .then(cats => {
        if (Array.isArray(cats) && cats.length > 0) {
          setCategories(cats);
          setNewCategoryId(cats[0].id);
        }
      })
      .catch(() => {});
  }, [step, categories.length]);

  // Video probe + upload
  // Resolves with NaN when the browser can't decode metadata (e.g. HEVC/MOV on iOS).
  // Callers must treat NaN as "unknown" and skip the duration check rather than blocking.
  const probeVideoDuration = (file: File) =>
    new Promise<number>((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
      v.src = url;
    });

  /** Request a presigned PUT URL from our storage backend. */
  const requestPresignUrl = useCallback(async (file: File): Promise<{ uploadURL: string; objectPath: string }> => {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "video/mp4" }),
    });
    if (!res.ok) throw new Error("presign-failed");
    return res.json();
  }, []);

  /** Upload via XHR so we get real onprogress events (fetch has no upload progress).
   *  Returns the Cloudinary CDN URL when the proxy returns { url }, otherwise null. */
  const xhrUpload = useCallback((file: File, uploadURL: string): Promise<string | null> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPercent(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (typeof data?.url === "string" && data.url.startsWith("http")) {
              resolve(data.url);
              return;
            }
          } catch { /* non-JSON */ }
          resolve(null);
        } else {
          reject(new Error(`upload-failed-${xhr.status}`));
        }
      };
      xhr.onerror = () => { xhrRef.current = null; reject(new Error("upload-network-error")); };
      xhr.open("PUT", uploadURL);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.send(file);
    }), []);

  const CHUNK_SIZE      = 8 * 1024 * 1024;
  const CHUNK_THRESHOLD = 50 * 1024 * 1024;

  const chunkedUpload = useCallback(async (file: File): Promise<string> => {
    const storedToken = localStorage.getItem("flexamarket_token") ?? "";
    const authHeaders: Record<string, string> = storedToken
      ? { Authorization: `Bearer ${storedToken}` }
      : {};

    const initRes = await fetch("/api/storage/uploads/chunk-init", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
    if (!initRes.ok) throw new Error(`chunk-init-failed-${initRes.status}`);
    const { uploadId, objectPath } = await initRes.json() as {
      uploadId: string; objectPath: string;
    };

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const putRes = await fetch(`/api/storage/uploads/chunk/${uploadId}/${i}`, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "video/mp4",
          "Content-Length": String(chunk.size),
          ...authHeaders,
        },
        body: chunk,
      });
      if (!putRes.ok) throw new Error(`chunk-put-failed-${putRes.status}-idx-${i}`);
      setUploadPercent(Math.round(((i + 1) / totalChunks) * 90));
    }

    const finalRes = await fetch(`/api/storage/uploads/chunk-finalize/${uploadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ totalChunks, contentType: file.type || "video/mp4" }),
    });
    if (!finalRes.ok) throw new Error(`chunk-finalize-failed-${finalRes.status}`);
    setUploadPercent(100);
    // Prefer the full Wasabi URL (contains the actual object key) over objectPath
    // (which is just a session ID that cannot be resolved server-side).
    const finalData = await finalRes.json() as { url?: string; objectPath?: string };
    return (finalData.url && finalData.url.startsWith("http")) ? finalData.url : (finalData.objectPath ?? objectPath);
  }, []);

  const handleVideoFile = useCallback(async (file: File) => {
    if (file.size > MAX_VIDEO_BYTES) {
      toast({ title: t("boostWizard.errorVideoTooBig"), variant: "destructive" }); return;
    }

    xhrRef.current?.abort();

    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    const localUrl = URL.createObjectURL(file);
    setVideoObjectUrl(localUrl);
    setVideoUrl(null);
    setVideoUploadError(null);
    setVideoUploading(true);
    setUploadPercent(0);

    try {
      const secsPromise = probeVideoDuration(file);
      let objectPathResult: string;

      if (file.size > CHUNK_THRESHOLD) {
        const [secs, finalPath] = await Promise.all([secsPromise, chunkedUpload(file)]);
        if (Number.isFinite(secs) && secs > MAX_VIDEO_SECONDS + 0.5) {
          toast({ title: t("boostWizard.errorVideoTooLong"), variant: "destructive" });
          setVideoObjectUrl(null);
          URL.revokeObjectURL(localUrl);
          return;
        }
        objectPathResult = finalPath;
      } else {
        const [secs, { uploadURL, objectPath }] = await Promise.all([
          secsPromise,
          requestPresignUrl(file),
        ]);
        if (Number.isFinite(secs) && secs > MAX_VIDEO_SECONDS + 0.5) {
          toast({ title: t("boostWizard.errorVideoTooLong"), variant: "destructive" });
          setVideoObjectUrl(null);
          URL.revokeObjectURL(localUrl);
          return;
        }
        const cloudinaryUrl = await xhrUpload(file, uploadURL);
        objectPathResult = cloudinaryUrl ?? objectPath;
      }

      setVideoUrl(objectPathResult);
    } catch (err: any) {
      if (err?.message !== "abort") {
        const msg = t("boostWizard.errorGeneric");
        setVideoUploadError(msg);
        toast({ title: msg, variant: "destructive" });
      }
      setVideoObjectUrl(null);
      URL.revokeObjectURL(localUrl);
      setVideoUrl(null);
    } finally {
      setVideoUploading(false);
      setUploadPercent(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoObjectUrl, requestPresignUrl, xhrUpload, chunkedUpload, t, toast]);

  const handleVideoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleVideoFile(file);
  };

  // Image upload (Flow B)
  const handleImageFiles = useCallback(async (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 5 - newImageItems.length);
    if (!toAdd.length) return;
    setImageUploading(true);
    for (const file of toAdd) {
      const preview = URL.createObjectURL(file);
      setNewImageItems(prev => [...prev, { preview, url: null }]);
      try {
        const res = await uploadFile(file) as { objectPath?: string } | null | undefined;
        const url = res?.objectPath ?? null;
        setNewImageItems(prev => {
          const idx = prev.findIndex(it => it.preview === preview);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { preview, url };
          return updated;
        });
      } catch {
        setNewImageItems(prev => prev.filter(it => it.preview !== preview));
        URL.revokeObjectURL(preview);
      }
    }
    setImageUploading(false);
  }, [newImageItems.length, uploadFile]);

  const removeImage = useCallback((idx: number) => {
    setNewImageItems(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleImageFiles(e.target.files);
    e.target.value = "";
  };

  // Create new product (Flow B)
  const handleCreateProduct = async () => {
    const errors: Record<string, string> = {};
    if (newImageItems.length === 0) errors.images = t("boostWizard.errorImageRequired");
    if (!newTitle.trim()) errors.title = t("boostWizard.errorTitleRequired");
    const price = parseFloat(newPrice);
    if (!Number.isFinite(price) || price <= 0) errors.price = t("boostWizard.errorPriceTooLow");
    if (newDesc.trim().length < 20) errors.desc = t("boostWizard.errorDescTooShort");
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    const uploadedUrls = newImageItems.map(it => it.url).filter(Boolean) as string[];
    if (uploadedUrls.length === 0) {
      toast({ title: t("boostWizard.errorImageRequired"), variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      const stockQty = newStock.trim() ? parseInt(newStock, 10) : undefined;
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          price,
          categoryId: newCategoryId ?? 1,
          condition: newCondition,
          location: newLocation.trim() || user?.location || user?.country || "Haiti",
          country: user?.country,
          images: uploadedUrls,
          ...(Number.isFinite(stockQty) ? { stockQuantity: stockQty } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? t("boostWizard.errorGeneric"), variant: "destructive" }); return;
      }
      setCreatedListingId(data.id);
      setStep("uploadVideo");
    } catch {
      toast({ title: t("boostWizard.errorGeneric"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Confirm & Boost
  const handleConfirm = async () => {
    if (!videoUrl) {
      toast({ title: t("boostWizard.errorVideoRequired"), variant: "destructive" }); return;
    }
    const country = audienceCountry || user?.country || "Haiti";
    const state = country === "Haiti" ? "Ouest" : null;
    setConfirming(true);
    try {
      if (boostType === "video_only") {
        const ctaType = whatsappEnabled ? "whatsapp" : externalLink.trim() ? "link" : "none";
        const res = await fetch("/api/boost/video-only", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            videoUrl,
            ctaType,
            externalLink: externalLink.trim() || null,
            whatsappNumber: whatsappEnabled ? whatsappNumber.trim() : null,
            ctaText: ctaText.trim() || null,
            budget,
            audienceCountry: country,
            audienceGender,
            audienceAgeMin,
            audienceAgeMax,
            audienceCity: audienceCity || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "INSUFFICIENT_WALLET") {
            setShortfallUsd(data.shortfallUsd ?? null);
            setResultListingId(data.listingId ?? null);
          } else {
            toast({ title: data.error ?? t("boostWizard.errorGeneric"), variant: "destructive" }); return;
          }
        } else {
          setResultListingId(data.listingId);
        }
      } else {
        const listingId = boostType === "existing" ? selectedListing?.id : createdListingId;
        if (!listingId) {
          toast({ title: t("boostWizard.errorProductRequired"), variant: "destructive" }); return;
        }
        const res = await fetch(`/api/listings/${listingId}/boost/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            plan: "7day",
            paymentMethod: "wallet",
            videoUrl,
            audience: { country, state, audienceType: "advantage_plus", ageMin: 18, ageMax: 65, gender: "all", objective: "auto" },
            budget,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "INSUFFICIENT_WALLET") {
            setShortfallUsd(data.shortfallUsd ?? null);
            setResultListingId(listingId);
          } else {
            toast({ title: data.error ?? t("boostWizard.errorGeneric"), variant: "destructive" }); return;
          }
        } else {
          setResultListingId(data.listingId ?? listingId);
        }
      }
      setStep("success");
    } catch {
      toast({ title: t("boostWizard.errorGeneric"), variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const handleBack = () => {
    if (step === "select" || step === "newForm" || step === "videoOnly") setStep("type");
    else if (step === "audience") setStep("videoOnly");
    else if (step === "uploadVideo") setStep(boostType === "existing" ? "select" : "newForm");
    else if (step === "confirm") setStep(boostType === "video_only" ? "audience" : "uploadVideo");
  };

  const handleTypeSelect = (type: BoostType) => {
    setBoostType(type);
    setAudienceCountry(user?.country ?? "Haiti");
    if (type === "existing") setStep("select");
    else if (type === "new") setStep("newForm");
    else setStep("videoOnly");
  };

  if (!open) return null;

  // Shared video upload UI block
  const VideoUploadBlock = (
    <div className="space-y-2">
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoInput}
      />
      {videoObjectUrl ? (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <video src={videoObjectUrl} className="w-full h-full object-contain" controls muted playsInline />
          {/* Change button — hidden while uploading */}
          {!videoUploading && (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2.5 py-1.5 rounded-full font-medium hover:bg-black/90"
            >
              {t("boostWizard.step3Change")}
            </button>
          )}
          {/* Progress overlay */}
          {videoUploading && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 px-6">
              <Loader2 className="h-7 w-7 text-white animate-spin" />
              <div className="w-full">
                <div className="flex justify-between text-white text-xs mb-1.5 font-medium">
                  <span>{t("boostWizard.uploadingVideo")}</span>
                  <span>{uploadPercent}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-200"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          {/* Done badge */}
          {videoUrl && !videoUploading && (
            <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
              <Check className="h-3 w-3" />
            </div>
          )}
        </div>
      ) : videoUrl && !videoUploading ? (
        /* Video restored from sessionStorage after iOS page reload — no local blob preview available */
        <div className="w-full rounded-xl border-2 border-green-500/40 bg-green-500/5 p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
            <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-700 dark:text-green-300">{t("boostWizard.videoReady")}</p>
            <p className="text-xs text-muted-foreground truncate">{videoUrl.split("/").pop()}</p>
          </div>
          <button
            type="button"
            onClick={() => { setVideoUrl(null); videoInputRef.current?.click(); }}
            className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
          >
            {t("boostWizard.step3Change")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setVideoUploadError(null); videoInputRef.current?.click(); }}
          disabled={videoUploading}
          className={cn(
            "w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2.5 transition-all disabled:opacity-50",
            videoUploadError
              ? "border-destructive/50 bg-destructive/5 hover:border-destructive hover:bg-destructive/10"
              : "border-border hover:border-primary/50 hover:bg-primary/5"
          )}
        >
          {videoUploading
            ? <Loader2 className="h-9 w-9 text-primary animate-spin" />
            : videoUploadError
            ? <AlertCircle className="h-9 w-9 text-destructive" />
            : <Upload className="h-9 w-9 text-muted-foreground" />}
          <div className="text-center">
            <p className={cn("text-sm font-semibold", videoUploadError ? "text-destructive" : "text-foreground")}>
              {videoUploadError ? t("boostWizard.step3RetryBtn") : t("boostWizard.step3UploadBtn")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {videoUploadError ? videoUploadError : t("boostWizard.step3Help")}
            </p>
          </div>
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* Backdrop — on mobile, first tap dismisses keyboard (blur) without closing wizard */}
      <div
        className="absolute inset-0 bg-black/60"
        onPointerDown={(e) => {
          const active = document.activeElement as HTMLElement | null;
          if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
            e.preventDefault();
            active.blur();
          } else {
            onClose();
          }
        }}
      />

      {/* Panel — stop pointer events from bubbling to backdrop */}
      <div
        className="relative w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >

        {/* Premium accent bar */}
        <div className="h-1 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-600 shrink-0 rounded-t-2xl sm:rounded-t-2xl" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {step !== "type" && step !== "success" && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">{t("boostWizard.title")}</h2>
              {step !== "success" && (
                <p className="text-xs text-muted-foreground">{t(`boostWizard.stepLabel.${step}`)}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── Step 1: Choose type ──────────────────────────────────────────── */}
          {step === "type" && (
            <div>
              {/* Gradient hero banner */}
              <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 px-5 pt-5 pb-10">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_70%)]" />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner shrink-0">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white/80 text-[10px] font-black uppercase tracking-widest">FlexaBoost</p>
                    <h3 className="text-white text-lg font-black leading-tight">{t("boostWizard.heroTitle")}</h3>
                  </div>
                </div>
              </div>

              {/* Cards float over gradient */}
              <div className="px-4 -mt-6 space-y-3 pb-4 relative z-10">
                {(["existing", "new", "video_only"] as BoostType[]).map(type => {
                  type TypeConfig = { icon: React.ReactNode; borderColor: string; iconBg: string; chips: string[] };
                  const cfg: Record<BoostType, TypeConfig> = {
                    existing: {
                      icon: <Store className="h-5 w-5 text-blue-500" />,
                      borderColor: "border-l-blue-400",
                      iconBg: "bg-blue-50 dark:bg-blue-950/40",
                      chips: [t("boostWizard.chip.existing1"), t("boostWizard.chip.existing2")],
                    },
                    new: {
                      icon: <Plus className="h-5 w-5 text-green-500" />,
                      borderColor: "border-l-green-400",
                      iconBg: "bg-green-50 dark:bg-green-950/40",
                      chips: [t("boostWizard.chip.new1"), t("boostWizard.chip.new2")],
                    },
                    video_only: {
                      icon: <Video className="h-5 w-5 text-orange-500" />,
                      borderColor: "border-l-orange-400",
                      iconBg: "bg-orange-50 dark:bg-orange-950/40",
                      chips: [t("boostWizard.chip.videoOnly1"), t("boostWizard.chip.videoOnly2")],
                    },
                  };
                  const c = cfg[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeSelect(type)}
                      className={cn(
                        "w-full flex items-start gap-3.5 px-4 py-3.5 rounded-2xl border border-border border-l-4 bg-card hover:shadow-md text-left transition-all group shadow-sm",
                        c.borderColor,
                      )}
                    >
                      <div className={cn("p-2.5 rounded-xl shrink-0 mt-0.5", c.iconBg)}>
                        {c.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm leading-tight">{t(`boostWizard.type.${type}.title`)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t(`boostWizard.type.${type}.desc`)}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {c.chips.map(chip => (
                            <span key={chip} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">
                              ✓ {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
                    </button>
                  );
                })}

                {/* Promo perks callout */}
                <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-amber-500/5 to-transparent border border-primary/20 px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs font-black text-primary uppercase tracking-wider">{t("boostWizard.perksTitle")}</span>
                  </div>
                  <div className="space-y-1.5">
                    {[t("boostWizard.perk1"), t("boostWizard.perk2"), t("boostWizard.perk3")].map(perk => (
                      <div key={perk} className="flex items-center gap-2">
                        <span className="text-primary text-xs font-black">⚡</span>
                        <span className="text-xs text-muted-foreground">{perk}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-border/40">
                    <p className="text-[11px] text-muted-foreground/80 font-medium">
                      {t("boostWizard.priceNote", { price: MIN_BUDGET.toFixed(2) })}
                    </p>
                  </div>
                </div>

                <div className="h-1" />
              </div>
            </div>
          )}

          {/* ── Step 2A: Select existing product ────────────────────────────── */}
          {step === "select" && (
            <div className="p-5">
              <p className="text-sm font-semibold text-foreground mb-3">{t("boostWizard.step2SelectTitle")}</p>
              {listingsLoading ? (
                <div className="flex items-center justify-center py-14">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : listings.length === 0 ? (
                <div className="text-center py-14 space-y-3">
                  <Package className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">{t("boostWizard.step2SelectEmpty")}</p>
                  <Button variant="outline" size="sm" onClick={() => { onClose(); setLocation("/sell"); }}>
                    {t("boostWizard.step2SelectEmptyBtn")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {listings.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => { setSelectedListing(l); setStep("uploadVideo"); }}
                      className={cn(
                        "rounded-xl border text-left overflow-hidden transition-all shadow-sm hover:shadow-md",
                        selectedListing?.id === l.id
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      {l.images?.[0] ? (
                        <img
                          src={toStorageUrl(l.images[0])}
                          alt={l.title}
                          loading="lazy"
                          className="w-full aspect-square object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute("style"); }}
                        />
                      ) : null}
                      <div
                        className="w-full aspect-square bg-muted flex items-center justify-center"
                        style={l.images?.[0] ? { display: "none" } : undefined}
                      >
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-foreground truncate leading-snug">{l.title}</p>
                        <p className="text-xs text-primary font-bold mt-0.5">${l.price.toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2B: New product form ───────────────────────────────────── */}
          {step === "newForm" && (
            <div className="p-5 space-y-6">
              {/* Hidden file inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageInput}
              />

              {/* ── Section 1: Images ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wide">
                    {t("boostWizard.step2NewImagesSection")}
                    <span className="text-red-500 ml-0.5">*</span>
                  </p>
                  <span className="text-xs text-muted-foreground">{newImageItems.length}/5</span>
                </div>
                {formErrors.images && (
                  <p className="text-xs text-red-500 font-medium">{formErrors.images}</p>
                )}

                {newImageItems.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={imageUploading}
                    className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-2.5 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                  >
                    <ImagePlus className="h-9 w-9 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{t("boostWizard.step2NewImagesUpload")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("boostWizard.step2NewImagesHelp")}</p>
                    </div>
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {newImageItems.map((item, idx) => (
                      <div key={item.preview} className="relative aspect-square rounded-xl overflow-hidden bg-muted border border-border">
                        <img
                          src={item.preview}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {/* Upload pending spinner */}
                        {item.url === null && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-white animate-spin" />
                          </div>
                        )}
                        {/* Uploaded badge */}
                        {item.url !== null && (
                          <div className="absolute top-1 left-1 bg-green-500 rounded-full p-0.5">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                        {/* Main badge on first image */}
                        {idx === 0 && (
                          <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                            {t("boostWizard.step2NewImagesMain")}
                          </div>
                        )}
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {newImageItems.length < 5 && (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={imageUploading}
                        className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                      >
                        <Plus className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-medium">{t("boostWizard.step2NewImagesAddMore")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section 2: Details ── */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide">{t("boostWizard.step2NewDetailsSection")}</p>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("boostWizard.step2NewTitleLabel")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={newTitle}
                    onChange={e => { setNewTitle(e.target.value); if (formErrors.title) setFormErrors(p => ({ ...p, title: "" })); }}
                    placeholder={t("boostWizard.step2NewTitlePlaceholder")}
                    className={cn(formErrors.title && "border-red-400 focus-visible:ring-red-400")}
                  />
                  {formErrors.title && <p className="text-xs text-red-500">{formErrors.title}</p>}
                </div>

                {/* Price */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("boostWizard.step2NewPriceLabel")} <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={newPrice}
                      onChange={e => { setNewPrice(e.target.value); if (formErrors.price) setFormErrors(p => ({ ...p, price: "" })); }}
                      className={cn("pl-7", formErrors.price && "border-red-400 focus-visible:ring-red-400")}
                      placeholder="0.00"
                    />
                  </div>
                  {formErrors.price && <p className="text-xs text-red-500">{formErrors.price}</p>}
                </div>

                {/* Category */}
                {categories.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("boostWizard.step2NewCategoryLabel")}</Label>
                    <Select value={String(newCategoryId ?? "")} onValueChange={v => setNewCategoryId(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Condition toggle */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("boostWizard.step2NewConditionLabel")}</Label>
                  <div className="flex gap-2">
                    {(["new", "used"] as const).map(cond => (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => setNewCondition(cond)}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-sm font-semibold border transition-all",
                          newCondition === cond
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:border-primary/50"
                        )}
                      >
                        {t(`boostWizard.step2NewCondition${cond === "new" ? "New" : "Used"}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("boostWizard.step2NewDescLabel")} <span className="text-red-500">*</span>
                    </Label>
                    <span className={cn("text-xs", newDesc.trim().length >= 20 ? "text-green-500" : "text-muted-foreground")}>
                      {newDesc.trim().length}/20 min
                    </span>
                  </div>
                  <Textarea
                    value={newDesc}
                    onChange={e => { setNewDesc(e.target.value); if (formErrors.desc) setFormErrors(p => ({ ...p, desc: "" })); }}
                    placeholder={t("boostWizard.step2NewDescPlaceholder")}
                    rows={4}
                    className={cn("resize-none", formErrors.desc && "border-red-400 focus-visible:ring-red-400")}
                  />
                  {formErrors.desc && <p className="text-xs text-red-500">{formErrors.desc}</p>}
                </div>
              </div>

              {/* ── Section 3: Optional ── */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide">{t("boostWizard.step2NewOptionalSection")}</p>

                {/* Location */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("boostWizard.step2NewLocationLabel")}</Label>
                  <Input
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder={t("boostWizard.step2NewLocationPlaceholder")}
                  />
                </div>

                {/* Stock */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("boostWizard.step2NewStockLabel")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newStock}
                    onChange={e => setNewStock(e.target.value)}
                    placeholder={t("boostWizard.step2NewStockPlaceholder")}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2C: Video-only ─────────────────────────────────────────── */}
          {step === "videoOnly" && (
            <div className="p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">{t("boostWizard.step2VideoTitle")}</p>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("boostWizard.step2VideoLabel")}</Label>
                {VideoUploadBlock}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  {t("boostWizard.step2VideoLinkLabel")}
                </Label>
                <Input
                  value={externalLink}
                  onChange={e => setExternalLink(e.target.value)}
                  placeholder={t("boostWizard.step2VideoLinkPlaceholder")}
                  type="url"
                  disabled={whatsappEnabled}
                />
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MessageCircle className="h-3 w-3 text-green-500" />
                    {t("boostWizard.step2VideoWhatsappToggle")}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setWhatsappEnabled(e => !e)}
                    className={cn(
                      "w-9 h-5 rounded-full transition-all relative shrink-0",
                      whatsappEnabled ? "bg-green-500" : "bg-muted-foreground/30"
                    )}
                    aria-pressed={whatsappEnabled}
                  >
                    <span className={cn(
                      "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      whatsappEnabled && "translate-x-4"
                    )} />
                  </button>
                </div>
                {whatsappEnabled && (
                  <Input
                    value={whatsappNumber}
                    onChange={e => setWhatsappNumber(e.target.value)}
                    placeholder={t("boostWizard.step2VideoWhatsappPlaceholder")}
                    type="tel"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("boostWizard.step2VideoCtaLabel")}
                </Label>
                <Input
                  value={ctaText}
                  onChange={e => setCtaText(e.target.value)}
                  placeholder={t("boostWizard.step2VideoCtaPlaceholder")}
                />
              </div>
            </div>
          )}

          {/* ── Step 2D: Audience targeting (video-only) ─────────────────────── */}
          {step === "audience" && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{t("boostWizard.audienceTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("boostWizard.audienceSubtitle")}</p>
                </div>
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("boostWizard.audienceCountryLabel")}
                </Label>
                <Select value={audienceCountry} onValueChange={v => { setAudienceCountry(v); setAudienceCity(""); }}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t("boostWizard.audienceCountryPlaceholder", { defaultValue: "Select a country" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && (
                      <SelectItem value="ALL">🌍 All Countries</SelectItem>
                    )}
                    {SUPPORTED_COUNTRIES.map(c => (
                      <SelectItem key={c} value={c}>
                        {COUNTRY_FLAGS[c]} {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* City — hide when targeting ALL countries */}
              {audienceCountry !== "ALL" && citiesFor(audienceCountry).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("boostWizard.audienceCityLabel")}
                  </Label>
                  <Select value={audienceCity} onValueChange={setAudienceCity}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t("boostWizard.audienceCityAll")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("boostWizard.audienceCityAll")}</SelectItem>
                      {citiesFor(audienceCountry).map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Gender */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("boostWizard.audienceGenderLabel")}
                </Label>
                <div className="flex gap-2">
                  {(["all", "male", "female"] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setAudienceGender(g)}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all",
                        audienceGender === g
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/50 bg-muted/30"
                      )}
                    >
                      {t(`boostWizard.audienceGender_${g}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("boostWizard.audienceAgeLabel")}
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number" min={13} max={audienceAgeMax - 1}
                    value={audienceAgeMin}
                    onChange={e => setAudienceAgeMin(Math.max(13, Math.min(audienceAgeMax - 1, Number(e.target.value))))}
                    className="w-20 text-center h-10"
                  />
                  <span className="text-muted-foreground font-bold">–</span>
                  <Input
                    type="number" min={audienceAgeMin + 1} max={80}
                    value={audienceAgeMax}
                    onChange={e => setAudienceAgeMax(Math.max(audienceAgeMin + 1, Math.min(80, Number(e.target.value))))}
                    className="w-20 text-center h-10"
                  />
                  <span className="text-xs text-muted-foreground">{t("boostWizard.audienceAgeUnit")}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Upload video (A & B) ─────────────────────────────────── */}
          {step === "uploadVideo" && (
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("boostWizard.step3Title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("boostWizard.step3Help")}</p>
              </div>
              {VideoUploadBlock}
              {/* Product preview chip */}
              {(selectedListing || createdListingId) && (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                  {selectedListing?.images?.[0] ? (
                    <img
                    src={toStorageUrl(selectedListing.images[0])}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 rounded-lg object-cover shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {selectedListing?.title ?? t("boostWizard.newProductLabel")}
                    </p>
                    {selectedListing && (
                      <p className="text-xs text-primary font-bold">${selectedListing.price.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Super-admin: choose boost audience country ── */}
              {isSuperAdmin && (
                <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-purple-500 text-white rounded-full px-1.5 py-0.5 leading-none">ADMIN</span>
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">{t("boostWizard.audienceCountryLabel")}</p>
                  </div>
                  <Select
                    value={audienceCountry || user?.country || ""}
                    onValueChange={v => { setAudienceCountry(v); setAudienceCity(""); }}
                  >
                    <SelectTrigger className="h-10 border-purple-300 dark:border-purple-700">
                      <SelectValue placeholder="Select a country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">🌍 All Countries</SelectItem>
                      {SUPPORTED_COUNTRIES.map(c => (
                        <SelectItem key={c} value={c}>
                          {COUNTRY_FLAGS[c]} {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {audienceCountry !== "ALL" && citiesFor(audienceCountry || user?.country || "").length > 0 && (
                    <Select value={audienceCity} onValueChange={setAudienceCity}>
                      <SelectTrigger className="h-10 border-purple-300 dark:border-purple-700">
                        <SelectValue placeholder={t("boostWizard.audienceCityAll")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t("boostWizard.audienceCityAll")}</SelectItem>
                        {citiesFor(audienceCountry || user?.country || "").map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Confirm ──────────────────────────────────────────────── */}
          {step === "confirm" && (
            <div className="p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">{t("boostWizard.confirmTitle")}</p>
              {videoObjectUrl && (
                <div className="rounded-xl overflow-hidden bg-black aspect-video">
                  <video src={videoObjectUrl} className="w-full h-full object-contain" controls muted playsInline />
                </div>
              )}

              {/* Budget slider */}
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{t("boostWizard.confirmBudgetLabel")}</span>
                  <span className="text-sm font-bold text-primary">${budget.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={MIN_BUDGET}
                  max={MAX_BUDGET}
                  step={0.5}
                  value={budget}
                  onChange={e => setBudget(parseFloat(e.target.value))}
                  className="w-full h-2 accent-primary cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>${MIN_BUDGET}</span>
                  <span className="text-center flex items-center gap-1">
                    {isEstimating
                      ? <span className="animate-pulse">{t("boostWizard.confirmViewsLoading")}</span>
                      : estimatedViews != null
                        ? <span className="font-semibold text-foreground">~{estimatedViews.toLocaleString()} {t("boostWizard.confirmViewsUnit")}</span>
                        : null}
                  </span>
                  <span>${MAX_BUDGET}</span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">{t("boostWizard.confirmBudgetHelp")}</p>
              </div>

              {/* Low-budget warning */}
              {budget < 15 && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{t("boostWizard.lowBudgetWarning")}</p>
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden divide-y divide-border/60">
                {[
                  { label: t("boostWizard.confirmType"), value: t(`boostWizard.type.${boostType}.title`) },
                  ...(boostType === "existing" && selectedListing
                    ? [{ label: t("boostWizard.confirmProduct"), value: selectedListing.title }]
                    : []),
                  ...(boostType === "new" && newTitle
                    ? [{ label: t("boostWizard.confirmProduct"), value: newTitle }]
                    : []),
                  ...(boostType === "video_only" && (externalLink || whatsappEnabled)
                    ? [{
                        label: t("boostWizard.confirmCta"),
                        value: whatsappEnabled
                          ? `💬 +${whatsappNumber.replace(/^\+/, "")}`
                          : `🌐 ${externalLink.replace(/^https?:\/\//, "").slice(0, 30)}`,
                      }]
                    : []),
                  { label: t("boostWizard.confirmDuration"), value: t("boostWizard.confirm7days") },
                  { label: t("boostWizard.confirmCountry"), value: audienceCountry || user?.country || "—" },
                  ...(audienceCity && boostType !== "video_only" ? [{ label: t("boostWizard.confirmCity"), value: audienceCity }] : []),
                  ...(boostType === "video_only" ? [
                    { label: t("boostWizard.confirmGender"), value: t(`boostWizard.audienceGender_${audienceGender}`) },
                    { label: t("boostWizard.confirmAge"), value: `${audienceAgeMin}–${audienceAgeMax} ans` },
                    ...(audienceCity ? [{ label: t("boostWizard.confirmCity"), value: audienceCity }] : []),
                  ] : []),
                  { label: t("boostWizard.confirmPrice"), value: `$${budget.toFixed(2)}` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="text-xs font-semibold text-foreground text-right max-w-[55%] truncate">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 5: Success / Shortfall ──────────────────────────────────── */}
          {step === "success" && (
            <div className="p-5 py-8 text-center space-y-5">
              {shortfallUsd != null ? (
                <>
                  <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
                    <Zap className="h-8 w-8 text-amber-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground">{t("boostWizard.shortfallTitle")}</h3>
                    <p className="text-sm text-muted-foreground">{t("boostWizard.shortfallDesc")}</p>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {t("boostWizard.shortfallNeeded", { amount: shortfallUsd.toFixed(2) })}
                    </p>
                  </div>
                  <div className="space-y-2.5 max-w-xs mx-auto">
                    {resultListingId && (
                      <Button
                        className="w-full h-11 bg-[#F97316] hover:bg-[#F97316]/90 text-white font-bold"
                        onClick={() => { onClose(); setLocation(`/boost/${resultListingId}`); }}
                      >
                        {t("boostWizard.shortfallGoToBoost")}
                      </Button>
                    )}
                    <Button variant="outline" className="w-full h-11" onClick={() => { onClose(); setLocation("/wallet"); }}>
                      {t("boostWizard.shortfallRecharge")}
                    </Button>
                    <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
                      {t("boostWizard.successDone")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                    <Check className="h-8 w-8 text-green-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground">{t("boostWizard.successTitle")}</h3>
                    <p className="text-sm text-muted-foreground">{t("boostWizard.successDesc")}</p>
                  </div>
                  <Button className="w-full h-11 font-bold max-w-xs mx-auto block" onClick={onClose}>
                    {t("boostWizard.successDone")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {step !== "type" && step !== "success" && (
          <div className="px-5 py-4 border-t border-border shrink-0 bg-card" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
            {step === "newForm" && (() => {
              const allUploaded = newImageItems.length > 0 && newImageItems.every(it => it.url !== null);
              const price = parseFloat(newPrice);
              const canSubmit = allUploaded && newTitle.trim().length > 0 && Number.isFinite(price) && price > 0 && newDesc.trim().length >= 20;
              return (
                <Button
                  className="w-full h-11 font-bold bg-[#F97316] hover:bg-[#F97316]/90 text-white"
                  onClick={handleCreateProduct}
                  disabled={creating || imageUploading || !canSubmit}
                >
                  {creating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("boostWizard.step2NewCreating")}</>
                    : imageUploading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("boostWizard.step2NewUploading")}</>
                    : t("boostWizard.step2NewCreateBtn")}
                </Button>
              );
            })()}
            {(step === "uploadVideo" || step === "videoOnly") && (
              <Button
                className="w-full h-11 font-bold"
                onClick={() => {
                  if (!videoUrl) {
                    toast({ title: t("boostWizard.errorVideoRequired"), variant: "destructive" });
                    return;
                  }
                  setStep(step === "videoOnly" ? "audience" : "confirm");
                }}
                disabled={videoUploading || !videoUrl}
              >
                {videoUploading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : t("boostWizard.next")}
              </Button>
            )}
            {step === "audience" && (
              <Button
                className="w-full h-11 font-bold bg-[#F97316] hover:bg-[#F97316]/90 text-white"
                onClick={() => setStep("confirm")}
              >
                {t("boostWizard.next")}
              </Button>
            )}
            {step === "confirm" && (
              <Button
                className="w-full h-11 font-bold bg-[#F97316] hover:bg-[#F97316]/90 text-white"
                onClick={handleConfirm}
                disabled={confirming}
              >
                {confirming
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("boostWizard.confirmBtnLoading")}</>
                  : <>🔥 {t("boostWizard.confirmBtn")}</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
