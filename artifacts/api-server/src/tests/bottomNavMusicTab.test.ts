/**
 * Guards the marketplace bottom-nav order: Home → Categories → Messages → Music → My Account.
 * Cart remains a header action only (not a bottom tab).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/Layout.tsx"),
  "utf8",
);
const musicHome = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/music/MusicHome.tsx"),
  "utf8",
);
const nativeTabs = readFileSync(
  resolve(__dirname, "../../../mobile/app/(tabs)/_layout.tsx"),
  "utf8",
);
const en = readFileSync(
  resolve(__dirname, "../../../marketplace/src/i18n/locales/en.ts"),
  "utf8",
);

describe("bottom nav Music tab (replaces Cart)", () => {
  it("web Layout tabs are Home, Categories, Messages, Music, Account", () => {
    const tabsMatch = layout.match(/const tabs = \[([\s\S]*?)\] as const/);
    expect(tabsMatch).toBeTruthy();
    const tabsBlock = tabsMatch![1];
    expect(tabsBlock).toMatch(/key:\s*"home"/);
    expect(tabsBlock).toMatch(/key:\s*"categories"/);
    expect(tabsBlock).toMatch(/key:\s*"messages"/);
    expect(tabsBlock).toMatch(/key:\s*"music"/);
    expect(tabsBlock).toMatch(/key:\s*"account"/);
    expect(tabsBlock).not.toMatch(/key:\s*"cart"/);
    expect(tabsBlock).toMatch(/href:\s*"\/music"/);
    expect(tabsBlock).toMatch(/Music2/);
    expect(tabsBlock).toMatch(/nav\.music/);

    // Header cart control must remain.
    expect(layout).toMatch(/data-testid="cart-icon-button"/);
    expect(layout).toMatch(/href="\/cart"/);

    // Music immersive shell still mounts the shared marketplace bottom nav.
    expect(layout).toMatch(/music-immersive-shell[\s\S]*data-testid="mobile-bottom-nav"/);
  });

  it("MusicHome does not render a duplicate music-bottom-nav", () => {
    expect(musicHome).not.toMatch(/className=\{`music-bottom-nav/);
    expect(musicHome).not.toMatch(/className="music-bottom-nav/);
  });

  it("native tabs expose Music and hide Cart from the tab bar", () => {
    expect(nativeTabs).toMatch(/name="music"/);
    expect(nativeTabs).toMatch(/t\("tabMusic"\)/);
    expect(nativeTabs).toMatch(/name="music"[\s\S]*Feather name="music"/);
    // Cart route kept but not linked in the tab bar.
    expect(nativeTabs).toMatch(/name="cart"[\s\S]*href:\s*null/);
    expect(nativeTabs).not.toMatch(/name="cart"[\s\S]*Feather name="shopping-cart"/);
  });

  it("English default nav.music label is Music", () => {
    expect(en).toMatch(/nav:\s*\{[\s\S]*?\bmusic:\s*"Music"/);
  });
});
