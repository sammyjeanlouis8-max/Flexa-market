import { describe, expect, it } from "vitest";
import { CreateListingBody, UpdateListingBody } from "@workspace/api-zod";

const validListing = {
  title: "Portable fan",
  description: "A working portable fan.",
  price: 25,
  categoryId: 1,
  condition: "good" as const,
  location: "Delmas",
  images: ["/api/storage/objects/uploads/images/fan.jpg"],
};

describe("listing image contract", () => {
  it("requires at least one image when creating a listing", () => {
    expect(CreateListingBody.safeParse({
      ...validListing,
      images: [],
    }).success).toBe(false);
    expect(CreateListingBody.safeParse(validListing).success).toBe(true);
  });

  it("rejects an explicit empty image list on listing updates", () => {
    expect(UpdateListingBody.safeParse({ images: [] }).success).toBe(false);
    expect(UpdateListingBody.safeParse({ images: validListing.images }).success).toBe(true);
    expect(UpdateListingBody.safeParse({ title: "Updated fan" }).success).toBe(true);
  });
});