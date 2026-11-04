import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function SuspendedScreen() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-sm px-5 py-7 flex flex-col items-center text-center">
        {/* Lock icon inside red circle with diagonal slash */}
        <div className="relative mb-4">
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <svg
              viewBox="0 0 64 64"
              className="w-11 h-11 text-red-600"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M44 28h-2v-6C42 16.49 37.51 12 32 12s-10 4.49-10 10v6h-2a4 4 0 0 0-4 4v20a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V32a4 4 0 0 0-4-4zm-14 14.73V46a2 2 0 0 0 4 0v-3.27A4 4 0 0 0 32 36a4 4 0 0 0-2 7.73zM38 28H26v-6a6 6 0 0 1 12 0v6z" />
            </svg>
          </div>
          {/* Diagonal red line overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div
              className="absolute w-[108%] h-[3px] bg-red-500 rounded-full"
              style={{ transform: "rotate(-45deg)", top: "50%", left: "-4%", marginTop: "-1.5px" }}
            />
          </div>
          {/* Red circle border */}
          <div
            className="absolute inset-0 rounded-full border-[3px] border-red-400"
            style={{ borderStyle: "solid" }}
          />
        </div>

        {/* Title */}
        <h1 className="text-xl font-extrabold text-foreground mb-2">
          {t("auth.accountSuspendedTitle", "Account Suspended")}
        </h1>

        {/* Red underline accent */}
        <div className="w-8 h-1 bg-red-500 rounded-full mb-4" />

        {/* Body text */}
        <p className="text-muted-foreground text-sm leading-relaxed mb-2">
          {t("auth.suspendedReason")}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed mb-5">
          {t("auth.suspendedContact")}
        </p>

        {/* Contact Support button */}
        <Link href="/contact" className="w-full max-w-xs">
          <button
            type="button"
            className="w-full min-h-10 rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm py-2.5 px-5 transition-colors"
          >
            {t("footer.contactSupport", "Contact Support")}
          </button>
        </Link>
      </div>
    </div>
  );
}
