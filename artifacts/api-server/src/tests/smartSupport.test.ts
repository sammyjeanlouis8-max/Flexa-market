import { describe, expect, it } from "vitest";
import { buildTicketRef, parseTicketRef, displayTicketRef } from "../lib/supportTicketRef";
import { classifySupportTicket } from "../lib/supportClassify";
import { computeResponseEta, formatEtaLabel } from "../lib/supportEta";

describe("ticket references", () => {
  it("builds FM-YYYY-NNNNNN refs", () => {
    expect(buildTicketRef(1245, new Date("2026-03-15T12:00:00Z"))).toBe("FM-2026-001245");
  });

  it("parses ticket refs", () => {
    expect(parseTicketRef("#FM-2026-001245")).toEqual({ year: 2026, id: 1245 });
    expect(parseTicketRef("bad")).toBeNull();
  });

  it("displays stored or derived refs", () => {
    expect(displayTicketRef("FM-2026-000042", 42)).toBe("FM-2026-000042");
    expect(displayTicketRef(null, 7, new Date("2026-01-01T00:00:00Z"))).toBe("FM-2026-000007");
  });
});

describe("ticket classification", () => {
  it("classifies payment failures as payments/high", () => {
    const r = classifySupportTicket({
      subject: "Peman echwe",
      message: "My payment failed on checkout",
    });
    expect(r.category).toBe("payments");
    expect(r.priority).toBe("high");
  });

  it("classifies delivery questions", () => {
    const r = classifySupportTicket({
      subject: "Livrezon",
      message: "Where is my delivery driver?",
    });
    expect(r.category).toBe("delivery");
  });

  it("marks abuse as urgent", () => {
    const r = classifySupportTicket({
      subject: "Report abuse",
      message: "Seller is harassing me",
    });
    expect(r.category).toBe("abuse");
    expect(r.priority).toBe("urgent");
  });

  it("extracts order hints without inventing", () => {
    const r = classifySupportTicket({
      subject: "Order help",
      message: "About order #FM-458721 please",
    });
    expect(r.relatedOrderHint).toBe(458721);
  });
});

describe("response time estimates", () => {
  it("returns high availability band when many agents and low load", () => {
    const eta = computeResponseEta({
      agentsOnline: 6,
      pendingTickets: 4,
      openAssignedToOnline: 2,
      avgFirstResponseMin: 20,
      priority: "normal",
      localHour: 12,
    });
    expect(eta.band).toBe("high_availability");
    expect(eta.minutesMax).toBeLessThanOrEqual(180);
  });

  it("returns backlog band when no agents online", () => {
    const eta = computeResponseEta({
      agentsOnline: 0,
      pendingTickets: 40,
      openAssignedToOnline: 0,
      avgFirstResponseMin: null,
      localHour: 12,
    });
    expect(eta.band).toBe("backlog");
    expect(eta.label.toLowerCase()).toContain("10");
  });

  it("formats labels clearly", () => {
    expect(formatEtaLabel(60, 60)).toMatch(/hour|min/i);
    expect(formatEtaLabel(180, 420)).toMatch(/Approximately/i);
  });
});

describe("support UI contracts", () => {
  it("AdminLiveSupport uses official logo path only", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../../../marketplace/src/pages/AdminLiveSupport.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain('OFFICIAL_LOGO = "/flexa-logo-v2.png"');
    expect(src).not.toMatch(/\bmicrophone\b|\bMic\b/);
    expect(src).toContain("Voice messages are not supported");
    expect(src).toContain("AI Copilot");
    expect(src).toContain("/api/support/copilot");
  });

  it("Layout hides footer on support pages", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../../../marketplace/src/components/Layout.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/\/\^\\\/support\//);
  });

  it("Message System CTA deep-links into FlexaBot support", async () => {
    const fs = await import("node:fs/promises");
    const notify = await fs.readFile(
      new URL("../lib/supportNotify.ts", import.meta.url),
      "utf8",
    );
    expect(notify).toContain("[VIEW SUPPORT TICKET](");
    expect(notify).toContain("[View Reply](");
    expect(notify).toContain("/support/");
    expect(notify).toContain("Message System");
  });
});
