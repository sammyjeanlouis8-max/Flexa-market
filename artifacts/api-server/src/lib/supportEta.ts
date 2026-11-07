/**
 * Intelligent estimated response time from live operational signals.
 * Estimates only — never presented as guaranteed deadlines.
 */

export type EtaBand = {
  minutesMin: number;
  minutesMax: number;
  label: string;
  band: "high_availability" | "moderate" | "low" | "backlog";
};

export type EtaInputs = {
  agentsOnline: number;
  pendingTickets: number;
  openAssignedToOnline: number;
  /** Historical average first-response minutes (nullable) */
  avgFirstResponseMin: number | null;
  priority?: "normal" | "high" | "urgent";
  /** Hour in America/Port-au-Prince (0–23); outside hours stretches estimate */
  localHour?: number;
};

function isSupportHours(hour: number | undefined): boolean {
  if (hour == null || !Number.isFinite(hour)) return true;
  // Approximate Haiti support window 8:00–22:00 local
  return hour >= 8 && hour < 22;
}

export function computeResponseEta(input: EtaInputs): EtaBand {
  const agents = Math.max(0, input.agentsOnline);
  const pending = Math.max(0, input.pendingTickets);
  const loadPerAgent = agents > 0 ? pending / agents : pending + 10;
  const hist = input.avgFirstResponseMin != null && input.avgFirstResponseMin > 0
    ? input.avgFirstResponseMin
    : null;

  let band: EtaBand;
  if (agents >= 3 && loadPerAgent <= 2) {
    band = { minutesMin: 30, minutesMax: 60, label: "Approximately 1 hour", band: "high_availability" };
  } else if (agents >= 1 && loadPerAgent <= 6) {
    band = { minutesMin: 180, minutesMax: 420, label: "Approximately 3–7 hours", band: "moderate" };
  } else if (agents >= 1) {
    band = { minutesMin: 300, minutesMax: 600, label: "Approximately 5–10 hours", band: "low" };
  } else {
    band = { minutesMin: 600, minutesMax: 720, label: "Approximately 10–12 hours", band: "backlog" };
  }

  // Blend lightly with historical average when available (never invent).
  if (hist != null) {
    const mid = (band.minutesMin + band.minutesMax) / 2;
    const blended = Math.round(mid * 0.7 + hist * 0.3);
    const spread = Math.max(30, Math.round((band.minutesMax - band.minutesMin) / 2));
    band = {
      ...band,
      minutesMin: Math.max(15, blended - spread),
      minutesMax: blended + spread,
      label: formatEtaLabel(Math.max(15, blended - spread), blended + spread),
    };
  }

  if (!isSupportHours(input.localHour)) {
    band = {
      minutesMin: band.minutesMin + 180,
      minutesMax: band.minutesMax + 360,
      label: formatEtaLabel(band.minutesMin + 180, band.minutesMax + 360),
      band: band.band === "high_availability" ? "moderate" : band.band,
    };
  }

  if (input.priority === "urgent") {
    band = {
      minutesMin: Math.max(15, Math.round(band.minutesMin * 0.5)),
      minutesMax: Math.max(30, Math.round(band.minutesMax * 0.55)),
      label: formatEtaLabel(
        Math.max(15, Math.round(band.minutesMin * 0.5)),
        Math.max(30, Math.round(band.minutesMax * 0.55)),
      ),
      band: band.band,
    };
  } else if (input.priority === "high") {
    band = {
      minutesMin: Math.max(20, Math.round(band.minutesMin * 0.75)),
      minutesMax: Math.max(45, Math.round(band.minutesMax * 0.8)),
      label: formatEtaLabel(
        Math.max(20, Math.round(band.minutesMin * 0.75)),
        Math.max(45, Math.round(band.minutesMax * 0.8)),
      ),
      band: band.band,
    };
  }

  return band;
}

export function formatEtaLabel(min: number, max: number): string {
  const fmt = (m: number) => {
    if (m < 90) return `${Math.round(m)} min`;
    const h = m / 60;
    if (h < 1.5) return "1 hour";
    return `${Math.round(h)} hours`;
  };
  if (Math.abs(max - min) < 45) return `Approximately ${fmt((min + max) / 2)}`;
  return `Approximately ${fmt(min)}–${fmt(max)}`.replace(" hours–", "–").replace(" min–", "–");
}

export function haitiLocalHour(now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Port-au-Prince",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(h) ? h % 24 : now.getUTCHours() - 5;
  } catch {
    return (now.getUTCHours() - 5 + 24) % 24;
  }
}
