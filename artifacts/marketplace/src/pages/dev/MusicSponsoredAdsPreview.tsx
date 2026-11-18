/**
 * Dev preview — foreground sponsored break + Recent Sponsored Ads (mock data).
 * Route: /dev/music-sponsored-ads-preview
 */
import { useEffect, useState } from "react";
import { ExternalLink, Headphones, Pause, Play } from "lucide-react";

const DEMO_AD = {
  sellerName: "Kafe Lakay",
  title: "Café haïtien d'exception",
  thumb:
    "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=800&q=60",
  videoPoster:
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=60",
};

const DEMO_HISTORY = [
  {
    id: 1,
    sellerName: "Kafe Lakay",
    title: "Café haïtien d'exception",
    thumb: DEMO_AD.thumb,
  },
  {
    id: 2,
    sellerName: "Atelye Kreyòl",
    title: "Handmade home goods",
    thumb:
      "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=400&q=60",
  },
];

export default function MusicSponsoredAdsPreview() {
  const [mode, setMode] = useState<"break" | "history">(() =>
    typeof window !== "undefined" && /mode=history/.test(window.location.search) ? "history" : "break",
  );

  useEffect(() => {
    document.title = mode === "break" ? "Music Sponsored Break Preview" : "Recent Sponsored Ads Preview";
  }, [mode]);

  return (
    <div className="min-h-[100dvh] bg-[#0A0A0A] text-white">
      <div className="flex gap-2 p-3 border-b border-white/10 sticky top-0 bg-[#0A0A0A]/z-20">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm font-bold ${mode === "break" ? "bg-[#FF6B00] text-[#111]" : "bg-white/10"}`}
          onClick={() => setMode("break")}
          data-testid="preview-break"
        >
          Foreground ad
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm font-bold ${mode === "history" ? "bg-[#FF6B00] text-[#111]" : "bg-white/10"}`}
          onClick={() => setMode("history")}
          data-testid="preview-history"
        >
          Recent Sponsored Ads
        </button>
      </div>

      {mode === "break" ? (
        <div
          className="mx-auto max-w-md min-h-[calc(100dvh-52px)] flex flex-col"
          data-testid="music-sponsored-break-preview"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <header className="flex items-center gap-2 px-4 py-3">
            <div className="flex items-end gap-0.5 h-5">
              <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 8 }} />
              <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 14 }} />
              <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 10 }} />
            </div>
            <span className="font-black tracking-tight">Flexa Music</span>
          </header>

          <div className="flex-1 px-4 flex flex-col min-h-0">
            <div className="relative flex-1 min-h-[280px] rounded-xl overflow-hidden bg-black">
              <img src={DEMO_AD.videoPoster} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute top-3 left-3 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded bg-[#FF6B00] text-[#111]">
                Sponsored
              </span>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
                <div className="flex items-center gap-2">
                  <Pause size={16} fill="white" />
                  <span className="text-xs tabular-nums text-white/80">0:08 / 0:20</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
                    <div className="h-full w-[40%] rounded-full bg-white relative">
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#FF6B00]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 py-3">
              <img src={DEMO_AD.thumb} alt="" className="w-11 h-11 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{DEMO_AD.sellerName}</p>
                <p className="text-white/45 text-xs truncate">{DEMO_AD.title}</p>
              </div>
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-extrabold bg-[#FF6B00] text-[#111]"
              >
                View product
                <ExternalLink size={14} />
              </button>
            </div>
          </div>

          <div
            className="mx-4 mb-4 flex items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{ background: "#0B3022", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="w-10 h-10 rounded-lg bg-[#1A1A1A]" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-white/50">Music paused</p>
              <p className="text-sm font-bold truncate">Limyè Solèy</p>
            </div>
            <Pause size={16} className="text-white/40" />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-md" data-testid="music-sponsored-history-preview">
          <div className="px-4 pt-5 pb-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-end gap-0.5 h-4">
                <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 6 }} />
                <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 12 }} />
                <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 8 }} />
              </div>
              <span className="font-black">Flexa Music</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Recent Sponsored Ads</h1>
            <p className="text-white/45 text-sm mt-1">Heard while listening</p>
          </div>
          <div className="px-4 space-y-3 mt-3 pb-24">
            {DEMO_HISTORY.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl p-2.5"
                style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <img src={item.thumb} alt="" className="w-[72px] h-[52px] rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate">{item.sellerName}</p>
                  <p className="text-white/45 text-xs flex items-center gap-1 mt-0.5">
                    <Headphones size={12} /> Heard in background.
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-extrabold bg-[#FF6B00] text-[#111]"
                >
                  <Play size={14} fill="#111" /> Watch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
