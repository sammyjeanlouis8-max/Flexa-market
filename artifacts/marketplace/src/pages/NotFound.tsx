import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  const [, nav] = useLocation();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Big 404 */}
        <div className="relative mb-8">
          <p className="text-[120px] font-black leading-none text-muted/20 select-none">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-orange-400/10 flex items-center justify-center border border-primary/20">
              <Search className="h-10 w-10 text-primary/60" />
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-black text-foreground mb-2">
          {t("notFound.title")}
        </h1>
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          {t("notFound.subtitle")}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? window.history.back() : nav("/")}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-border bg-card hover:bg-muted/60 transition-all text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("notFound.back")}
          </button>
          <button
            type="button"
            onClick={() => nav("/")}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-bold"
          >
            <Home className="h-4 w-4" />
            {t("notFound.home")}
          </button>
        </div>

        {/* Branding */}
        <p className="mt-10 text-xs text-muted-foreground/50 font-medium tracking-wider uppercase">
          FLEXA MARKET
        </p>
      </div>
    </div>
  );
}
