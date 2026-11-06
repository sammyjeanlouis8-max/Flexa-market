import { describe, expect, it } from "vitest";
import {
  MUSIC_COMMERCE_ENABLED,
  musicListeningIsFree,
  musicPurchasesRequired,
  musicUploadsAreFree,
} from "./musicCommerce";

describe("musicCommerce kill-switch", () => {
  it("keeps commerce disabled by default so Flexa Music stays free", () => {
    // Without VITE_MUSIC_COMMERCE_ENABLED in the test env, flag stays false.
    expect(MUSIC_COMMERCE_ENABLED).toBe(false);
    expect(musicListeningIsFree()).toBe(true);
    expect(musicUploadsAreFree()).toBe(true);
    expect(musicPurchasesRequired()).toBe(false);
  });
});
