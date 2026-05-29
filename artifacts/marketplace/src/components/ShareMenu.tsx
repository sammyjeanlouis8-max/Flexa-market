import { Share2, Copy, Check, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

interface ShareMenuProps {
  listingId: number;
  title: string;
  price?: number;
  currency?: string | null;
  country?: string | null;
  city?: string | null;
  location?: string | null;
  description?: string | null;
  sellerName?: string | null;
}

export default function ShareMenu({
  listingId,
  title,
  price,
  currency,
  city,
  location,
  sellerName,
}: ShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const ogUrl = `${window.location.origin}/api/og/${listingId}`;
  const encodedUrl = encodeURIComponent(ogUrl);

  const priceStr = price != null
    ? (currency === "HTG"
      ? `${price.toLocaleString("fr-HT")} HTG`
      : `$${price.toLocaleString("en-US")} USD`)
    : null;

  const locationStr = city ?? location ?? null;
  const seller = sellerName ?? "FLEXA MARKET";

  const buildWhatsAppMessage = () => {
    const lines: string[] = [
      `Bonjou! Mwen enterese ak pwodwi sa sou FLEXA MARKET 👇`,
      ``,
      `🛍️ ${title}`,
      ...(priceStr ? [`💵 ${priceStr}`] : []),
      ...(locationStr ? [`📍 ${locationStr}`] : []),
      `🏪 ${seller}`,
      ``,
      `🔗 ${ogUrl}`,
      ``,
      `Èske pwodwi sa toujou disponib?`,
    ];
    return encodeURIComponent(lines.join("\n"));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(ogUrl);
      setCopied(true);
      toast({ title: t("share.copied") });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const shareWhatsApp = () =>
    window.open(`https://wa.me/?text=${buildWhatsAppMessage()}`, "_blank", "noopener,noreferrer");

  const shareFacebook = () =>
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, "_blank");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" data-testid="button-share">
          <Share2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={shareWhatsApp} className="gap-2 cursor-pointer text-[#25D366]" data-testid="share-whatsapp">
          <WhatsAppIcon />{t("share.whatsapp")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareFacebook} className="gap-2 cursor-pointer text-[#1877F2]" data-testid="share-facebook">
          <Facebook className="h-4 w-4" />{t("share.facebook")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={copyLink} className="gap-2 cursor-pointer" data-testid="share-copy-link">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          {copied ? t("share.copied") : t("share.copyLink")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
