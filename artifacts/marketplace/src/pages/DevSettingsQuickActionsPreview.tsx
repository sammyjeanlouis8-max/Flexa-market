/**
 * DEV-ONLY preview of Settings quick-action grid (no auth).
 */
import { Link } from "wouter";
import { Plus, Play, Megaphone, Layers } from "lucide-react";

export default function DevSettingsQuickActionsPreview() {
  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 bg-background min-h-dvh">
      <h1 className="text-lg font-bold">Settings quick actions (dev)</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Link href="/sell" className="min-h-[76px] rounded-2xl bg-[hsl(152,65%,18%)] text-white flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center shadow-sm">
          <Plus className="h-5 w-5" /><span className="text-[11px] font-semibold">Add a product</span>
        </Link>
        <Link href="/settings/videos" className="min-h-[76px] rounded-2xl bg-sky-50 text-sky-900 border border-sky-100 flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center">
          <Play className="h-5 w-5 text-violet-600" /><span className="text-[11px] font-semibold">My videos (Products)</span>
        </Link>
        <Link href="/booster" className="min-h-[76px] rounded-2xl bg-orange-50 text-orange-900 border border-orange-100 flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center">
          <Megaphone className="h-5 w-5 text-orange-500" /><span className="text-[11px] font-semibold">Booster (My boosts)</span>
        </Link>
        <Link href="/my-drafts" className="relative min-h-[76px] rounded-2xl bg-violet-50 text-violet-950 border border-violet-100 flex flex-col items-center justify-center gap-1.5 px-2 py-3 text-center">
          <span className="absolute top-1.5 right-1.5 text-[9px] font-black uppercase bg-red-500 text-white px-1.5 py-0.5 rounded-full">New</span>
          <Layers className="h-5 w-5 text-violet-600" /><span className="text-[11px] font-semibold">My Drafts</span>
        </Link>
      </div>
    </div>
  );
}
