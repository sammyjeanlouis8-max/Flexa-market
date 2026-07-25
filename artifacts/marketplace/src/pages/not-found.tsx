import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
      <div>
        <p className="text-8xl font-black text-primary">404</p>
        <h1 className="text-2xl font-bold text-foreground mt-4">{t("errors.notFound")}</h1>
        <p className="text-muted-foreground mt-2">{t("errors.notFoundDesc")}</p>
        <Button className="mt-6" onClick={() => setLocation("/")} data-testid="button-go-home">
          <Home className="h-4 w-4 mr-2" /> {t("errors.goHome")}
        </Button>
      </div>
    </div>
  );
}
