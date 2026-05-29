import { useState, useEffect } from "react";
import { Globe, Power, PowerOff, BarChart3, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const tk = () => localStorage.getItem("flexamarket_token") ?? "";

type TranslationSettings = {
  enabled: boolean;
  stats: { total: number; today: number; thisMonth: number };
};

export default function AdminTranslationPanel() {
  const [data, setData] = useState<TranslationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/translation-settings", {
        headers: { Authorization: `Bearer ${tk()}` },
      });
      if (res.ok) setData(await res.json());
    } catch { /* noop */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const res = await fetch("/api/admin/translation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk()}` },
        body: JSON.stringify({ enabled: !data.enabled }),
      });
      if (res.ok) await load();
    } catch { /* noop */ } finally { setToggling(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-blue-500" />
          <h2 className="font-bold text-lg">Sistèm Tradiksyon AI</h2>
        </div>
        <Badge variant={data?.enabled ? "default" : "secondary"} className={data?.enabled ? "bg-green-600" : ""}>
          {data?.enabled ? "Aktif" : "Dezaktive"}
        </Badge>
      </div>

      {/* Status card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${data?.enabled ? "bg-green-100 dark:bg-green-950/60" : "bg-gray-100 dark:bg-gray-800"}`}>
            <Globe className={`h-5 w-5 ${data?.enabled ? "text-green-600" : "text-gray-400"}`} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Tradiksyon mesaj chat</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pèmèt itilizatè yo tradui mesaj yo vèrs lang yo chwazi a grasa Anthropic Claude AI.
              Tradiksyon yo cache nan DB pou vitès maksimòm.
            </p>
          </div>
        </div>

        <div className="pt-1 border-t border-border">
          <Button
            onClick={toggle}
            disabled={toggling}
            size="sm"
            variant={data?.enabled ? "destructive" : "default"}
            className="gap-2"
          >
            {data?.enabled ? (
              <><PowerOff className="h-4 w-4" />Dezaktive Tradiksyon</>
            ) : (
              <><Power className="h-4 w-4" />Aktive Tradiksyon</>
            )}
          </Button>
        </div>
      </Card>

      {/* Usage stats */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Estatistik Tradiksyon</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Jodi a", value: data?.stats.today ?? 0, color: "text-blue-600 dark:text-blue-400" },
            { label: "30 dènye jou", value: data?.stats.thisMonth ?? 0, color: "text-orange-600 dark:text-orange-400" },
            { label: "Total", value: data?.stats.total ?? 0, color: "text-purple-600 dark:text-purple-400" },
          ].map(stat => (
            <Card key={stat.label} className="p-3 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* How it works */}
      <Card className="p-4 bg-muted/30">
        <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Globe className="h-4 w-4" /> Kijan sa travay
        </h3>
        <ul className="text-xs text-muted-foreground space-y-1.5">
          <li>• Chak itilizatè ka klike "Tradui" sou nenpòt mesaj tèks yo resevwa.</li>
          <li>• Tradiksyon an detecte lang orijinal la epi tradui nan lang itilizatè a.</li>
          <li>• Rezilta yo cache → dezyèm demann gratis, rapid.</li>
          <li>• Bouton "Wè orijinal" pèmèt itilizatè a retounen nan mesaj orijinal la toujou.</li>
          <li>• Itilizatè ka aktive <strong>Tradiksyon Otomatik</strong> nan paj Settings yo.</li>
          <li>• Modèl: Anthropic Claude Haiku (rapid, ekonomik).</li>
        </ul>
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-2 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Rafraichi
        </Button>
      </div>
    </div>
  );
}
