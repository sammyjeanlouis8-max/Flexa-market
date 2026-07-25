import { MapPin, Truck } from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  driver_assigned: { label: "Chofè Asiye",     color: "bg-blue-100 text-blue-800" },
  picked_up:       { label: "Pako Pran",         color: "bg-amber-100 text-amber-800" },
  on_the_way:      { label: "Chofè an Wout",     color: "bg-violet-100 text-violet-800" },
  arrived:         { label: "Chofè Rive",         color: "bg-emerald-100 text-emerald-800" },
  delivered:       { label: "Livrezon Fèt ✓",     color: "bg-green-100 text-green-800" },
};

function OrderSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-1.5">
        <Truck className="h-3.5 w-3.5" /> {title}
      </h2>
      {children}
    </div>
  );
}

function SearchingState() {
  return (
    <OrderSection title="Detay Livrezon">
      <p className="text-sm text-gray-500 mb-3">Telefòn, sac, vêtements usagées, etc.</p>
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/60 rounded-xl px-3 py-2.5">
        <span className="text-lg">🚛</span>
        <div>
          <p className="text-xs font-bold text-emerald-800">Chofè FM ap chèche</p>
          <p className="text-[11px] text-emerald-700">Yon chofè ki disponib ap aksepte livrezon an.</p>
        </div>
      </div>
    </OrderSection>
  );
}

function AssignedState({ deliveryStatus }: { deliveryStatus: string }) {
  const meta = STATUS_META[deliveryStatus] ?? STATUS_META["driver_assigned"];
  return (
    <OrderSection title="Detay Livrezon">
      <p className="text-sm text-gray-500 mb-3">Telefòn, sac, vêtements usagées, etc.</p>
      <div className="space-y-3">
        {/* Driver avatar + name + phone */}
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200/60 rounded-2xl p-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center text-3xl">
            👨‍✈️
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-base text-gray-900 truncate">Jean-Marc Pierre</p>
            <p className="text-xs text-amber-600 font-bold">
              ⭐ 4.8
              <span className="text-gray-400 font-normal ml-1">• 143 livrezon</span>
            </p>
            <a href="tel:+50938000000" className="text-sm text-orange-500 font-mono font-bold mt-0.5 block">
              📞 +509 3800-0000
            </a>
          </div>
        </div>

        {/* Vehicle info */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">🏍 Moto</p>
          <p className="font-semibold text-gray-800">Honda CB 125 • 2021</p>
          <p className="text-gray-500">Wouj • Nwa</p>
          <p className="font-mono font-bold text-gray-900">🔖 HT-4821-B</p>
        </div>

        {/* Status badge + tracking button */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.color}`}>
            {meta.label}
          </span>
          <button className="flex items-center gap-1.5 text-xs font-bold text-orange-500">
            <MapPin className="h-3.5 w-3.5" /> Suiv Livrezon →
          </button>
        </div>
      </div>
    </OrderSection>
  );
}

export default function DriverCardPreview() {
  const statuses = ["driver_assigned", "on_the_way", "arrived", "delivered"];

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-6">
      <div className="max-w-sm mx-auto space-y-6">

        {/* Label */}
        <div className="text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Paj Detay Lòd — Seksyon Livrezon FM</p>
        </div>

        {/* State 1: Searching */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            ① Annatant — Chofè pa aksepte toujou
          </p>
          <SearchingState />
        </div>

        {/* State 2: Driver assigned */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            ② Chofè Aksepte — Kat konplè
          </p>
          <AssignedState deliveryStatus="driver_assigned" />
        </div>

        {/* State 3: On the way */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            ③ Estati an Wout
          </p>
          <AssignedState deliveryStatus="on_the_way" />
        </div>

        {/* State 4: Delivered */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            ④ Livrezon Fèt
          </p>
          <AssignedState deliveryStatus="delivered" />
        </div>

      </div>
    </div>
  );
}
