import { describe, expect, it } from "vitest";
import { driverDocKeyFromRef, isDriverDocRef } from "../lib/driverDocRefs";

describe("driver identity document refs", () => {
  it("accepts didoc refs under driver-identity/", () => {
    expect(isDriverDocRef("didoc:driver-identity/42/cin/abc.jpg")).toBe(true);
    expect(driverDocKeyFromRef("didoc:driver-identity/42/cin/abc.jpg")).toBe("driver-identity/42/cin/abc.jpg");
  });

  it("rejects path traversal and non-identity keys", () => {
    expect(driverDocKeyFromRef("didoc:../etc/passwd")).toBeNull();
    expect(driverDocKeyFromRef("didoc:uploads/public.jpg")).toBeNull();
    expect(isDriverDocRef("https://cdn.example/public.jpg")).toBe(false);
  });
});
