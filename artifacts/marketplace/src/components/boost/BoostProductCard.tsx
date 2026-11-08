import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/currency";
import { listingImageProps } from "@/lib/listingImage";

type ListingLike = {
  title: string;
  price: number;
  currency?: string | null;
  country?: string | null;
  images?: string[] | null;
  description?: string | null;
};

export function BoostProductCard({ listing }: { listing: ListingLike }) {
  const { t } = useTranslation();
  const img = listing.images?.find((i) => i && i.trim()) ?? null;
  return (
    <div className="fb-product-card" data-testid="boost-product-card">
      <div className="fb-product-thumb">
        {img ? (
          <img src={img} alt={listing.title} {...listingImageProps({ variant: "card" })} />
        ) : (
          <div className="fb-product-thumb-empty">{t("boost.noImage", { defaultValue: "No image" })}</div>
        )}
      </div>
      <div className="fb-product-meta">
        <p className="fb-product-title">{listing.title}</p>
        <p className="fb-product-price">
          {formatPrice(listing.price, listing.country, listing.currency ?? "USD")}
        </p>
        {listing.description ? (
          <p className="fb-product-desc">{listing.description.slice(0, 110)}{listing.description.length > 110 ? "…" : ""}</p>
        ) : null}
      </div>
    </div>
  );
}
