import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Sun, Moon, Monitor, Globe, Check, Type, Gauge, Wifi, Play,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { persistLanguage } from "@/lib/persistLanguage";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type ThemeChoice = "light" | "dark" | "system";
type TextSize = "normal" | "large" | "xlarge";

function readTheme(): ThemeChoice {
  const v = localStorage.getItem("theme");
  if (v === "light" || v === "dark" || v === "system") return v;
  return v === "dark" ? "dark" : "system";
}

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

function applyTextSize(size: TextSize) {
  const root = document.documentElement;
  root.dataset.textSize = size;
  const scale = size === "xlarge" ? "112.5%" : size === "large" ? "106.25%" : "100%";
  root.style.fontSize = scale;
  localStorage.setItem("fm_text_size", size);
}

function applyReducedMotion(on: boolean) {
  document.documentElement.dataset.reducedMotion = on ? "1" : "0";
  localStorage.setItem("fm_reduced_motion", on ? "1" : "0");
}

function applyDataSaver(on: boolean) {
  localStorage.setItem("fm_data_saver", on ? "1" : "0");
}

function applyVideoAutoplay(on: boolean) {
  localStorage.setItem("fm_video_autoplay", on ? "1" : "0");
}

export default function SettingsPreferences() {
  const { user, token } = useAuth();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<ThemeChoice>(() => readTheme());
  const [textSize, setTextSize] = useState<TextSize>(() => {
    const v = localStorage.getItem("fm_text_size");
    return v === "large" || v === "xlarge" ? v : "normal";
  });
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("fm_reduced_motion") === "1");
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem("fm_data_saver") === "1");
  const [videoAutoplay, setVideoAutoplay] = useState(() => localStorage.getItem("fm_video_autoplay") !== "0");

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyTextSize(textSize); }, [textSize]);

  const handleLanguageChange = async (code: SupportedLanguage) => {
    await persistLanguage(code, token);
    queryClient.invalidateQueries({ queryKey: ["getMe"] });
  };

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

  const textSizes: { value: TextSize; label: string }[] = [
    { value: "normal", label: t("accountCenter.textNormal") },
    { value: "large", label: t("accountCenter.textLarge") },
    { value: "xlarge", label: t("accountCenter.textXLarge") },
  ];

  const saveToggle = (apply: (on: boolean) => void, set: (on: boolean) => void, on: boolean) => {
    set(on);
    apply(on);
    toast({ title: t("settings.preferenceSaved") });
  };

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("settings.backToSettings")}
          data-testid="button-back-settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{t("accountCenter.appearance")}</h1>
          <p className="text-xs text-muted-foreground">{t("accountCenter.appearanceSub")}</p>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          {t("settings.theme")}
        </h2>
        <Card className="p-2 grid grid-cols-3 gap-2 rounded-2xl">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all min-h-11 ${
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

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1 flex items-center gap-1">
          <Type className="h-3 w-3" /> {t("accountCenter.textSize")}
        </h2>
        <Card className="p-2 grid grid-cols-3 gap-2 rounded-2xl">
          {textSizes.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTextSize(value);
                toast({ title: t("settings.preferenceSaved") });
              }}
              className={`p-3 rounded-xl border-2 text-xs font-semibold min-h-11 ${
                textSize === value ? "border-primary bg-primary/5 text-primary" : "border-transparent hover:bg-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </Card>
      </div>

      <Card className="rounded-2xl divide-y divide-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 flex items-center justify-center">
            <Gauge className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("accountCenter.reducedMotion")}</p>
            <p className="text-xs text-muted-foreground">{t("accountCenter.reducedMotionSub")}</p>
          </div>
          <Switch
            checked={reducedMotion}
            onCheckedChange={(on) => saveToggle(applyReducedMotion, setReducedMotion, on)}
            aria-label={t("accountCenter.reducedMotion")}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 flex items-center justify-center">
            <Wifi className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("accountCenter.dataSaver")}</p>
            <p className="text-xs text-muted-foreground">{t("accountCenter.dataSaverSub")}</p>
          </div>
          <Switch
            checked={dataSaver}
            onCheckedChange={(on) => saveToggle(applyDataSaver, setDataSaver, on)}
            aria-label={t("accountCenter.dataSaver")}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 flex items-center justify-center">
            <Play className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("accountCenter.videoAutoplay")}</p>
            <p className="text-xs text-muted-foreground">{t("accountCenter.videoAutoplaySub")}</p>
          </div>
          <Switch
            checked={videoAutoplay}
            onCheckedChange={(on) => saveToggle(applyVideoAutoplay, setVideoAutoplay, on)}
            aria-label={t("accountCenter.videoAutoplay")}
          />
        </div>
      </Card>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1 flex items-center gap-1">
          <Globe className="h-3 w-3" /> {t("settings.language")}
        </h2>
        <Card className="overflow-hidden divide-y divide-border rounded-2xl">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = i18n.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => { void handleLanguageChange(lang.code as SupportedLanguage); }}
                className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left min-h-11"
                data-testid={`language-${lang.code}`}
              >
                <span className="text-2xl" aria-hidden>{lang.flag}</span>
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
