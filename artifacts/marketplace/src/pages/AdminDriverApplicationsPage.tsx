import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import AdminApplicationsPanel from "@/pages/AdminApplicationsPanel";
import { useAuth } from "@/contexts/auth";

export default function AdminDriverApplicationsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "super_admin" && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, navigate]);

  const scopeLock = null; // resolved server-side from admin JWT scope

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="p-2 rounded-xl hover:bg-accent transition-colors text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-sm shadow-orange-200 dark:shadow-orange-900/40">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-foreground">{t("adminBanner.driverPageTitle")}</h1>
              <p className="text-xs text-muted-foreground">{t("adminBanner.driverPageSubtitle")}</p>
            </div>
          </div>
        </div>

        <AdminApplicationsPanel type="driver" scopeLock={scopeLock} />
      </div>
    </div>
  );
}
