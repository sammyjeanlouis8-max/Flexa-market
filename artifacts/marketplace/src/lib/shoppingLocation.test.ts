import { afterEach, describe, expect, it } from "vitest";
import {
  SHOPPING_LOCATION_KEY,
  applyDetectedShoppingLocation,
  readShoppingLocation,
  setManualShoppingCity,
  setManualShoppingCountry,
} from "./shoppingLocation";

afterEach(() => {
  localStorage.removeItem(SHOPPING_LOCATION_KEY);
});

describe("shoppingLocation", () => {
  it("persists IP detection for guests", () => {
    const loc = applyDetectedShoppingLocation({ country: "USA", city: "West Palm Beach" });
    expect(loc?.country).toBe("USA");
    expect(loc?.city).toBe("West Palm Beach");
    expect(loc?.manual).toBe(false);
    expect(readShoppingLocation()?.country).toBe("USA");
  });

  it("never overwrites a manual destination with IP detection", () => {
    setManualShoppingCountry("Haiti", "Port-au-Prince");
    const afterDetect = applyDetectedShoppingLocation({ country: "USA", city: "Miami" });
    expect(afterDetect?.country).toBe("Haiti");
    expect(afterDetect?.city).toBe("Port-au-Prince");
    expect(afterDetect?.manual).toBe(true);
  });

  it("updates city while keeping manual flag", () => {
    setManualShoppingCountry("USA");
    const next = setManualShoppingCity("Miami, FL");
    expect(next?.country).toBe("USA");
    expect(next?.city).toBe("Miami, FL");
    expect(next?.manual).toBe(true);
  });

  it("rejects unsupported countries", () => {
    expect(applyDetectedShoppingLocation({ country: "Neverland" })).toBeNull();
    expect(readShoppingLocation()).toBeNull();
  });
});
