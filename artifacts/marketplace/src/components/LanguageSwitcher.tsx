import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES, PUBLIC_LANGUAGES, setLanguage, type SupportedLanguage } from "@/i18n";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  variant?: "icon" | "full";
  align?: "start" | "end";
  className?: string;
  /** Pass PUBLIC_LANGUAGES to restrict to EN/FR on auth pages */
  languages?: readonly { code: string; flag: string; name: string }[];
}

export default function LanguageSwitcher({
  variant = "icon",
  align = "end",
  className,
  languages = SUPPORTED_LANGUAGES,
}: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLang =
    (languages as readonly { code: string; flag: string; name: string }[]).find(l => l.code === i18n.language) ??
    languages[0];

  const { token } = useAuth();
  const handleChange = (code: SupportedLanguage) => {
    setLanguage(code);
    // Sync to server so push notifications use the new language immediately
    if (token) {
      void fetch("/api/auth/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: code }),
      }).catch(() => {});
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "icon" ? "icon" : "sm"}
          className={cn("gap-1.5", className)}
          data-testid="button-language-switcher"
          aria-label="Change language"
        >
          {variant === "icon" ? (
            <>
              <span className="text-base leading-none">{currentLang?.flag}</span>
              <span className="text-xs font-semibold hidden sm:inline text-muted-foreground uppercase">{currentLang?.code}</span>
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" />
              <span className="text-sm">{currentLang?.name}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48" data-testid="language-menu">
        {languages.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code as SupportedLanguage)}
            className={cn(
              "gap-3 cursor-pointer",
              i18n.language === lang.code && "bg-accent font-semibold"
            )}
            data-testid={`lang-option-${lang.code}`}
          >
            <span className="text-lg leading-none">{lang.flag}</span>
            <div>
              <p className="text-sm font-medium">{lang.name}</p>
            </div>
            {i18n.language === lang.code && (
              <span className="ml-auto text-primary text-xs font-bold">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
