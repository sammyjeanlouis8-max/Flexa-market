import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function BeautyCategoryCard({
  href,
  labelKey,
  fallback,
  photo,
  className,
}: {
  href: string;
  labelKey: string;
  fallback: string;
  photo: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-[hsl(350,20%,88%)] shadow-[0_8px_20px_rgba(40,20,30,0.08)]",
        className,
      )}
      data-testid={`beauty-category-${href.replace(/\W+/g, "-")}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[hsl(350,25%,92%)]">
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(350,18%,12%)]/85 via-[hsl(350,18%,12%)]/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <h3 className="text-base font-extrabold tracking-tight text-white sm:text-lg">
            {t(labelKey, { defaultValue: fallback })}
          </h3>
        </div>
      </div>
    </Link>
  );
}

export default BeautyCategoryCard;
