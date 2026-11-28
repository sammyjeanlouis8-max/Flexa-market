import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Car,
  Eye,
  Flower2,
  Gem,
  Heart,
  Paintbrush,
  Scissors,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Scissors> = {
  scissors: Scissors,
  barber: Scissors,
  nail: Gem,
  makeup: Paintbrush,
  braids: Sparkles,
  spa: Flower2,
  lashes: Eye,
  skin: Flower2,
  wig: UserRound,
  bridal: Heart,
  wax: Sparkles,
  mobile: Car,
};

export function BeautyCategoryCard({
  href,
  labelKey,
  fallback,
  photo,
  icon = "scissors",
  className,
}: {
  href: string;
  labelKey: string;
  fallback: string;
  photo: string;
  icon?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = ICONS[icon] || Scissors;
  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-2xl bg-[hsl(350,25%,94%)] shadow-[0_6px_16px_rgba(40,20,30,0.08)]",
        className,
      )}
      data-testid={`beauty-category-${href.replace(/\W+/g, "-")}`}
    >
      <div className="relative aspect-[5/4] w-full overflow-hidden">
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
        {/* Soft bottom fade only — no heavy dark overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-2.5 flex justify-center px-2">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[hsl(350,45%,28%)] shadow-sm backdrop-blur-sm sm:text-xs">
            <Icon className="h-3 w-3 shrink-0 text-[hsl(350,45%,38%)]" aria-hidden />
            <span className="truncate">{t(labelKey, { defaultValue: fallback })}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default BeautyCategoryCard;
