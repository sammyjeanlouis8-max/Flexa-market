import { describe, expect, it } from "vitest";
import {
  MUSIC_COMMERCE_ENABLED,
  musicListeningIsFree,
  musicUploadsAreFree,
  parseMusicCommerceEnabled,
} from "../lib/musicCommerce";

describe("musicCommerce kill-switch", () => {
  it("defaults commerce off when env is unset (module load)", () => {
    expect(MUSIC_COMMERCE_ENABLED).toBe(false);
    expect(musicListeningIsFree()).toBe(true);
    expect(musicUploadsAreFree()).toBe(true);
  });

  it("parseMusicCommerceEnabled only enables for true/1", () => {
    expect(parseMusicCommerceEnabled(undefined)).toBe(false);
    expect(parseMusicCommerceEnabled("")).toBe(false);
    expect(parseMusicCommerceEnabled("false")).toBe(false);
    expect(parseMusicCommerceEnabled("0")).toBe(false);
    expect(parseMusicCommerceEnabled("yes")).toBe(false);
    expect(parseMusicCommerceEnabled("true")).toBe(true);
    expect(parseMusicCommerceEnabled("TRUE")).toBe(true);
    expect(parseMusicCommerceEnabled("1")).toBe(true);
    expect(parseMusicCommerceEnabled(" 1 ")).toBe(true);
  });
});
