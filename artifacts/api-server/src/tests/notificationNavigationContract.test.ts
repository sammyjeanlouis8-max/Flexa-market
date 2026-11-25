/**
 * Contract: web notification destinations + copy for every product surface.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dropdown = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/NotificationsDropdown.tsx"),
  "utf8",
);
const app = readFileSync(
  resolve(__dirname, "../../../marketplace/src/App.tsx"),
  "utf8",
);
const nav = readFileSync(
  resolve(__dirname, "../../../marketplace/src/lib/notificationNavigation.ts"),
  "utf8",
);
const api = readFileSync(
  resolve(__dirname, "../routes/notifications.ts"),
  "utf8",
);
const messages = readFileSync(
  resolve(__dirname, "../routes/messages.ts"),
  "utf8",
);
const users = readFileSync(
  resolve(__dirname, "../routes/users.ts"),
  "utf8",
);
const mobileHref = readFileSync(
  resolve(__dirname, "../../../mobile/lib/notificationsApi.ts"),
  "utf8",
);

describe("notification navigation contract", () => {
  it("wires dropdown to shared helpers, per-item read, and details route", () => {
    expect(dropdown).toMatch(/getNotificationHref/);
    expect(dropdown).toMatch(/formatNotificationMessage/);
    expect(dropdown).toMatch(/\/api\/notifications\/\$\{id\}\/read/);
    expect(dropdown).toMatch(/setOpen\(false\)/);
    expect(dropdown).not.toMatch(/if \(unreadCount > 0\) markAllRead/);
    expect(app).toMatch(/path="\/notifications\/:id"/);
  });

  it("maps product, like, message, follower, order, delivery, video, general", () => {
    expect(nav).toMatch(/type === "new_listing"|LISTING_TYPES/);
    expect(nav).toMatch(/\/listings\/\$\{n\.listingId\}/);
    expect(nav).toMatch(/\/messages\/\$\{n\.referenceId\}/);
    expect(nav).toMatch(/\/profile\/\$\{n\.actorId\}/);
    expect(nav).toMatch(/\/delivery\/tracking\/\$\{n\.referenceId\}/);
    expect(nav).toMatch(/\/listings\/\$\{n\.listingId\}\/video/);
    expect(nav).toMatch(/\/notifications\/\$\{n\.id\}/);
  });

  it("prefers stored message over bare defaultNotif", () => {
    expect(nav).toMatch(/if \(n\.message\?\.trim\(\)\) return n\.message\.trim\(\)/);
    expect(nav).toMatch(/withActor\(t\("notifications\.defaultNotif"\)\)/);
  });

  it("backend exposes actorId, message conversation referenceId, and follow notify", () => {
    expect(api).toMatch(/actorId: notificationsTable\.actorId/);
    expect(api).toMatch(/router\.get\("\/notifications\/:id"/);
    expect(messages).toMatch(/referenceId: id/);
    expect(users).toMatch(/type: "follow"/);
  });

  it("mobile inbox keeps parity for message thread and delivery tracking", () => {
    expect(mobileHref).toMatch(/\/chat\/\$\{n\.referenceId\}/);
    expect(mobileHref).toMatch(/\/delivery-tracking/);
    expect(mobileHref).toMatch(/follow/);
  });
});
