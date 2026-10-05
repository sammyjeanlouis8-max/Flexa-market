import { describe, expect, it } from "vitest";
import { listingCarriersForCountry } from "../../../marketplace/src/lib/listingCarriers";
import { CreateListingBody, UpdateListingBody } from "@workspace/api-zod";

describe("Dominican listing carrier choices and persisted fields", () => {
  it("offers verified Dominican carriers, not US carriers or FM drivers", () => {
    expect(listingCarriersForCountry("Dominican Republic")).toEqual([
      "Domex / Enviamex", "Vimenpaq", "Caribe Pack",
    ]);
  });
  it("preserves the existing US and other international choices", () => {
    expect(listingCarriersForCountry("USA")).toEqual(["UPS", "FedEx", "DHL", "USPS", "Other"]);
    expect(listingCarriersForCountry("Canada")).toEqual(listingCarriersForCountry("USA"));
  });
  it.each(["Domex / Enviamex", "Vimenpaq", "Caribe Pack"])(
    "accepts and preserves %s on create and update", carrier => {
      const shipping = { shippingCost: 5, shippingCarriers: [carrier], deliveryMethod: null };
      expect(CreateListingBody.parse({
        title: "Test product", description: "A test product description",
        price: 50, categoryId: 1, condition: "new", country: "Dominican Republic",
        city: "Santo Domingo", location: "Santo Domingo", images: ["https://example.test/product.jpg"],
        ...shipping,
      })).toMatchObject(shipping);
      expect(UpdateListingBody.parse(shipping)).toEqual(shipping);
    },
  );
});
