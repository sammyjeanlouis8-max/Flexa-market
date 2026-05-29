import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { MobileSelect } from "@/components/ui/mobile-select";
import { ChevronLeft, KeyRound, Mail, Trash2, AlertTriangle, Phone, ShieldQuestion, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Account & security page. Three actions live here, each behind its
 * own confirmation form: change password, change email, and delete
 * account. Every destructive action requires the current password as a
 * second factor — the API enforces this too, so the UI just mirrors
 * the same gate for fast feedback.
 */
export default function SettingsSecurity() {
  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [showPwd, setShowPwd] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showSecurityQ, setShowSecurityQ] = useState(false);
  const [hasSecurityQ, setHasSecurityQ] = useState<boolean | null>(null);

  useEffect(() => {
    const tk = localStorage.getItem("flexamarket_token");
    if (!tk) return;
    fetch("/api/recovery/has-questions", { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => r.json())
      .then(d => setHasSecurityQ(d.hasQuestions ?? false))
      .catch(() => setHasSecurityQ(false));
  }, [showSecurityQ]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-24">
      <button
        onClick={() => setLocation("/settings")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back-settings"
      >
        <ChevronLeft className="h-4 w-4" /> {t("settings.backToSettings")}
      </button>

      <h1 className="text-2xl font-bold">{t("settings.security")}</h1>
      <p className="text-sm text-muted-foreground">{t("settings.securityIntro")}</p>

      <Card className="overflow-hidden divide-y divide-border">
        <SecurityRow
          icon={KeyRound}
          label={t("settings.changePassword")}
          value={t("settings.passwordHidden")}
          onClick={() => setShowPwd(true)}
          testid="row-change-password"
        />
        <SecurityRow
          icon={Mail}
          label={t("settings.changeEmail")}
          value={user.email}
          onClick={() => setShowEmail(true)}
          testid="row-change-email"
        />
        <SecurityRow
          icon={Phone}
          label={t("settings.changePhone")}
          value={user.phone ?? "—"}
          onClick={() => setLocation("/profile/edit")}
          testid="row-change-phone"
        />
        <SecurityRow
          icon={ShieldQuestion}
          label={t("recovery.securityQuestions")}
          value={hasSecurityQ === null ? "…" : hasSecurityQ ? t("recovery.configured") : t("recovery.notConfigured")}
          badge={hasSecurityQ === true ? "green" : hasSecurityQ === false ? "amber" : undefined}
          onClick={() => setShowSecurityQ(true)}
          testid="row-security-questions"
        />
      </Card>

      <Card className="overflow-hidden border-red-200 dark:border-red-900">
        <button
          onClick={() => setShowDelete(true)}
          className="w-full flex items-center gap-3 p-4 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
          data-testid="row-delete-account"
        >
          <div className="bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg p-2">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{t("settings.deleteAccount")}</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/90">{t("settings.deleteAccountSub")}</p>
          </div>
        </button>
      </Card>

      {showPwd && <ChangePasswordDialog onClose={() => setShowPwd(false)} />}
      {showEmail && (
        <ChangeEmailDialog
          currentEmail={user.email}
          onClose={() => setShowEmail(false)}
          onChanged={() => { refreshUser(); setShowEmail(false); }}
        />
      )}
      {showDelete && (
        <DeleteAccountDialog
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            toast({ title: t("settings.accountDeleted") });
            logout();
            setLocation("/");
          }}
        />
      )}
      {showSecurityQ && (
        <SecurityQuestionsDialog
          onClose={() => setShowSecurityQ(false)}
          onSaved={() => setShowSecurityQ(false)}
        />
      )}
    </div>
  );
}

function SecurityRow({
  icon: Icon,
  label,
  value,
  onClick,
  testid,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onClick: () => void;
  testid?: string;
  badge?: "green" | "amber";
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left" data-testid={testid}>
      <div className="bg-primary/10 text-primary rounded-lg p-2">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className={`text-xs truncate ${badge === "green" ? "text-green-600 dark:text-green-400" : badge === "amber" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{value}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

interface SecurityQuestion { key: string; text: string; }

function SecurityQuestionsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [questionsList, setQuestionsList] = useState<SecurityQuestion[]>([]);
  const [sq1Key, setSq1Key] = useState("__none__");
  const [sq1Answer, setSq1Answer] = useState("");
  const [sq2Key, setSq2Key] = useState("__none__");
  const [sq2Answer, setSq2Answer] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/recovery/questions-list")
      .then(r => r.json())
      .then(d => setQuestionsList(d.questions ?? []))
      .catch(() => {});
    const tk = localStorage.getItem("flexamarket_token");
    if (!tk) return;
    fetch("/api/recovery/my-questions", { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => r.json())
      .then(d => {
        const qs: SecurityQuestion[] = d.questions ?? [];
        if (qs[0]) { setSq1Key(qs[0].key); }
        if (qs[1]) { setSq2Key(qs[1].key); }
      })
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (sq1Key === "__none__" || sq2Key === "__none__" || !sq1Answer.trim() || !sq2Answer.trim()) {
      toast({ title: t("recovery.questionsSetupHint"), variant: "destructive" });
      return;
    }
    if (sq1Key === sq2Key) {
      toast({ title: t("recovery.differentQuestions"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/recovery/setup-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ questions: [{ key: sq1Key, answer: sq1Answer.trim() }, { key: sq2Key, answer: sq2Answer.trim() }] }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" }); return; }
      toast({ title: t("recovery.questionsSaved") });
      onSaved();
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const q1Options = questionsList.filter(q => q.key !== sq2Key);
  const q2Options = questionsList.filter(q => q.key !== sq1Key);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recovery.securityQuestions")}</DialogTitle>
          <DialogDescription>{t("recovery.questionsSetupHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {[{ key: sq1Key, setKey: setSq1Key, answer: sq1Answer, setAnswer: setSq1Answer, options: q1Options, num: 1 },
            { key: sq2Key, setKey: setSq2Key, answer: sq2Answer, setAnswer: setSq2Answer, options: q2Options, num: 2 }
          ].map(({ key, setKey, answer, setAnswer, options, num }) => (
            <div key={num} className="space-y-1.5">
              <Label>{t("recovery.questionLabel", { num })}</Label>
              <MobileSelect
                value={key}
                onValueChange={setKey}
                placeholder={t("recovery.selectQuestion")}
                options={options.map(q => ({ value: q.key, label: q.text.split(" / ")[0] }))}
              />
              {key !== "__none__" && (
                <Input
                  placeholder={t("recovery.answerPlaceholder")}
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  autoComplete="off"
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("buttons.cancel")}</Button>
          <Button
            onClick={submit}
            disabled={busy || sq1Key === "__none__" || sq2Key === "__none__" || !sq1Answer.trim() || !sq2Answer.trim()}
          >
            {busy ? t("auth.saving") : t("recovery.saveQuestions")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { dismissPasswordUpgrade } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next !== confirm) { toast({ title: t("settings.passwordMismatch"), variant: "destructive" }); return; }
    if (next.length < 6) { toast({ title: t("settings.passwordTooShort"), variant: "destructive" }); return; }
    setBusy(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? t("settings.requestFailed"), variant: "destructive" }); return; }
      toast({ title: t("settings.passwordChanged") });
      dismissPasswordUpgrade();
      onClose();
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.changePassword")}</DialogTitle>
          <DialogDescription>{t("settings.changePasswordDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cur">{t("settings.currentPassword")}</Label>
            <PasswordInput id="cur" value={current} onChange={e => setCurrent(e.target.value)} data-testid="input-current-password" autoComplete="current-password" />
          </div>
          <div>
            <Label htmlFor="new">{t("settings.newPassword")}</Label>
            <PasswordInput id="new" value={next} onChange={e => setNext(e.target.value)} data-testid="input-new-password" autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="conf">{t("settings.confirmPassword")}</Label>
            <PasswordInput id="conf" value={confirm} onChange={e => setConfirm(e.target.value)} data-testid="input-confirm-password" autoComplete="new-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("buttons.cancel")}</Button>
          <Button onClick={submit} disabled={busy || !current || !next || !confirm} data-testid="button-submit-change-password">
            {busy ? t("buttons.sending") : t("buttons.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeEmailDialog({ currentEmail, onClose, onChanged }: { currentEmail: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ password, newEmail }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? t("settings.requestFailed"), variant: "destructive" }); return; }
      toast({ title: t("settings.emailChanged") });
      onChanged();
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.changeEmail")}</DialogTitle>
          <DialogDescription>{t("settings.changeEmailDesc", { email: currentEmail })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="newEmail">{t("settings.newEmail")}</Label>
            <Input id="newEmail" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com" data-testid="input-new-email" />
          </div>
          <div>
            <Label htmlFor="pwd">{t("settings.currentPassword")}</Label>
            <PasswordInput id="pwd" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-email-password" autoComplete="current-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("buttons.cancel")}</Button>
          <Button onClick={submit} disabled={busy || !password || !newEmail} data-testid="button-submit-change-email">
            {busy ? t("buttons.sending") : t("buttons.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const REQUIRED_TEXT = "DELETE";

  const submit = async () => {
    if (confirmText !== REQUIRED_TEXT) { toast({ title: t("settings.typeDeleteToConfirm"), variant: "destructive" }); return; }
    setBusy(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? t("settings.requestFailed"), variant: "destructive" }); return; }
      onDeleted();
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> {t("settings.deleteAccount")}
          </DialogTitle>
          <DialogDescription className="text-red-600/90 dark:text-red-400/90">
            {t("settings.deleteAccountWarning")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="delpwd">{t("settings.currentPassword")}</Label>
            <PasswordInput id="delpwd" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-delete-password" autoComplete="current-password" />
          </div>
          <div>
            <Label htmlFor="delconf">{t("settings.typeDeleteLabel", { word: REQUIRED_TEXT })}</Label>
            <Input id="delconf" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={REQUIRED_TEXT} data-testid="input-delete-confirm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("buttons.cancel")}</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || confirmText !== REQUIRED_TEXT || !password} data-testid="button-submit-delete-account">
            {busy ? t("buttons.sending") : t("settings.deleteForever")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
