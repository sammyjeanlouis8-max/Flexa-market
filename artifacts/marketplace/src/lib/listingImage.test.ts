import assert from "node:assert/strict";
import test from "node:test";

const SIZES = {
  card: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px",
  mosaic: "(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px",
  detail: "(max-width: 768px) 100vw, min(640px, 50vw)",
} as const;

function listingImageProps(opts: {
  priority?: boolean;
  variant?: keyof typeof SIZES;
} = {}) {
  const variant = opts.variant ?? "card";
  const priority = !!opts.priority;
  return {
    loading: priority ? "eager" : "lazy",
    decoding: "async" as const,
    fetchPriority: priority ? "high" : "auto",
    sizes: SIZES[variant],
  };
}

test("priority cards load eagerly with high fetchPriority", () => {
  const props = listingImageProps({ priority: true });
  assert.equal(props.loading, "eager");
  assert.equal(props.fetchPriority, "high");
  assert.equal(props.decoding, "async");
  assert.equal(props.sizes, SIZES.card);
});

test("default cards are lazy", () => {
  const props = listingImageProps();
  assert.equal(props.loading, "lazy");
  assert.equal(props.fetchPriority, "auto");
});

test("mosaic and detail variants set distinct sizes", () => {
  assert.notEqual(listingImageProps({ variant: "mosaic" }).sizes, SIZES.card);
  assert.equal(listingImageProps({ variant: "detail" }).sizes, SIZES.detail);
});
