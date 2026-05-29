import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/auth";
import {
  User as UserIcon,
  Settings as SettingsIcon,
  LogOut,
  Heart,
  Package,
  ShoppingBag,
  Tag,
  Shield,
  HelpCircle,
  Globe,
  Sparkles,
  Landmark,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";

/**
 * Avatar dropdown for the header. Shows the signed-in user's name +
 * email at the top, then a stack of common destinations (profile,
 * listings, saved, orders, sales) and a Settings link that fans out to
 * the dedicated Settings hub. Admins also get a quick link to /admin.
 *
 * Renders nothing for guests — the existing "Sign in" button in the
 * Layout header is shown instead.
 */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  const saveLangMut = useMutation({
    mutationFn: (lang: SupportedLanguage) => apiPatch("/auth/language", { language: lang }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["getMe"] });
    },
  });

  const handleLangChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
    saveLangMut.mutate(lang);
  };

  if (!user) return null;

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const menuItems: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    to: string;
    testid: string;
  }> = [
    { icon: UserIcon, label: t("userMenu.profile"), to: `/profile/${user.id}`, testid: "menu-profile" },
    { icon: Tag, label: t("userMenu.myListings"), to: `/profile/${user.id}`, testid: "menu-listings" },
    { icon: Heart, label: t("userMenu.saved"), to: "/saved", testid: "menu-saved" },
    { icon: ShoppingBag, label: t("userMenu.orders"), to: "/orders", testid: "menu-orders" },
    { icon: Package, label: t("userMenu.sales"), to: "/sales", testid: "menu-sales" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
            <AvatarFallback className="text-xs">{user.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" data-testid="user-menu">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold leading-none truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {menuItems.map(({ icon: Icon, label, to, testid }) => (
          <DropdownMenuItem key={testid} asChild>
            <Link href={to}>
              <span className="flex items-center gap-2 cursor-pointer w-full" data-testid={testid}>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{label}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {user && (
          <DropdownMenuItem asChild>
            <Link href="/loans">
              <span
                className="flex items-center gap-2 cursor-pointer w-full px-1 py-0.5 rounded-lg"
                style={{
                  background: "linear-gradient(135deg, #7c3aed18 0%, #4f46e510 100%)",
                }}
                data-testid="menu-loan"
              >
                <div
                  className="flex items-center justify-center h-5 w-5 rounded-md shrink-0"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                >
                  <Landmark className="h-3 w-3 text-white" />
                </div>
                <span className="font-semibold" style={{ color: "#a78bfa" }}>{t("nav.loanApply")}</span>
                <span
                  className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                  style={{ background: "linear-gradient(90deg,#7c3aed,#4f46e5)", color: "#fff" }}
                >
                  NEW
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <span className="flex items-center gap-2 cursor-pointer w-full" data-testid="menu-settings">
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t("userMenu.settings")}</span>
            </span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings/help">
            <span className="flex items-center gap-2 cursor-pointer w-full" data-testid="menu-help">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              <span>{t("userMenu.help")}</span>
            </span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Language picker — every supported language is listed inline so
            users can switch in one tap without navigating to /settings.
            Persisted via setLanguage() (writes to localStorage + i18n). */}
        <DropdownMenuLabel className="font-normal text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pt-2">
          <Globe className="h-3 w-3" />
          {t("userMenu.language", { defaultValue: "Lang" })} · {currentLang.flag} {currentLang.name}
        </DropdownMenuLabel>
        {SUPPORTED_LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={(e) => { e.preventDefault(); handleLangChange(lang.code as SupportedLanguage); }}
            className={`gap-2 cursor-pointer ${i18n.language === lang.code ? "bg-accent font-semibold" : ""}`}
            data-testid={`menu-lang-${lang.code}`}
          >
            <span className="text-base leading-none">{lang.flag}</span>
            <span className="text-sm">{lang.name}</span>
            {i18n.language === lang.code && <span className="ml-auto text-primary text-xs font-bold">✓</span>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/chatbot">
            <span className="flex items-center gap-2 cursor-pointer w-full" data-testid="menu-chatbot">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">{t("userMenu.chatbot", { defaultValue: "FlexaBot" })}</span>
            </span>
          </Link>
        </DropdownMenuItem>

        {(user.isAdmin || user.isSuperAdmin || (user.role && user.role !== "user")) && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <span className="flex items-center gap-2 cursor-pointer w-full text-primary" data-testid="menu-admin">
                <Shield className="h-4 w-4" />
                <span className="font-semibold">{t("userMenu.admin")}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30 cursor-pointer"
          data-testid="menu-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          <span className="font-medium">{t("userMenu.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
