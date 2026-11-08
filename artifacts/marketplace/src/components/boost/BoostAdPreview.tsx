import { ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/currency";
import { listingImageProps } from "@/lib/listingImage";
import { AdaptiveVideoPlayer } from "@/components/media/AdaptiveVideoPlayer";

type Props = {
  title: string;
  price: number;
  currency?: string | null;
  country?: string | null;
  description?: string | null;
  images?: string[] | null;
  videoUrl?: string | null;
  sellerName?: string | null;
  ctaLabel?: string | null;
  hideCta?: boolean;
  hideProduct?: boolean;
};

export function BoostAdPreview({
  title, price, currency, country, description, images, videoUrl, sellerName,
  ctaLabel, hideCta, hideProduct,
}: Props) {
  const { t } = useTranslation();
  const img = images?.find((i) => i && i.trim()) ?? null;
  const img2 = images?.filter((i) => i && i.trim())[1] ?? null;

  return (
    <div className="fb-ad-preview" data-testid="boost-ad-preview">
      <div className="fb-ad-preview-head">
        <span className="fb-sponsored">{t("boost.sponsored", { defaultValue: "Sponsored" })}</span>
        {sellerName ? <span className="fb-ad-seller">{sellerName}</span> : null}
      </div>

      <div className="fb-ad-media">
        {videoUrl ? (
          <AdaptiveVideoPlayer
            src={videoUrl}
            poster={img}
            maxHeight={360}
            muted
            controls={false}
            className="rounded-none"
          />
        ) : (
          <div className={img2 ? "fb-ad-images dual" : "fb-ad-images"}>
            {img ? (
              <img src={img} alt={title} {...listingImageProps({ variant: "card" })} />
            ) : (
              <div className="fb-product-thumb-empty">{t("boost.noImage", { defaultValue: "No image" })}</div>
            )}
            {img2 ? <img src={img2} alt="" {...listingImageProps({ variant: "card" })} /> : null}
          </div>
        )}
      </div>

      {!hideProduct && (
        <div className="fb-ad-body">
          <p className="fb-ad-title">{title || "—"}</p>
          {price > 0 && (
            <p className="fb-ad-price">{formatPrice(price, country, currency ?? "USD")}</p>
          )}
          {description ? (
            <p className="fb-ad-desc">{description.slice(0, 90)}{description.length > 90 ? "…" : ""}</p>
          ) : null}
          {!hideCta && (
            <button type="button" className="fb-ad-cta" tabIndex={-1}>
              <ShoppingCart className="h-3.5 w-3.5" />
              {ctaLabel || t("cart.addToCart", { defaultValue: "Add to Cart" })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
