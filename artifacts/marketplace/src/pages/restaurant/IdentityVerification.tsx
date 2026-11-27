import { useRef, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { submitIdentityVerification } from "@/lib/restaurantApi";

const DOC_TYPES = [
  { id: "passport", label: "Passport" },
  { id: "national_id", label: "National ID card" },
  { id: "driving_license", label: "Driver’s license" },
  { id: "other", label: "Other government ID" },
] as const;

const PRIVACY_NOTICE =
  "Your identification documents and selfie are strictly confidential. They are used to verify your identity and protect the Flexa Market community. Only authorized Flexa Market security and verification personnel can access this information. Your documents and selfie will never appear on your public restaurant profile.";

export default function IdentityVerification() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [accepted, setAccepted] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [countryOfResidence, setCountryOfResidence] = useState("");
  const [documentIssuingCountry, setDocumentIssuingCountry] = useState("");
  const [documentType, setDocumentType] = useState<string>("national_id");
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  function pickFile(
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (url: string | null) => void,
  ) {
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function onSubmit() {
    if (!restaurantId || !accepted || !frontFile || !selfieFile || !legalName.trim()) {
      setError("Complete all required fields, accept privacy notice, and attach document + selfie.");
      return;
    }
    setError(null);
    setProgress("Uploading documents securely…");
    try {
      const fd = new FormData();
      fd.append("privacyAccepted", "true");
      fd.append("legalName", legalName.trim());
      fd.append("countryOfResidence", countryOfResidence.trim());
      fd.append("documentIssuingCountry", documentIssuingCountry.trim());
      fd.append("documentType", documentType);
      fd.append("documentFront", frontFile);
      if (backFile) fd.append("documentBack", backFile);
      fd.append("selfie", selfieFile);
      const res = await submitIdentityVerification(restaurantId, fd);
      setDone(true);
      setProgress(`Submitted · status: ${(res as { identity?: { status?: string } }).identity?.status ?? (res as { status?: string }).status ?? "pending_review"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setProgress(null);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.identityVerification")} subtitle={t("restaurant.identityVerificationSubtitle")}>
        <div className="space-y-4">
          <h3 className="font-bold">{t("restaurant.identityPrivacyTitle")}</h3>
          <p className="rounded-xl border border-[hsl(152,40%,80%)] bg-[hsl(152,45%,96%)] px-3 py-3 text-sm text-[hsl(152,55%,18%)]">
            {PRIVACY_NOTICE}
          </p>
          <p className="text-sm text-muted-foreground">{t("restaurant.identityPrivacyBody")}</p>
          <RestaurantNotice>{t("restaurant.identityBadgeNote")}</RestaurantNotice>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
            <span>{t("restaurant.identityPrivacyAccept")}</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Full legal name
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold">
              Country of residence
              <input value={countryOfResidence} onChange={(e) => setCountryOfResidence(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold">
              Document issuing country
              <input value={documentIssuingCountry} onChange={(e) => setDocumentIssuingCountry(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-semibold">
              Document type
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm">
                {DOC_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-semibold">
              Document front
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="mt-1 block w-full text-xs"
                onChange={(e) => pickFile(e.target.files?.[0], setFrontFile, setFrontPreview)}
              />
              {frontPreview && <img src={frontPreview} alt="Document front preview" className="mt-2 h-28 w-full rounded-lg object-cover" />}
              {frontFile && (
                <button type="button" className="mt-1 text-xs font-semibold text-[hsl(152,55%,28%)]" onClick={() => { setFrontFile(null); setFrontPreview(null); }}>
                  Retake
                </button>
              )}
            </label>
            <label className="block text-sm font-semibold">
              Document back (optional)
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="mt-1 block w-full text-xs"
                onChange={(e) => pickFile(e.target.files?.[0], setBackFile, setBackPreview)}
              />
              {backPreview && <img src={backPreview} alt="Document back preview" className="mt-2 h-28 w-full rounded-lg object-cover" />}
            </label>
            <label className="block text-sm font-semibold">
              Live selfie
              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="mt-1 block w-full text-xs"
                onChange={(e) => pickFile(e.target.files?.[0], setSelfieFile, setSelfiePreview)}
              />
              {selfiePreview && <img src={selfiePreview} alt="Selfie preview" className="mt-2 h-28 w-full rounded-lg object-cover" />}
              {selfieFile && (
                <button type="button" className="mt-1 text-xs font-semibold text-[hsl(152,55%,28%)]" onClick={() => { setSelfieFile(null); setSelfiePreview(null); selfieInputRef.current?.click(); }}>
                  Retake selfie
                </button>
              )}
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {progress && <p className="text-sm font-semibold text-[hsl(152,55%,28%)]">{progress}</p>}

          <button
            type="button"
            disabled={!accepted || done || !restaurantId}
            onClick={onSubmit}
            className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Submit for review
          </button>
          {!restaurantId && <p className="text-xs text-muted-foreground">Open this page from My Restaurant so a restaurant ID is present.</p>}
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
