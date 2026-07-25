import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Bot, MessageSquare, X } from "lucide-react";

const HIDE_PATHS = ["/chatbot", "/support", "/admin", "/auth", "/messages"];

export default function HelpButton() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  if (HIDE_PATHS.some(p => location.startsWith(p))) return null;

  return (
    <div className="fixed flex flex-col items-end gap-2" style={{ bottom: 86, right: 18, zIndex: 9999 }}>
      {open && (
        <div className="bg-card border border-border rounded-2xl shadow-xl p-2 flex flex-col gap-1 min-w-[190px] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-0.5">
            {t("help.howCanWeHelp")}
          </p>
          <Link href="/chatbot" onClick={() => setOpen(false)}>
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-left"
              data-testid="help-option-chatbot"
            >
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">FlexaBot</p>
                <p className="text-xs text-muted-foreground">{t("help.autoReply")}</p>
              </div>
            </button>
          </Link>
          <Link href="/support" onClick={() => setOpen(false)}>
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-left"
              data-testid="help-option-support"
            >
              <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{t("help.userSupport")}</p>
                <p className="text-xs text-muted-foreground">{t("help.humanAgent")}</p>
              </div>
            </button>
          </Link>
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-full transition-all active:scale-95 overflow-hidden"
        style={{
          height: 58,
          width: 58,
          background: open ? "rgba(15,23,42,0.85)" : "transparent",
          border: open ? "1px solid #334155" : "none",
          padding: open ? 10 : 0,
          boxShadow: open ? "none" : "0 4px 16px rgba(0,0,0,0.18)",
        }}
        aria-label={t("help.howCanWeHelp")}
        data-testid="help-button"
      >
        {open
          ? <X className="h-full w-full text-slate-400" />
          : <img
              src="/support-icon.png"
              alt={t("help.userSupport")}
              className="h-full w-full object-contain drop-shadow-md"
              draggable={false}
            />
        }
      </button>
    </div>
  );
}
