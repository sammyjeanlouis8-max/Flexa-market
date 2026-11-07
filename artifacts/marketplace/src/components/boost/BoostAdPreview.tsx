import { useRef, useState } from "react";
import { Play, Pause, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/currency";
import { listingImageProps } from "@/lib/listingImage";

type Props = {
  title: string;
  price: number;
  currency?: string | null;
  country?: string | null;
  description?: string | null;
  images?: string[] | null;
  videoUrl?: string | null;
  sellerName?: string | null;
};

export function BoostAdPreview({
  title, price, currency, country, description, images, videoUrl, sellerName,
}: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const img = images?.find((i) => i && i.trim()) ?? null;
  const img2 = images?.filter((i) => i && i.trim())[1] ?? null;

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="fb-ad-preview" data-testid="boost-ad-preview">
      <div className="fb-ad-preview-head">
        <span className="fb-sponsored">{t("boost.sponsored", { defaultValue: "Sponsored" })}</span>
        {sellerName ? <span className="fb-ad-seller">{sellerName}</span> : null}
      </div>

      <div className="fb-ad-media">
        {videoUrl ? (
          <div className="fb-ad-video-wrap">
            <video
              ref={videoRef}
              src={videoUrl}
              playsInline
              poster={img ?? undefined}
              className="fb-ad-video"
              onEnded={() => setPlaying(false)}
            />
            <button type="button" className="fb-ad-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
            </button>
          </div>
        ) : (
          <div className={img2 ? "fb-ad-images dual" : "fb-ad-images"}>
            {img ? (
              <img src={img} alt={title} {...listingImageProps({ variant: "card" })} />
            ) : (
              <div className="fb-product-thumb-empty">No image</div>
            )}
            {img2 ? <img src={img2} alt="" {...listingImageProps({ variant: "card" })} /> : null}
          </div>
        )}
      </div>

      <div className="fb-ad-body">
        <p className="fb-ad-title">{title || "—"}</p>
        <p className="fb-ad-price">{formatPrice(price, country, currency ?? "USD")}</p>
        {description ? (
          <p className="fb-ad-desc">{description.slice(0, 90)}{description.length > 90 ? "…" : ""}</p>
        ) : null}
        <button type="button" className="fb-ad-cta" tabIndex={-1}>
          <ShoppingCart className="h-3.5 w-3.5" />
          {t("cart.addToCart", { defaultValue: "Add to Cart" })}
        </button>
      </div>
    </div>
  );
}
