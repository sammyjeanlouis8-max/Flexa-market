import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth";
import { useCart } from "@/contexts/cart";
import { useToast } from "@/hooks/use-toast";
import { consumeAuthIntent } from "@/lib/authIntent";
import { spaNavigate } from "@/lib/spaNavigate";
import { useTranslation } from "react-i18next";

/**
 * After login/register, safely resume a stashed guest intent once.
 * Cart mutations stay client-local; checkout/messages still hit auth APIs.
 */
export default function AuthIntentResume() {
  const { user, isLoading } = useAuth();
  const { addItem, isInCart } = useCart();
  const { toast } = useToast();
  const { t } = useTranslation();
  const ran = useRef(false);

  useEffect(() => {
    if (isLoading || !user || ran.current) return;
    const intent = consumeAuthIntent();
    if (!intent) return;
    ran.current = true;

    if (intent.action === "addToCart" && intent.listingId && intent.title != null && intent.price != null && intent.sellerId != null) {
      if (intent.sellerId === user.id) {
        // Owner must never cart their own listing after login resume.
      } else if (!isInCart(intent.listingId)) {
        addItem({
          listingId: intent.listingId,
          title: intent.title,
          price: intent.price,
          currency: intent.currency ?? "USD",
          image: intent.image ?? null,
          country: intent.country ?? null,
          sellerId: intent.sellerId,
          quantity: intent.quantity ?? 1,
        });
        toast({
          title: t("listing.addedToCart", { defaultValue: "Added to cart" }),
          description: intent.title,
        });
      }
    }

    // Navigate back to product / conversation / checkout context
    if (intent.action === "buyNow" && intent.listingId) {
      spaNavigate(`/listings/${intent.listingId}?buy=1`, { replace: true });
      return;
    }
    if (intent.action === "contactSeller" && intent.listingId) {
      spaNavigate(`/listings/${intent.listingId}?contact=1`, { replace: true });
      return;
    }
    if (intent.action === "checkout") {
      spaNavigate("/cart?checkout=1", { replace: true });
      return;
    }
    if (intent.next && intent.next !== window.location.pathname + window.location.search) {
      spaNavigate(intent.next, { replace: true });
    }
  }, [user, isLoading, addItem, isInCart, toast, t]);

  return null;
}
