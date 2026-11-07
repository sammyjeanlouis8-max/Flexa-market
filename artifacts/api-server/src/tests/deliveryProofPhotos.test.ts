/**
 * Buyer-facing FM delivery proof photos.
 * Drivers upload pickup/dropoff URLs; order + tracking APIs must expose them
 * so the customer delivery pages can render proof after the company finishes.
 */
import { describe, expect, it } from "vitest";

type FmDeliveryPayload = {
  pickupPhotoUrl?: string | null;
  dropoffPhotoUrl?: string | null;
};

function buyerVisibleProofPhotos(delivery: FmDeliveryPayload | null | undefined) {
  const pickup = delivery?.pickupPhotoUrl?.trim() || null;
  const dropoff = delivery?.dropoffPhotoUrl?.trim() || null;
  return {
    pickupPhotoUrl: pickup,
    dropoffPhotoUrl: dropoff,
    hasProof: Boolean(pickup || dropoff),
  };
}

describe("buyerVisibleProofPhotos", () => {
  it("exposes dropoff proof after company handoff", () => {
    const visible = buyerVisibleProofPhotos({
      pickupPhotoUrl: " https://cdn.example/pickup.jpg ",
      dropoffPhotoUrl: "https://cdn.example/dropoff.jpg",
    });
    expect(visible.hasProof).toBe(true);
    expect(visible.dropoffPhotoUrl).toBe("https://cdn.example/dropoff.jpg");
    expect(visible.pickupPhotoUrl).toBe("https://cdn.example/pickup.jpg");
  });

  it("treats blank URLs as missing", () => {
    expect(buyerVisibleProofPhotos({ pickupPhotoUrl: "  ", dropoffPhotoUrl: null }).hasProof).toBe(false);
    expect(buyerVisibleProofPhotos(null).hasProof).toBe(false);
  });
});
