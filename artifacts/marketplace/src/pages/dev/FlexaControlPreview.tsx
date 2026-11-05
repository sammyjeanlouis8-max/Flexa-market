/**
 * Visual architecture preview for Flexa Control support UI (no backend).
 * Production page: /admin/live-support — uses live APIs.
 */
const LOGO = "/flexa-logo-v2.png";

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <img src={LOGO} alt="Flexa Market" className="h-8 w-auto" width={32} height={32} />
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-white leading-tight">Flexa Control</p>
        <p className="text-[10px] text-white/75 truncate">{subtitle}</p>
      </div>
    </div>
  );
}

export default function FlexaControlPreview() {
  return (
    <div className="min-h-dvh bg-background" data-testid="flexa-control-preview">
      <div className="mx-auto grid max-w-6xl gap-4 p-3 md:grid-cols-2">
        {/* Inbox mock */}
        <section className="overflow-hidden rounded-2xl border border-border shadow-sm">
          <header className="bg-[hsl(152,65%,18%)] px-3 py-2.5">
            <Brand subtitle="Support & Administration" />
          </header>
          <div className="bg-muted/40 px-3 py-2 grid grid-cols-3 gap-1.5">
            {["Conversations", "Tickets", "Users"].map((label, i) => (
              <div
                key={label}
                className={`rounded-xl px-2 py-2 text-center text-[11px] font-semibold ${i === 0 ? "bg-white shadow-sm text-[hsl(152,65%,22%)]" : "text-muted-foreground"}`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="p-3 space-y-2 bg-[#f8faf9]">
            <div className="flex justify-between">
              <div>
                <p className="font-bold">Conversations</p>
                <p className="text-[11px] text-muted-foreground">Manage messages, requests, and reports</p>
              </div>
            </div>
            {[1, 2].map((n) => (
              <div
                key={n}
                className={`rounded-2xl border px-3 py-2.5 ${n === 1 ? "border-emerald-200 bg-emerald-50/80" : "border-border bg-white"}`}
              >
                <div className="flex gap-2">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold">Customer {n}</p>
                    <p className="text-[12px] font-semibold">General support</p>
                    <p className="text-[11px] text-muted-foreground truncate">Last message preview…</p>
                    <div className="mt-2 flex gap-1.5">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">🇭🇹 Haiti</span>
                      <span className="rounded-full bg-violet-100 text-violet-800 px-2 py-0.5 text-[10px] font-semibold">Support</span>
                    </div>
                  </div>
                  {n === 1 && (
                    <span className="h-5 min-w-5 rounded-full bg-[hsl(152,55%,32%)] px-1 text-[10px] font-bold text-white flex items-center justify-center">3</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Chat mock */}
        <section className="overflow-hidden rounded-2xl border border-border shadow-sm flex flex-col min-h-[420px]">
          <header className="bg-[hsl(152,65%,18%)] px-3 py-2.5">
            <Brand subtitle="Customer · Super Admin" />
          </header>
          <div className="border-b px-3 py-2 flex items-center gap-2 bg-card">
            <div className="h-9 w-9 rounded-full bg-muted" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Customer</p>
              <p className="text-[10px] text-muted-foreground">🇭🇹 Haiti · Agent</p>
            </div>
            <span className="rounded-full border border-emerald-500/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Open</span>
          </div>
          <div className="flex gap-4 px-3 border-b">
            {["Conversation", "Details", "History"].map((tab, i) => (
              <span key={tab} className={`pb-2.5 text-[13px] font-semibold ${i === 0 ? "text-[hsl(152,65%,22%)] border-b-2 border-[hsl(152,65%,28%)]" : "text-muted-foreground"}`}>
                {tab}
              </span>
            ))}
          </div>
          <div className="flex-1 space-y-3 p-3 bg-background">
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted/70 border px-3 py-2 text-sm">Hello, I need help</div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[hsl(152,65%,18%)] text-white px-3 py-2 text-sm">
                We are here to help.
              </div>
            </div>
          </div>
          <div className="border-t p-2 flex items-end gap-1.5">
            <div className="flex-1 rounded-2xl bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">Reply to customer…</div>
            <div className="h-10 w-10 rounded-full bg-[hsl(152,65%,18%)]" />
          </div>
        </section>
      </div>
      <p className="px-4 pb-6 text-center text-xs text-muted-foreground">
        Architecture preview · Official logo: {LOGO} · Live data: /admin/live-support
      </p>
    </div>
  );
}
