import { describe, expect, it } from "vitest";
import {
  MUSIC_COMMERCE_ENABLED,
  musicListeningIsFree,
  musicUploadsAreFree,
} from "../lib/musicCommerce";

describe("musicCommerce kill-switch", () => {
  it("keeps commerce disabled so Flexa Music stays free", () => {
    expect(MUSIC_COMMERCE_ENABLED).toBe(false);
    expect(musicListeningIsFree()).toBe(true);
    expect(musicUploadsAreFree()).toBe(true);
  });
});
