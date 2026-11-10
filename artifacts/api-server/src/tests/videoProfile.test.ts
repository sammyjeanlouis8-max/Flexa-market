import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidUsernameCandidate,
  normalizeUsername,
  usernameBaseFromName,
} from "../lib/videoProfileUsername";

const apiRoot = join(process.cwd(), "src");
const marketplace = join(process.cwd(), "../marketplace/src");

describe("video profile username helpers", () => {
  it("normalizes and validates handles", () => {
    expect(normalizeUsername("@Sammy_Jean")).toBe("sammy_jean");
    expect(normalizeUsername("ab")).toBeNull();
    expect(isValidUsernameCandidate("flexa_market")).toBe(true);
    expect(isValidUsernameCandidate("ab")).toBe(false);
    expect(isValidUsernameCandidate("!!!")).toBe(false);
  });

  it("seeds a slug base from display names", () => {
    expect(usernameBaseFromName("Samuel Jean")).toBe("samueljean");
    expect(usernameBaseFromName("Étoile")).toMatch(/^etoile/);
    expect(usernameBaseFromName("!!")).toMatch(/^user/);
  });
});

describe("video profile API surface", () => {
  const route = readFileSync(join(apiRoot, "routes/videoProfile.ts"), "utf8");
  const admin = readFileSync(join(apiRoot, "routes/adminVideos.ts"), "utf8");
  const helper = readFileSync(join(apiRoot, "lib/videoProfile.ts"), "utf8");
  const migrations = readFileSync(join(apiRoot, "lib/migrations.ts"), "utf8");
  const index = readFileSync(join(apiRoot, "routes/index.ts"), "utf8");
  const feed = readFileSync(join(apiRoot, "routes/videos.ts"), "utf8");

  it("exposes profile + tab privacy endpoints", () => {
    expect(route).toContain('"/videos/profile/:userId"');
    expect(route).toContain('"/videos/profile/me"');
    expect(route).toContain('"/videos/profile/:userId/videos"');
    expect(route).toContain('"/videos/profile/:userId/liked"');
    expect(route).toContain('"/videos/profile/:userId/saved"');
    expect(route).toContain('Liked videos are private');
    expect(route).toContain('Saved videos are private');
    expect(route).toContain("Username already taken");
  });

  it("mounts video profile + admin video routers", () => {
    expect(index).toContain("videoProfileRouter");
    expect(index).toContain("adminVideosRouter");
  });

  it("admin reject/delete require reason, stop boost, notify, and audit", () => {
    expect(admin).toContain('"/admin/videos/:id/reject"');
    expect(admin).toContain('"/admin/videos/:id/delete"');
    expect(admin).toContain("A rejection reason is required");
    expect(admin).toContain("stopVideoPromotion");
    expect(admin).toContain("logAdminAction");
    expect(admin).toContain('actionType: "video_reject"');
    expect(admin).toContain('actionType: "video_delete"');
    expect(admin).toContain("alreadyMissing");
  });

  it("stopVideoPromotion clears listing boost + cancels paid campaigns", () => {
    expect(helper).toContain("export async function stopVideoPromotion");
    expect(helper).toContain("isBoosted: false");
    expect(helper).toContain('campaignStatus: "cancelled"');
  });

  it("migrates username / videoBio / liked privacy / pin columns", () => {
    expect(migrations).toContain("users.username");
    expect(migrations).toContain("users.video_bio");
    expect(migrations).toContain("users.video_liked_public");
    expect(migrations).toContain("listings.video_pinned_at");
    expect(migrations).toContain("video username backfill");
  });

  it("feed supports creator handoff without inventing a second account model", () => {
    expect(feed).toContain("req.query.creator");
    expect(feed).toContain("publicVideoListingSql");
  });
});

describe("video profile UI contracts", () => {
  it("registers /videos/profile/:id and points Profile nav at video profile", () => {
    const app = readFileSync(join(marketplace, "App.tsx"), "utf8");
    const nav = readFileSync(join(marketplace, "components/PromoVideosBottomNav.tsx"), "utf8");
    const feedUi = readFileSync(join(marketplace, "pages/VideoFeed.tsx"), "utf8");
    const discover = readFileSync(join(marketplace, "pages/VideoDiscover.tsx"), "utf8");
    const favorites = readFileSync(join(marketplace, "pages/VideoFavorites.tsx"), "utf8");
    const profile = readFileSync(join(marketplace, "pages/Profile.tsx"), "utf8");
    const page = readFileSync(join(marketplace, "pages/VideoProfile.tsx"), "utf8");

    expect(app).toContain('path="/videos/profile/:id"');
    expect(nav).toContain("`/videos/profile/${user.id}`");
    expect(nav).toContain('pathname.startsWith("/videos/profile")');
    expect(feedUi).toContain("`/videos/profile/${video.sellerId}`");
    expect(feedUi).toContain("videoRef.current?.pause()");
    expect(feedUi).toContain("creatorIdRef");
    expect(feedUi).toContain("`&creator=${creatorIdRef.current}`");
    expect(discover).toContain("`/videos/profile/${v.sellerId}`");
    expect(favorites).toContain("`/videos/profile/${v.sellerId}`");
    expect(profile).toContain("flexa_video_profile_return");
    expect(profile).toContain('"video-profile"');
    expect(page).toContain('data-testid="video-profile-page"');
    expect(page).toContain("flexa_video_profile_return");
    expect(page).toContain("from=video-profile");
    expect(page).toContain("/api/admin/videos/");
  });

  it("ships en/fr/ht videoProfile strings", () => {
    for (const locale of ["en", "fr", "ht"] as const) {
      const src = readFileSync(join(marketplace, `i18n/locales/${locale}.ts`), "utf8");
      expect(src).toContain("videoProfile:");
      expect(src).toContain("viewShop:");
      expect(src).toContain("tabSaved:");
      expect(src).toContain("rejectReason:");
    }
  });
});
