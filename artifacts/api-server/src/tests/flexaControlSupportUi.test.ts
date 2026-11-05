/**
 * Guards Flexa Control live-support redesign: official logo, responsive panes,
 * and preserved admin capabilities.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/AdminLiveSupport.tsx"),
  "utf8",
);
const logoPath = resolve(
  __dirname,
  "../../../marketplace/public/flexa-logo-v2.png",
);

describe("Flexa Control support UI", () => {
  it("uses the official Flexa Market logo asset", () => {
    expect(existsSync(logoPath)).toBe(true);
    expect(page).toMatch(/\/flexa-logo-v2\.png/);
    expect(page).toMatch(/Flexa Control/);
    expect(page).not.toMatch(/generate.*logo|placeholder logo/i);
  });

  it("keeps mobile exclusive inbox/chat panes and multi-column desktop", () => {
    expect(page).toMatch(/mobilePane === "inbox"/);
    expect(page).toMatch(/mobilePane === "chat"/);
    expect(page).toMatch(/md:grid-cols-\[320px_1fr\]/);
    expect(page).toMatch(/xl:grid-cols-\[320px_minmax\(0,1fr\)_300px\]/);
  });

  it("preserves claim/release/close/reopen/priority/export and realtime", () => {
    for (const needle of [
      "/claim",
      "/release",
      "/close",
      "/reopen",
      "/priority",
      "/export",
      "joinSupportAdmin",
      "onSupportMessage",
    ]) {
      expect(page).toContain(needle);
    }
  });

  it("moves customer metadata into Details (not oversized in chat thread)", () => {
    expect(page).toMatch(/live-support-details/);
    expect(page).toMatch(/chatTab === "details"/);
    expect(page).toMatch(/conversationTab|"Conversation"/);
  });
});
