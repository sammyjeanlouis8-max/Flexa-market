import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Loader2, MapPin, Plus, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  createUserAddress,
  deleteUserAddress,
  fetchUserAddresses,
  setDefaultUserAddress,
  updateUserAddress,
  type SavedUserAddress,
} from "@/lib/userAddressesApi";

export default function SettingsAddresses() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [addresses, setAddresses] = useState<SavedUserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedUserAddress | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: "Home",
    fullName: "",
    phone: "",
    email: "",
    street: "",
    apartment: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  });

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchUserAddresses(token, "delivery");
      setAddresses(data.addresses);
    } catch (e: any) {
      toast({ title: e?.message || "Failed to load addresses", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  if (!user || !token) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({
      label: "Home",
      fullName: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
      street: "",
      apartment: "",
      city: user.location || "",
      region: user.state || "",
      postalCode: "",
      country: user.country || "",
    });
  };

  const openEdit = (a: SavedUserAddress) => {
    setCreating(false);
    setEditing(a);
    setForm({
      label: a.label,
      fullName: a.fullName,
      phone: a.phone,
      email: a.email || "",
      street: a.street,
      apartment: a.apartment || "",
      city: a.city,
      region: a.region,
      postalCode: a.postalCode || "",
      country: a.country,
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        kind: "delivery" as const,
        label: form.label,
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || undefined,
        street: form.street,
        apartment: form.apartment || undefined,
        city: form.city,
        region: form.region,
        postalCode: form.postalCode || undefined,
        country: form.country,
        isDefault: addresses.length === 0,
      };
      if (editing) {
        await updateUserAddress(token, editing.id, payload);
        toast({ title: t("checkout.addressUpdated", { defaultValue: "Address updated" }) });
      } else {
        await createUserAddress(token, payload);
        toast({ title: t("checkout.addressSaved", { defaultValue: "Address saved" }) });
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (e: any) {
      toast({ title: e?.message || "Save failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-24">
      <button
        onClick={() => setLocation("/settings")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> {t("settings.backToSettings")}
      </button>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("checkout.savedAddresses", { defaultValue: "Delivery addresses" })}</h1>
          <p className="text-sm text-muted-foreground">
            {t("checkout.savedAddressesHint", {
              defaultValue: "Saved on your account — reused automatically at checkout on every device.",
            })}
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-address-settings">
          <Plus className="h-4 w-4 mr-1" /> {t("listing.addNewAddress", { defaultValue: "Add" })}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading", { defaultValue: "Loading…" })}
        </div>
      ) : addresses.length === 0 && !creating ? (
        <Card className="p-6 text-center space-y-3">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("checkout.noSavedAddresses", { defaultValue: "No saved delivery addresses yet." })}
          </p>
          <Button onClick={openCreate}>{t("listing.addNewAddress", { defaultValue: "Add New Address" })}</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{a.label}</p>
                    {a.isDefault && (
                      <span className="text-[10px] font-bold uppercase text-emerald-600">
                        {t("checkout.default", { defaultValue: "Default" })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{a.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.street}{a.apartment ? `, ${a.apartment}` : ""}, {a.city}, {a.region}
                    {a.postalCode ? ` ${a.postalCode}` : ""} · {a.country}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.phone}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                    {t("buttons.edit", { defaultValue: "Edit" })}
                  </Button>
                  {!a.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await setDefaultUserAddress(token, a.id);
                        await load();
                      }}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      {t("checkout.setDefault", { defaultValue: "Default" })}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={async () => {
                      if (!confirm(t("checkout.confirmDeleteAddress", { defaultValue: "Delete this address?" }))) return;
                      await deleteUserAddress(token, a.id);
                      await load();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <Card className="p-4 space-y-3" data-testid="settings-address-form">
          <h2 className="font-bold">
            {editing
              ? t("checkout.editAddress", { defaultValue: "Edit address" })
              : t("listing.addNewAddress", { defaultValue: "Add New Address" })}
          </h2>
          {([
            ["label", t("checkout.addressLabel", { defaultValue: "Label" })],
            ["fullName", t("listing.fullName")],
            ["phone", t("listing.phoneLabel")],
            ["email", t("listing.emailLabel")],
            ["street", t("listing.streetAddress")],
            ["apartment", t("checkout.apartment", { defaultValue: "Apartment" })],
            ["city", t("listing.cityLabel")],
            ["region", t("listing.regionLabel")],
            ["postalCode", t("listing.zipLabel")],
            ["country", t("auth.country", { defaultValue: "Country" })],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={busy} data-testid="button-save-settings-address">
              {busy ? t("buttons.saving", { defaultValue: "Saving…" }) : t("buttons.save", { defaultValue: "Save" })}
            </Button>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); }}>
              {t("buttons.cancel")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
