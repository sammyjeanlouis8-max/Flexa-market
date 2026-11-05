/**
 * Local visual QA for Today's Deals card states (video vs no-video).
 * Not linked from production navigation.
 */
import BoostedDealCard, { type BoostedDealListing } from "@/components/BoostedDealCard";

const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1515377905703-c4788e73abca?w=800&q=80",
  "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80",
  "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80",
];

const base: Omit<BoostedDealListing, "id" | "boostVideoUrl" | "images" | "description"> = {
  title: "Multi-Head Body Massager – Deep Tissue Relief",
  price: 98.99,
  currency: "USD",
  location: "Carrefour",
  city: "Carrefour",
  country: "Haiti",
  isBoosted: true,
  category: "Boxing & Martial Arts",
  subcategory: "Boxing & Martial Arts",
  favoriteCount: 2,
  viewCount: 142,
};

const withVideo: BoostedDealListing = {
  ...base,
  id: 9001,
  images: SAMPLE_IMAGES,
  boostVideoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  description: [
    "Deep tissue massage for sore muscles.",
    "• Massage profond",
    "• Plusieurs têtes de massage",
    "• Rechargeable (sans fil)",
    "• Confortable et portable",
  ].join("\n"),
};

const withoutVideoMulti: BoostedDealListing = {
  ...base,
  id: 9002,
  images: SAMPLE_IMAGES,
  boostVideoUrl: null,
  description: [
    "Soulage les tensions musculaires en profondeur et améliore la circulation.",
    "• Massage profond",
    "• Plusieurs têtes de massage",
    "• Rechargeable (sans fil)",
    "• Confortable et portable",
  ].join("\n"),
};

const withoutVideoSingle: BoostedDealListing = {
  ...base,
  id: 9003,
  title: "Compact Wireless Massager With An Extra Long Title That Should Truncate Nicely",
  images: [SAMPLE_IMAGES[0]],
  boostVideoUrl: null,
  description: "Soulage les tensions musculaires en profondeur et améliore la circulation.",
};

const brokenVideo: BoostedDealListing = {
  ...base,
  id: 9004,
  images: SAMPLE_IMAGES.slice(0, 2),
  boostVideoUrl: "https://example.invalid/missing-video-404.mp4",
  description: [
    "Fallback after broken video.",
    "• Real feature one from seller",
    "• Real feature two from seller",
  ].join("\n"),
};

export default function BoostedDealPreview() {
  return (
    <div className="min-h-dvh bg-[#FBF6EC] p-3 space-y-6 pb-24" data-testid="boosted-deal-preview">
      <h1 className="text-lg font-bold">Boosted deal card preview</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-orange-700">A — With valid video</h2>
        <div className="rounded-2xl border border-orange-300/70 bg-[#FBF6EC] p-3 max-w-xl">
          <BoostedDealCard listing={withVideo} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-orange-700">B — No video, multiple images</h2>
        <div className="rounded-2xl border border-orange-300/70 bg-[#FBF6EC] p-3 max-w-xl">
          <BoostedDealCard listing={withoutVideoMulti} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-orange-700">C — No video, single image</h2>
        <div className="rounded-2xl border border-orange-300/70 bg-[#FBF6EC] p-3 max-w-xl">
          <BoostedDealCard listing={withoutVideoSingle} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-orange-700">D — Broken video → info fallback</h2>
        <div className="rounded-2xl border border-orange-300/70 bg-[#FBF6EC] p-3 max-w-xl">
          <BoostedDealCard listing={brokenVideo} />
        </div>
      </section>
    </div>
  );
}
