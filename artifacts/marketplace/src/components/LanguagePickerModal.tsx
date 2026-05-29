import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setLanguage, type SupportedLanguage } from "@/i18n";
import { useMutation } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";

const LANGUAGES = [
  { code: "en" as const, flag: "🇺🇸", name: "English", sub: "Continue in English" },
  { code: "fr" as const, flag: "🇫🇷", name: "Français", sub: "Continuer en français" },
  { code: "ht" as const, flag: "🇭🇹", name: "Kreyòl Ayisyen", sub: "Kontinye an Kreyòl" },
];

interface Props {
  open: boolean;
  onDone: () => void;
}

export default function LanguagePickerModal({ open, onDone }: Props) {
  const { i18n } = useTranslation();
  const [selected, setSelected] = useState<SupportedLanguage>(
    (LANGUAGES.find(l => l.code === i18n.language)?.code) ?? "en"
  );

  const saveMut = useMutation({
    mutationFn: (lang: SupportedLanguage) =>
      apiPatch("/auth/language", { language: lang }).catch(() => {}),
    onSuccess: () => onDone(),
    onError: () => onDone(),
  });

  const handleConfirm = () => {
    setLanguage(selected);
    saveMut.mutate(selected);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm w-full p-0 overflow-hidden rounded-2xl [&>button:last-of-type]:hidden"
        onInteractOutside={e => e.preventDefault()}
      >
        <div className="bg-card">
          <DialogTitle className="sr-only">Choose your language</DialogTitle>
          <DialogDescription className="sr-only">Select the language for the app interface.</DialogDescription>
          {/* Header */}
          <div className="text-center px-6 pt-8 pb-4">
            <div className="text-4xl mb-3">🌐</div>
            <h2 className="text-xl font-bold text-foreground">Choose your language</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Choisissez votre langue · Chwazi lang ou
            </p>
          </div>

          {/* Language options */}
          <div className="px-4 pb-4 space-y-2">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setSelected(lang.code)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${
                  selected === lang.code
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent"
                }`}
                data-testid={`lang-pick-${lang.code}`}
              >
                <span className="text-3xl leading-none">{lang.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{lang.name}</p>
                  <p className="text-xs text-muted-foreground">{lang.sub}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  selected === lang.code ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}>
                  {selected === lang.code && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Confirm button */}
          <div className="px-4 pb-6">
            <Button
              className="w-full font-bold"
              onClick={handleConfirm}
              disabled={saveMut.isPending}
              data-testid="button-confirm-language"
            >
              {saveMut.isPending ? "..." : "Confirm · Confirmer · Konfime"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
