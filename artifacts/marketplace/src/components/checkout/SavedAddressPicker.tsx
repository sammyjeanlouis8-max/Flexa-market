import { useEffect, useState } from "react";
import { Loader2, MapPin, Plus, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createUserAddress,
  deleteUserAddress,
  fetchUserAddresses,
  setDefaultUserAddress,
  type SavedUserAddress,
} from "@/lib/userAddressesApi";
import { cn } from "@/lib/utils";

type Draft = {
  fullName: string;
  phone: string;
  email: string;
  street: string;
  apartment: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  label: string;
};

type Props = {
  token: string;
  listingCountry?: string | null;
  accountCountry?: string | null;
  selectedId: number | null;
  onSelect: (address: SavedUserAddress) => void;
  onNeedForm: () => void;
  onCancelForm?: () => void;
  showForm: boolean;
  draft: Draft;
  onDraftChange: (patch: Partial<Draft>) => void;
  onSaved: (address: SavedUserAddress) => void;
  requirePostal?: boolean;
  className?: string;
};

export function SavedAddressPicker({
  token,
  listingCountry,
  accountCountry,
  selectedId,
  onSelect,
  onNeedForm,
  onCancelForm,
  showForm,
  draft,
  onDraftChange,
  onSaved,
  requirePostal,
  className,
}: Props) {
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<SavedUserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUserAddresses(token, "delivery");
      setAddresses(data.addresses);
      if (data.defaultAddress && !selectedId) {
        onSelect(data.defaultAddress);
      } else if (data.addresses.length === 0) {
        onNeedForm();
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load addresses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const saveNew = async () => {
    setSaving(true);
    setError(null);
    try {
      const country = draft.country.trim() || listingCountry || accountCountry || "";
      const address = await createUserAddress(token, {
        kind: "delivery",
        label: draft.label.trim() || "Home",
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim() || undefined,
        street: draft.street.trim(),
        apartment: draft.apartment.trim() || undefined,
        city: draft.city.trim(),
        region: draft.region.trim(),
        postalCode: draft.postalCode.trim() || undefined,
        country,
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => {
        const next = prev.map((a) => (address.isDefault ? { ...a, isDefault: false } : a));
        return [address, ...next.filter((a) => a.id !== address.id)];
      });
      onSaved(address);
    } catch (e: any) {
      setError(e?.message || "Could not save address");
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (id: number) => {
    setBusyId(id);
    try {
      const updated = await setDefaultUserAddress(token, id);
      setAddresses((prev) => prev.map((a) => ({
        ...a,
        isDefault: a.id === updated.id,
      })));
      onSelect(updated);
    } catch (e: any) {
      setError(e?.message || "Could not set default");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    if (!confirm(t("checkout.confirmDeleteAddress", { defaultValue: "Delete this saved address?" }))) return;
    setBusyId(id);
    try {
      await deleteUserAddress(token, id);
      const next = addresses.filter((a) => a.id !== id);
      setAddresses(next);
      if (selectedId === id) {
        const fallback = next.find((a) => a.isDefault) || next[0];
        if (fallback) onSelect(fallback);
        else onNeedForm();
      }
    } catch (e: any) {
      setError(e?.message || "Could not delete address");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-8 text-sm text-[#8B9BB8]", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="saved-address-picker">
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

      {!showForm && addresses.length > 0 && (
        <div className="space-y-2">
          {addresses.map((a) => {
            const selected = selectedId === a.id;
            const unsupported = listingCountry && a.country && a.country !== listingCountry
              && !["Haiti", "Dominican Republic"].includes(listingCountry); // soft hint; checkout validates shipping separately
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className={cn(
                  "w-full text-left rounded-2xl border px-3.5 py-3 transition-colors",
                  selected ? "border-[#4C8DFF] bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/8",
                )}
                data-testid={`address-option-${a.id}`}
              >
                <div className="flex items-start gap-3">
                  <MapPin className={cn("h-4 w-4 mt-0.5", selected ? "text-[#4C8DFF]" : "text-[#8B9BB8]")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white truncate">{a.label}</p>
                      {a.isDefault && (
                        <span className="text-[10px] font-black uppercase tracking-wide text-emerald-300">
                          {t("checkout.default", { defaultValue: "Default" })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/90 mt-0.5">{a.fullName}</p>
                    <p className="text-xs text-[#8B9BB8] mt-0.5">
                      {a.street}{a.apartment ? `, ${a.apartment}` : ""}, {a.city}, {a.region}
                      {a.postalCode ? ` ${a.postalCode}` : ""}
                    </p>
                    <p className="text-xs text-[#8B9BB8]">{a.country} · {a.phone}</p>
                    {unsupported && (
                      <p className="text-xs text-amber-300 mt-1">
                        {t("checkout.addressCountryMismatch", {
                          defaultValue: "This address country may not match the seller’s shipping region — verify shipping on the next step.",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!a.isDefault && (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={(e) => { e.stopPropagation(); void makeDefault(a.id); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-[#8B9BB8] hover:text-amber-300"
                        aria-label={t("checkout.setDefault", { defaultValue: "Set as default" })}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={(e) => { e.stopPropagation(); void remove(a.id); }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-[#8B9BB8] hover:text-red-400"
                      aria-label={t("checkout.deleteAddress", { defaultValue: "Delete address" })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={onNeedForm}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 px-3 py-3 text-sm font-semibold text-[#4C8DFF] hover:bg-white/5"
            data-testid="button-add-address"
          >
            <Plus className="h-4 w-4" />
            {t("listing.addNewAddress", { defaultValue: "Add New Address" })}
          </button>
        </div>
      )}

      {showForm && (
        <div className="space-y-2" data-testid="address-form">
          <Field label={t("listing.fullName")} required>
            <input value={draft.fullName} onChange={(e) => onDraftChange({ fullName: e.target.value })} data-testid="input-ship-name" className="addr-input" placeholder="ex: Jean Pierre" />
          </Field>
          <Field label={t("listing.phoneLabel")} required>
            <input value={draft.phone} onChange={(e) => onDraftChange({ phone: e.target.value })} data-testid="input-ship-phone" className="addr-input" placeholder="ex: +509 1234-5678" />
          </Field>
          <Field label={t("listing.emailLabel")} optional>
            <input value={draft.email} onChange={(e) => onDraftChange({ email: e.target.value })} data-testid="input-ship-email" className="addr-input" placeholder="ex: jean@gmail.com" />
          </Field>
          <Field label={t("listing.streetAddress")} required>
            <input value={draft.street} onChange={(e) => onDraftChange({ street: e.target.value })} data-testid="input-ship-street" className="addr-input" placeholder="ex: 12 Rue des Miracles" />
          </Field>
          <Field label={t("checkout.apartment", { defaultValue: "Apartment / Building" })} optional>
            <input value={draft.apartment} onChange={(e) => onDraftChange({ apartment: e.target.value })} data-testid="input-ship-apartment" className="addr-input" placeholder="ex: Apt 3B" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("listing.cityLabel")} required>
              <input value={draft.city} onChange={(e) => onDraftChange({ city: e.target.value })} data-testid="input-ship-city" className="addr-input" />
            </Field>
            <Field label={t("listing.regionLabel")} required>
              <input value={draft.region} onChange={(e) => onDraftChange({ region: e.target.value })} data-testid="input-ship-region" className="addr-input" />
            </Field>
          </div>
          <Field label={t("listing.zipLabel")} required={!!requirePostal} optional={!requirePostal}>
            <input value={draft.postalCode} onChange={(e) => onDraftChange({ postalCode: e.target.value })} data-testid="input-ship-zip" className="addr-input" />
          </Field>
          <Field label={t("auth.country", { defaultValue: "Country" })} required>
            <input
              value={draft.country}
              onChange={(e) => onDraftChange({ country: e.target.value })}
              data-testid="input-ship-country"
              className="addr-input"
              placeholder={listingCountry || accountCountry || ""}
            />
          </Field>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveNew()}
            className="w-full rounded-2xl bg-[#2F6BFF] py-3 text-sm font-bold text-white disabled:opacity-60"
            data-testid="button-save-address"
          >
            {saving ? t("buttons.saving", { defaultValue: "Saving…" }) : t("checkout.saveAddressContinue", { defaultValue: "Save address & continue" })}
          </button>
          {addresses.length > 0 && onCancelForm && (
            <button type="button" onClick={onCancelForm} className="w-full text-center text-sm text-[#8B9BB8]">
              {t("buttons.cancel")}
            </button>
          )}
        </div>
      )}

      <style>{`
        .addr-input {
          width: 100%;
          font-size: 0.875rem;
          background: transparent;
          border: 0;
          outline: none;
          color: white;
        }
        .addr-input::placeholder { color: #6B7C99; }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">
        {label}{" "}
        {required && <span className="text-red-400">*</span>}
        {optional && <span className="text-[#8B9BB8] font-normal normal-case">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
