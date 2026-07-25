import { useEffect, useState } from "react";
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
import { Globe, Menu, Moon, Sun } from "lucide-react";
import { PUBLIC_LANGUAGES, setLanguage, type SupportedLanguage } from "@/i18n";

/**
 * Compact dropdown for guests (non-authenticated visitors). Tucks the
 * language picker and the dark/light toggle behind a single icon so the
 * top-right header stays clean. Signed-in users get the same options
 * inside their UserMenu instead.
 */
export default function GuestMenu() {
  const { i18n, t } = useTranslation();
  const currentLang = PUBLIC_LANGUAGES.find(l => l.code === i18n.language) ?? PUBLIC_LANGUAGES[0];

  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("guestMenu.label", { defaultValue: "More options" })}
          data-testid="button-guest-menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" data-testid="guest-menu">
        <DropdownMenuLabel className="font-normal text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Globe className="h-3 w-3" />
          {t("userMenu.language", { defaultValue: "Lang" })} · {currentLang.flag} {currentLang.name}
        </DropdownMenuLabel>
        {PUBLIC_LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={(e) => { e.preventDefault(); setLanguage(lang.code as SupportedLanguage); }}
            className={`gap-2 cursor-pointer ${i18n.language === lang.code ? "bg-accent font-semibold" : ""}`}
            data-testid={`guest-menu-lang-${lang.code}`}
          >
            <span className="text-base leading-none">{lang.flag}</span>
            <span className="text-sm">{lang.name}</span>
            {i18n.language === lang.code && <span className="ml-auto text-primary text-xs font-bold">✓</span>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={(e) => { e.preventDefault(); setDark(d => !d); }}
          className="gap-2 cursor-pointer"
          data-testid="guest-menu-theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="text-sm">
            {dark
              ? t("guestMenu.lightMode", { defaultValue: "Light mode" })
              : t("guestMenu.darkMode", { defaultValue: "Dark mode" })}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
