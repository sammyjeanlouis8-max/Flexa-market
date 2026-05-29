import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Sun, Moon, Monitor, Globe, Check } from "lucide-react";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "@/i18n";

type ThemeChoice = "light" | "dark" | "system";

/**
 * Reads the user's current theme preference from localStorage. Falls
 * back to "system" so the OS preference drives the look on first load.
 * Note: must mirror the storage key used by the existing ThemeToggle in
 * Layout.tsx to avoid two competing sources of truth.
 */
function readTheme(): ThemeChoice {
  const v = localStorage.getItem("theme");
  if (v === "light" || v === "dark" || v === "system") return v;
  // Backward compatibility: if Layout's old toggle wrote "dark" or "light".
  return v === "dark" ? "dark" : "system";
}

/**
 * Apply a theme to the document root. "system" defers to
 * prefers-color-scheme so the page tracks the OS in real time.
 */
function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  root.classList.remove("dark");
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "system") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) root.classList.add("dark");
  }
  localStorage.setItem("theme", theme);
}

/**
 * Preferences page — non-destructive UI/locale settings. Theme picker
 * (light/dark/system) and language picker live here so the user can
 * tune the look-and-feel without touching anything risky.
 */
export default function SettingsPreferences() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const [theme, setTheme] = useState<ThemeChoice>(() => readTheme());

  // Re-apply on mount so the toggle and the picker stay in sync.
  useEffect(() => { applyTheme(theme); }, [theme]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const themes: { value: ThemeChoice; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "light", label: t("settings.themeLight"), icon: Sun },
    { value: "dark", label: t("settings.themeDark"), icon: Moon },
    { value: "system", label: t("settings.themeSystem"), icon: Monitor },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <button
        onClick={() => setLocation("/settings")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back-settings"
      >
        <ChevronLeft className="h-4 w-4" /> {t("settings.backToSettings")}
      </button>

      <h1 className="text-2xl font-bold">{t("settings.preferences")}</h1>

      {/* Theme picker */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">
          {t("settings.theme")}
        </h2>
        <Card className="p-2 grid grid-cols-3 gap-2">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                theme === value ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"
              }`}
              data-testid={`theme-${value}`}
            >
              <Icon className={`h-6 w-6 ${theme === value ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium ${theme === value ? "text-primary" : ""}`}>{label}</span>
            </button>
          ))}
        </Card>
      </div>

      {/* Language picker */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2 flex items-center gap-1">
          <Globe className="h-3 w-3" /> {t("settings.language")}
        </h2>
        <Card className="overflow-hidden divide-y divide-border">
          {SUPPORTED_LANGUAGES.map(lang => {
            const active = i18n.language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code as SupportedLanguage)}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left"
                data-testid={`language-${lang.code}`}
              >
                <span className="text-2xl">{lang.flag}</span>
                <span className="flex-1 font-medium">{lang.name}</span>
                {active && <Check className="h-5 w-5 text-primary" />}
              </button>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
