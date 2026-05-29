import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck, Upload, CheckCircle2, Clock, XCircle,
  AlertCircle, FileText, Car, User, ChevronRight, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth";
import { useSEO } from "@/hooks/useSEO";

type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";
type DocType   = "national_id" | "passport" | "driving_license";

interface KycInfo {
  status: KycStatus;
  documentType?: DocType | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

const DOC_OPTIONS: { value: DocType; label: string; icon: React.ReactNode }[] = [
  { value: "national_id",      label: "Kat Idantite Nasyonal", icon: <User size={20} /> },
  { value: "passport",         label: "Paspò",                 icon: <FileText size={20} /> },
  { value: "driving_license",  label: "Lisans Kondwi",         icon: <Car size={20} /> },
];

export default function KYCVerification() {
  const { user, token } = useAuth();
  useSEO({ title: "Verifikasyon Idantite (KYC)", path: "/kyc", noindex: true });

  const [kycInfo, setKycInfo]         = useState<KycInfo | null>(null);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [docType, setDocType]         = useState<DocType>("national_id");
  const [docFile, setDocFile]         = useState<File | null>(null);
  const [selfieFile, setSelfieFile]   = useState<File | null>(null);
  const [docPreview, setDocPreview]   = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);
  const docRef    = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/kyc/status", { headers: { Authorization: `Bearer ${token}` } })
      .then((r: Response) => r.json())
      .then((d: KycInfo) => setKycInfo(d))
      .catch(() => setKycInfo({ status: "not_submitted" }))
      .finally(() => setLoading(false));
  }, [token]);

  function handleFile(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void,
    previewSetter: (s: string | null) => void
  ) {
    const f = e.target.files?.[0] ?? null;
    setter(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => previewSetter(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      previewSetter(null);
    }
  }

  async function handleSubmit() {
    if (!docFile || !selfieFile) {
      setError("Tanpri telechaje foto dokiman ak selfie ou a.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("document", docFile);
      fd.append("selfie", selfieFile);
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("flexamarket_token") ?? ""}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Soumisyon echwe");
      }
      setSuccess(true);
      setKycInfo({ status: "pending" });
    } catch (e: any) {
      setError(e.message ?? "Erè envwaye. Eseye ankò.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const status = kycInfo?.status ?? "not_submitted";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Verifikasyon Idantite</h1>
          <p className="text-sm text-muted-foreground">
            KYC — Know Your Customer
          </p>
        </div>
      </div>

      {/* Status card */}
      {status !== "not_submitted" && (
        <Card className="p-5">
          <div className="flex items-center gap-4">
            {status === "pending" && (
              <>
                <div className="p-3 rounded-full bg-yellow-500/10">
                  <Clock className="h-6 w-6 text-yellow-500" />
                </div>
                <div>
                  <p className="font-semibold">Ap tann revizyon</p>
                  <p className="text-sm text-muted-foreground">
                    Demann ou a ap revize pa ekip nou an (1-3 jou travay).
                  </p>
                </div>
                <Badge variant="outline" className="ml-auto border-yellow-500 text-yellow-500">
                  An Atant
                </Badge>
              </>
            )}
            {status === "approved" && (
              <>
                <div className="p-3 rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold">Idantite Verifye ✓</p>
                  <p className="text-sm text-muted-foreground">
                    Ou ka fè tranzaksyon gwo montan san restriksyon.
                  </p>
                </div>
                <Badge variant="outline" className="ml-auto border-green-500 text-green-500">
                  Apwouve
                </Badge>
              </>
            )}
            {status === "rejected" && (
              <>
                <div className="p-3 rounded-full bg-destructive/10">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold">Demann Rejte</p>
                  {kycInfo?.rejectionReason && (
                    <p className="text-sm text-muted-foreground">{kycInfo.rejectionReason}</p>
                  )}
                </div>
                <Badge variant="destructive" className="ml-auto">Rejte</Badge>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Why KYC */}
      <Card className="p-5 bg-muted/30 border-dashed">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-primary" /> Poukisa KYC?
        </h2>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />Transfè P2P plis pase $500 egzije KYC</li>
          <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />Pwoteje kont ou kont fwod ak vol idantite</li>
          <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />Debloye limit transfè pou ajan otorize</li>
        </ul>
      </Card>

      {/* Submission form — only when not_submitted or rejected */}
      {(status === "not_submitted" || status === "rejected") && !success && (
        <Card className="p-6 space-y-6">
          <h2 className="font-semibold text-lg">Soumèt Dokiman ou</h2>

          {/* Document type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tip Dokiman</label>
            <div className="grid grid-cols-3 gap-2">
              {DOC_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDocType(opt.value)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    docType === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  {opt.icon}
                  <span className="text-center text-xs leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Document photo upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Foto Dokiman{" "}
              <span className="text-muted-foreground font-normal">(devan)</span>
            </label>
            <input
              ref={docRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e, setDocFile, setDocPreview)}
            />
            {docPreview ? (
              <div className="relative group cursor-pointer" onClick={() => docRef.current?.click()}>
                <img
                  src={docPreview}
                  alt="Document"
                  className="w-full h-44 object-cover rounded-xl border"
                />
                <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <p className="text-white text-sm font-medium">Chanje foto</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => docRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-primary/70 hover:bg-primary/5 transition-all"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Klike pou telechaje foto dokiman</span>
                <span className="text-xs text-muted-foreground">JPG, PNG — maks 10 MB</span>
              </button>
            )}
          </div>

          {/* Selfie upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Selfie{" "}
              <span className="text-muted-foreground font-normal">(foto ou ak dokiman a)</span>
            </label>
            <input
              ref={selfieRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => handleFile(e, setSelfieFile, setSelfiePreview)}
            />
            {selfiePreview ? (
              <div className="relative group cursor-pointer" onClick={() => selfieRef.current?.click()}>
                <img
                  src={selfiePreview}
                  alt="Selfie"
                  className="w-full h-44 object-cover rounded-xl border"
                />
                <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <p className="text-white text-sm font-medium">Chanje selfie</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => selfieRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-primary/70 hover:bg-primary/5 transition-all"
              >
                <User className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Klike pou telechaje selfie</span>
                <span className="text-xs text-muted-foreground">Kenbe dokiman a bò figi ou</span>
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleSubmit}
            disabled={submitting || !docFile || !selfieFile}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Ap voye…</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" />Soumèt pou Verifikasyon</>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Dokiman ou yo pwoteje epi pa janm pataje ak twazyèm pati.
          </p>
        </Card>
      )}

      {/* Success state */}
      {success && (
        <Card className="p-8 flex flex-col items-center text-center gap-4">
          <div className="p-4 rounded-full bg-green-500/10">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-1">Dokiman yo Soumèt ✓</h3>
            <p className="text-muted-foreground text-sm">
              Ekip nou an ap revize demann ou a nan 1-3 jou travay.
              Ou ap resevwa yon imel lè verifikasyon an fini.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
