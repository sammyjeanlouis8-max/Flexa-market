import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingBag,
} from "lucide-react";
import type { Restaurant } from "@/lib/restaurantApi";
import {
  buildDirectionsHref,
  buildTelHref,
  buildWhatsAppHref,
  restaurantHasPublicLocation,
} from "@/lib/restaurantContact";
import { isRestaurantFavorite, toggleRestaurantFavorite } from "@/lib/restaurantFavorites";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

type Props = {
  restaurant: Restaurant;
  onReserve?: () => void;
  className?: string;
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function RestaurantContactBar({ restaurant, onReserve, className }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(() => isRestaurantFavorite(restaurant.id));
  const [msgBusy, setMsgBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telHref = restaurant.phone ? buildTelHref(restaurant.phone) : null;
  const waHref = restaurant.whatsapp
    ? buildWhatsAppHref(
        restaurant.whatsapp,
        t("restaurant.whatsappPrefill", {
          defaultValue: `Hello {{name}} — I found you on Flexa Restaurant.`,
          name: restaurant.name,
        }),
      )
    : null;
  const canDirections = restaurantHasPublicLocation(restaurant);
  const directionsHref = canDirections
    ? buildDirectionsHref({
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        label:
          restaurant.publicPickupAddress
          || (restaurant.businessType === "home_kitchen" ? null : restaurant.streetAddress)
          || `${restaurant.city}, ${restaurant.country}`,
      })
    : null;
  const showReserve = restaurant.acceptsReservations !== false;
  const open = restaurant.openNow ?? restaurant.isOpenNow;

  async function startMessage() {
    if (!user) {
      setLocation(`/login?next=${encodeURIComponent(`/restaurant/${restaurant.id}`)}`);
      return;
    }
    if (!restaurant.ownerId) {
      setError(t("restaurant.messageUnavailable", { defaultValue: "Messaging is unavailable for this business." }));
      return;
    }
    if (user.id === restaurant.ownerId) {
      setError(t("restaurant.cannotMessageSelf", { defaultValue: "You cannot message your own business." }));
      return;
    }
    setMsgBusy(true);
    setError(null);
    try {
      const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
      const res = await fetch(`/api/restaurants/${restaurant.id}/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not start chat");
      const convId = (data as { id?: number }).id;
      if (!convId) throw new Error("Could not start chat");
      setLocation(`/messages/${convId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setMsgBusy(false);
    }
  }

  const actions: Array<{
    key: string;
    label: string;
    icon: ReactNode;
    onClick?: () => void;
    href?: string;
    external?: boolean;
    hidden?: boolean;
    disabled?: boolean;
    active?: boolean;
  }> = [
    {
      key: "call",
      label: t("restaurant.call", { defaultValue: "Call" }),
      icon: <Phone className="h-5 w-5" />,
      href: telHref || undefined,
      external: true,
      hidden: !telHref,
    },
    {
      key: "message",
      label: t("restaurant.message", { defaultValue: "Message" }),
      icon: <MessageCircle className="h-5 w-5" />,
      onClick: () => void startMessage(),
      disabled: msgBusy,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <WhatsAppIcon className="h-5 w-5" />,
      href: waHref || undefined,
      external: true,
      hidden: !waHref,
    },
    {
      key: "directions",
      label: t("restaurant.directions", { defaultValue: "Directions" }),
      icon: <MapPin className="h-5 w-5" />,
      href: directionsHref || undefined,
      external: true,
      hidden: !directionsHref,
    },
    {
      key: "save",
      label: saved
        ? t("restaurant.saved", { defaultValue: "Saved" })
        : t("restaurant.save", { defaultValue: "Save" }),
      icon: <Heart className={cn("h-5 w-5", saved && "fill-[hsl(152,55%,28%)] text-[hsl(152,55%,28%)]")} />,
      onClick: () => setSaved(toggleRestaurantFavorite(restaurant.id).includes(restaurant.id)),
      active: saved,
    },
  ];

  const visible = actions.filter((a) => !a.hidden);

  return (
    <div className={cn("space-y-3", className)} data-testid="restaurant-contact-bar">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold",
            open ? "text-[hsl(152,55%,32%)]" : "text-muted-foreground",
          )}
          data-testid="restaurant-contact-status"
        >
          <span className={cn("h-2 w-2 rounded-full", open ? "bg-[hsl(152,55%,40%)]" : "bg-neutral-400")} />
          {open
            ? t("restaurant.openNow", { defaultValue: "Open" })
            : t("restaurant.closed", { defaultValue: "Closed" })}
        </span>
        <span className="text-muted-foreground">
          {t("restaurant.contactAlwaysAvailable", {
            defaultValue: "Contact actions stay available while closed.",
          })}
        </span>
      </div>

      <div className="flex flex-wrap justify-start gap-3 sm:gap-4">
        {visible.map((a) => {
          const circle =
            "flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(152,20%,94%)] text-[hsl(152,55%,22%)] shadow-sm transition hover:bg-[hsl(152,35%,88%)] disabled:opacity-50";
          const labelCls = "mt-1.5 block max-w-[4.5rem] text-center text-[11px] font-semibold text-[hsl(152,25%,20%)]";
          const wrap = "flex w-[4.5rem] flex-col items-center";
          if (a.href) {
            return (
              <a
                key={a.key}
                href={a.href}
                target={a.external ? "_blank" : undefined}
                rel={a.external ? "noopener noreferrer" : undefined}
                className={wrap}
                data-testid={`restaurant-contact-${a.key}`}
              >
                <span className={circle}>{a.icon}</span>
                <span className={labelCls}>{a.label}</span>
              </a>
            );
          }
          return (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className={wrap}
              data-testid={`restaurant-contact-${a.key}`}
            >
              <span className={circle}>{a.icon}</span>
              <span className={labelCls}>{a.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`#menu`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("restaurant-menu")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[hsl(152,55%,28%)] px-4 py-3.5 text-sm font-bold text-white shadow-sm"
          data-testid="restaurant-view-menu"
        >
          <ShoppingBag className="h-4 w-4" />
          {t("restaurant.viewMenuOrder", { defaultValue: "View Menu & Order" })}
        </Link>
        {showReserve ? (
          <button
            type="button"
            onClick={onReserve}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[hsl(152,40%,35%)] bg-white px-4 py-3.5 text-sm font-bold text-[hsl(152,55%,22%)]"
            data-testid="restaurant-reserve-table"
          >
            <CalendarClock className="h-4 w-4" />
            {t("restaurant.reserveTable", { defaultValue: "Reserve a Table" })}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
