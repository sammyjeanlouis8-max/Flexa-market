import { describe, expect, it } from "vitest";
import {
  hasUsableListingImage,
  keepPublicListingsWithPhotos,
} from "../lib/listingImageUrls";

describe("public list photo filter (#160 / #163)", () => {
  it("drops no-photo QA listings like #160 and #163 from the public feed", () => {
    const feed = keepPublicListingsWithPhotos([
      { id: 160, title: "Audit84 QA Tee", images: [] },
      { id: 163, title: "Batch6 test listing — Fanfan edit", images: [] },
      {
        id: 1,
        title: "Multi-Head Body Massager",
        images: [
          "https://res.cloudinary.com/dvkbgodbk/image/upload/v1/flexa-market/a.avif",
          "https://res.cloudinary.com/dvkbgodbk/image/upload/v1/flexa-market/b.webp",
        ],
      },
      {
        id: 46,
        title: "Baccarat rouge 540",
        images: ["https://res.cloudinary.com/dvkbgodbk/image/upload/v1/flexa-market/c.jpg"],
      },
      {
        id: 999,
        title: "placeholder only",
        images: ["https://placehold.co/400x400", ""],
      },
      {
        id: 152,
        title: "L'or",
        images: [
          "/api/storage/wasabi-image?key=uploads%2Fimages%2F90cccb24-e0c8-4bfa-ba16-ff883df6462d.jpeg",
        ],
      },
    ]);

    const ids = feed.map((l) => l.id);
    expect(ids).not.toContain(160);
    expect(ids).not.toContain(163);
    expect(ids).not.toContain(999);
    expect(ids).toEqual([1, 46, 152]);
  });

  it("keeps products that still have at least one displayable photo", () => {
    expect(
      hasUsableListingImage([
        "https://cdn.example.com/broken-primary.jpg",
        "https://cdn.example.com/fallback-second.jpg",
      ]),
    ).toBe(true);
    expect(
      keepPublicListingsWithPhotos([
        {
          id: 7,
          images: [
            "https://cdn.example.com/broken-primary.jpg",
            "https://cdn.example.com/fallback-second.jpg",
          ],
        },
      ]),
    ).toHaveLength(1);
  });
});
