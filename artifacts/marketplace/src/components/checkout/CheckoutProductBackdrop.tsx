import { cn } from "@/lib/utils";

export type CheckoutBackdropItem = {
  id: string | number;
  title?: string | null;
  image?: string | null;
  price?: number | null;
};

/**
 * Dimmed product mosaic that fills the dark space behind the Buy Now
 * checkout card — related / nearby listings peek through the glass overlay.
 */
export function CheckoutProductBackdrop({
  items,
  className,
}: {
  items: CheckoutBackdropItem[];
  className?: string;
}) {
  const pool = items.filter((i) => i.image).slice(0, 18);
  // Repeat so the mosaic always fills the viewport even with few products.
  const tiles =
    pool.length === 0
      ? []
      : Array.from({ length: Math.max(18, pool.length) }, (_, i) => pool[i % pool.length]);

  if (tiles.length === 0) {
    return (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden",
          "bg-[radial-gradient(ellipse_at_20%_10%,rgba(47,107,255,0.22),transparent_45%),radial-gradient(ellipse_at_90%_20%,rgba(168,85,247,0.18),transparent_40%),#060b1a]",
          className,
        )}
      />
    );
  }

  return (
    <div
      aria-hidden
      data-testid="checkout-product-backdrop"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="absolute inset-0 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-2.5 p-2 sm:p-3 scale-[1.06] origin-center">
        {tiles.map((item, idx) => (
          <div
            key={`${item.id}-${idx}`}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B1228]/80",
              "shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
              idx % 5 === 0 && "row-span-2 min-h-[140px]",
              idx % 7 === 3 && "translate-y-3",
              idx % 4 === 1 && "-translate-y-2",
            )}
            style={{
              animation: `fm-checkout-float ${6 + (idx % 5)}s ease-in-out ${idx * 0.18}s infinite`,
            }}
          >
            <img
              src={item.image!}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060b1a]/90 via-[#060b1a]/25 to-transparent" />
            {(item.title || item.price != null) && (
              <div className="absolute inset-x-0 bottom-0 p-2">
                {item.title && (
                  <p className="text-[10px] font-semibold text-white/85 line-clamp-1 drop-shadow">{item.title}</p>
                )}
                {item.price != null && (
                  <p className="text-[10px] font-bold text-[#4C8DFF] drop-shadow">${Number(item.price).toFixed(2)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Readability veil — keeps products visible but never compete with the card */}
      <div className="absolute inset-0 bg-[#060b1a]/55 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_18%,rgba(6,11,26,0.72)_70%,rgba(6,11,26,0.92)_100%)]" />
    </div>
  );
}
