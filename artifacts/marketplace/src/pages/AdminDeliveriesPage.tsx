import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import AdminDeliveryPanel from "@/components/AdminDeliveryPanel";
import { useAuth } from "@/contexts/auth";

export default function AdminDeliveriesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "super_admin" && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="p-2 rounded-xl hover:bg-accent transition-colors text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900/40">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-foreground">
                {t("adminBanner.deliveriesHubTitle")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("adminBanner.deliveriesHubDesc")}
              </p>
            </div>
          </div>
        </div>

        <AdminDeliveryPanel />
      </div>
    </div>
  );
}
