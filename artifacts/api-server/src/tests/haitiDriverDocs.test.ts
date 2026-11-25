import { describe, expect, it } from "vitest";
import {
  findMissingDriverDocs,
  isUncertainDriverPhotoAssignment,
  requiredDocCodesForVehicle,
} from "../../../../lib/marketplace-policy/haiti-driver-docs.mjs";

describe("haiti driver docs", () => {
  it("requires license for cars and registration for moto/car", () => {
    expect(requiredDocCodesForVehicle("car")).toEqual([
      "national_id",
      "selfie_with_id",
      "vehicle_registration",
      "license_front",
    ]);
    expect(requiredDocCodesForVehicle("moto")).toEqual([
      "national_id",
      "selfie_with_id",
      "vehicle_registration",
    ]);
    expect(requiredDocCodesForVehicle("other")).toEqual([
      "national_id",
      "selfie_with_id",
    ]);
  });

  it("returns missing doc labels in Haitian Creole", () => {
    const missing = findMissingDriverDocs(
      { photoNationalId: "x", facePhotoHoldingId: null, photoLicenseFront: null, photoVehicleRegistration: null },
      "car",
      "ht",
    );
    expect(missing.map((m: { code: string }) => m.code)).toContain("selfie_with_id");
    expect(missing.map((m: { code: string }) => m.code)).toContain("license_front");
    expect(missing.find((m: { code: string }) => m.code === "license_front")?.label).toMatch(/Lisans/i);
  });

  it("flags dual-written legacy selfie slots as uncertain", () => {
    expect(
      isUncertainDriverPhotoAssignment({
        photoNationalId: null,
        photoIdSelfie: "https://cdn/same.jpg",
        facePhotoHoldingId: "https://cdn/same.jpg",
      }),
    ).toBe(true);
    expect(
      isUncertainDriverPhotoAssignment({
        photoNationalId: "https://cdn/id.jpg",
        photoIdSelfie: null,
        facePhotoHoldingId: "https://cdn/selfie.jpg",
      }),
    ).toBe(false);
  });
});
