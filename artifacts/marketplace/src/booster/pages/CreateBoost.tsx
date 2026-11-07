import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Image as ImageIcon, Video, Upload, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { startVideoUpload } from "@/lib/videoUploadQueue";
import { probeVideoDuration } from "@/lib/probeVideoDuration";
import { useUpload } from "@workspace/object-storage-web";
import BoosterLayout from "../BoosterLayout";
import { formatDuration, loadDraft, saveDraft, type BoosterMediaType } from "../draft";

const MAX_BOOST_VIDEO_SECONDS = 120;

interface UserListing {
  id: number;
  title: string;
  price: number;
  images: string[];
  listingVideoUrl?: string | null;
}

export default function CreateBoostPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { uploadFile } = useUpload();
  const draft = loadDraft();

  const [mediaType, setMediaType] = useState<BoosterMediaType>(draft.mediaType);
  const [adTitle, setAdTitle] = useState(draft.adTitle);
  const [adDescription, setAdDescription] = useState(draft.adDescription);
  const [mediaUrl, setMediaUrl] = useState<string | null>(draft.mediaUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(draft.mediaPreviewUrl);
  const [durationSec, setDurationSec] = useState<number | null>(draft.mediaDurationSec);
  const [listingId, setListingId] = useState<number | null>(draft.listingId);
  const [listings, setListings] = useState<UserListing[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token || !user?.id) return;
    fetch(`/api/users/${user.id}/listings`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const rows = Array.isArray(data?.listings) ? data.listings
          : Array.isArray(data) ? data : [];
        setListings(rows.map((l: any) => ({
          id: l.id,
          title: l.title,
          price: l.price,
          images: l.images ?? [],
          listingVideoUrl: l.listingVideoUrl ?? l.videoUrl ?? null,
        })));
      })
      .catch(() => {});
  }, [token, user?.id]);

  const setType = (t: BoosterMediaType) => {
    setMediaType(t);
    saveDraft({ mediaType: t });
  };

  const pickListingMedia = (listing: UserListing) => {
    if (mediaType === "video") {
      const url = listing.listingVideoUrl;
      if (!url) {
        toast({
          title: "Pa gen videyo",
          description: "Pwodui sa a pa gen videyo. Telechaje yon nouvo videyo promo.",
          variant: "destructive",
        });
        return;
      }
      setListingId(listing.id);
      setMediaUrl(url);
      setPreviewUrl(listing.images[0] ?? null);
      setAdTitle(listing.title);
      saveDraft({
        listingId: listing.id,
        listingTitle: listing.title,
        adTitle: listing.title,
        mediaUrl: url,
        mediaPreviewUrl: listing.images[0] ?? null,
        mediaType: "video",
      });
    } else {
      const img = listing.images[0];
      if (!img) {
        toast({ title: "Pa gen imaj", variant: "destructive" });
        return;
      }
      setListingId(listing.id);
      setMediaUrl(img);
      setPreviewUrl(img);
      setAdTitle(listing.title);
      saveDraft({
        listingId: listing.id,
        listingTitle: listing.title,
        adTitle: listing.title,
        mediaUrl: img,
        mediaPreviewUrl: img,
        mediaType: "image",
      });
    }
  };

  const onFile = async (file: File) => {
    if (!token || !user) {
      toast({ title: "Konekte pou kontinye", variant: "destructive" });
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      if (mediaType === "video") {
        if (!file.type.startsWith("video/")) {
          toast({ title: "Chwazi yon fichye videyo", variant: "destructive" });
          return;
        }
        const seconds = await probeVideoDuration(file);
        if (Number.isFinite(seconds) && seconds > MAX_BOOST_VIDEO_SECONDS + 0.5) {
          toast({
            title: "Videyo twò long",
            description: `Maksimòm ${MAX_BOOST_VIDEO_SECONDS} segonn pou anons Booster.`,
            variant: "destructive",
          });
          return;
        }
        const localPreview = URL.createObjectURL(file);
        setPreviewUrl(localPreview);
        setDurationSec(Number.isFinite(seconds) ? seconds : null);
        const url = await startVideoUpload(file, token, {
          ownerId: user.id,
          purpose: "boost",
          onProgress: (p) => setUploadPct(p),
        });
        setMediaUrl(url);
        saveDraft({
          mediaType: "video",
          mediaUrl: url,
          mediaPreviewUrl: localPreview,
          mediaDurationSec: Number.isFinite(seconds) ? seconds : null,
          adTitle: adTitle || file.name.replace(/\.[^.]+$/, ""),
        });
      } else {
        if (!file.type.startsWith("image/")) {
          toast({ title: "Chwazi yon imaj", variant: "destructive" });
          return;
        }
        const uploaded = await uploadFile(file);
        const objectPath = uploaded?.objectPath;
        if (!objectPath) throw new Error("Upload failed");
        const url = objectPath.startsWith("/")
          ? objectPath
          : `/api/storage/objects/${objectPath}`;
        setMediaUrl(url);
        setPreviewUrl(url);
        setDurationSec(null);
        saveDraft({
          mediaType: "image",
          mediaUrl: url,
          mediaPreviewUrl: url,
          mediaDurationSec: null,
        });
      }
      toast({ title: "Medya telechaje ✓" });
    } catch (err: any) {
      toast({
        title: "Telechajman echwe",
        description: err?.message ?? "Eseye ankò",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const next = () => {
    if (!mediaUrl) {
      toast({ title: "Ajoute medya anons lan", variant: "destructive" });
      return;
    }
    if (!adTitle.trim()) {
      toast({ title: "Mete yon tit anons", variant: "destructive" });
      return;
    }
    saveDraft({
      mediaType,
      adTitle: adTitle.trim(),
      adDescription: adDescription.trim(),
      mediaUrl,
      mediaPreviewUrl: previewUrl,
      mediaDurationSec: durationSec,
      listingId,
      country: draft.country || user?.country || "",
    });
    navigate("/booster/audience");
  };

  return (
    <BoosterLayout
      title="Create Boost"
      subtitle="Chwazi medya anons lan — imaj oswa videyo (maks. 120s)."
    >
      <div className="bp-stepper" aria-hidden>
        <div className="bp-step-dot active" />
        <div className="bp-step-dot" />
        <div className="bp-step-dot" />
        <div className="bp-step-dot" />
      </div>

      <div className="bp-card">
        <label className="bp-label">Select Ad Type</label>
        <div className="bp-toggle-pair">
          <button
            type="button"
            className={`bp-toggle${mediaType === "image" ? " active" : ""}`}
            onClick={() => setType("image")}
            data-testid="booster-type-image"
          >
            <ImageIcon className="h-4 w-4" /> Image Ad
          </button>
          <button
            type="button"
            className={`bp-toggle${mediaType === "video" ? " active" : ""}`}
            onClick={() => setType("video")}
            data-testid="booster-type-video"
          >
            <Video className="h-4 w-4" /> Video Ad
          </button>
        </div>
      </div>

      <div className="bp-card">
        <label className="bp-label">Upload Media</label>
        {previewUrl || mediaUrl ? (
          <div className="bp-media-preview" style={{ marginBottom: 10 }}>
            {mediaType === "video" && mediaUrl ? (
              <video src={mediaUrl} poster={previewUrl ?? undefined} muted playsInline controls />
            ) : (
              <img src={previewUrl || mediaUrl || ""} alt="" />
            )}
            {durationSec != null && (
              <span className="bp-media-badge">{formatDuration(durationSec)}</span>
            )}
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept={mediaType === "video" ? "video/*" : "image/*"}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />

        <button
          type="button"
          className="bp-upload"
          style={{ width: "100%" }}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          data-testid="booster-upload-media"
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              <div style={{ fontWeight: 700, fontSize: 13 }}>Telechaje… {uploadPct}%</div>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 mx-auto mb-2 opacity-60" />
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {mediaType === "video" ? "Telechaje videyo promo" : "Telechaje imaj promo"}
              </div>
              <div style={{ fontSize: 11, color: "var(--bp-muted)", marginTop: 4 }}>
                {mediaType === "video" ? "MP4 / MOV · max 120 segonn" : "JPG / PNG · rapò kenbe"}
              </div>
            </>
          )}
        </button>

        {listings.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <label className="bp-label">Oswa itilize medya pwodui ki deja egziste</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {listings.slice(0, 20).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => pickListingMedia(l)}
                  className="bp-btn bp-btn-ghost"
                  style={{ justifyContent: "flex-start", gap: 10 }}
                >
                  {l.images[0] ? (
                    <img src={l.images[0]} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e2e8f0" }} />
                  )}
                  <span style={{ fontSize: 13, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bp-card">
        <label className="bp-label" htmlFor="bp-ad-title">Ad Title</label>
        <input
          id="bp-ad-title"
          className="bp-input"
          value={adTitle}
          onChange={(e) => setAdTitle(e.target.value)}
          maxLength={120}
          placeholder="Toyota Corolla 2020 – Ann Vann!"
          data-testid="booster-ad-title"
        />
        <label className="bp-label" htmlFor="bp-ad-desc" style={{ marginTop: 12 }}>Ad Description</label>
        <textarea
          id="bp-ad-desc"
          className="bp-textarea"
          value={adDescription}
          onChange={(e) => setAdDescription(e.target.value)}
          maxLength={500}
          placeholder="Dekri ofr ou a…"
          data-testid="booster-ad-desc"
        />
      </div>

      <div className="bp-actions">
        <button
          type="button"
          className="bp-btn bp-btn-primary bp-btn-block"
          onClick={next}
          data-testid="booster-next-audience"
        >
          Next: Audience →
        </button>
      </div>
    </BoosterLayout>
  );
}
