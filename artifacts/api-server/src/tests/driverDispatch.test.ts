import { describe, expect, it } from "vitest";
import {
  evaluateDispatchOffer,
  estimateTravelMinutes,
  isCommuneAuthorized,
  mergeZoneRule,
  parseAuthorizedCommunesJson,
  resolveDriverAuthorizedCommunes,
} from "../lib/driverDispatch";
import {
  communesEqual,
  defaultAuthorizedCommunes,
  findDepartmentForCommune,
  normalizeCommuneKey,
  resolveHaitiCommune,
} from "../lib/haitiGeography";

describe("haitiGeography", () => {
  it("normalizes accents and spacing", () => {
    expect(normalizeCommuneKey("Pétion-Ville")).toBe("petionville");
    expect(normalizeCommuneKey("  Delmas  ")).toBe("delmas");
    expect(communesEqual("Cap-Haïtien", "cap haitien")).toBe(true);
  });

  it("resolves communes to department", () => {
    expect(resolveHaitiCommune("carrefour")).toEqual({ commune: "Carrefour", department: "Ouest" });
    expect(findDepartmentForCommune("Delmas")).toBe("Ouest");
    expect(resolveHaitiCommune("NotACity")).toBeNull();
  });

  it("defaults Carrefour zone to metro neighbors only", () => {
    expect(defaultAuthorizedCommunes("Carrefour")).toEqual([
      "Carrefour", "Port-au-Prince", "Delmas",
    ]);
  });
});

describe("driverDispatch authorization", () => {
  it("parses authorized communes JSON safely", () => {
    expect(parseAuthorizedCommunesJson('["Delmas","Tabarre"]')).toEqual(["Delmas", "Tabarre"]);
    expect(parseAuthorizedCommunesJson("not-json")).toEqual([]);
    expect(parseAuthorizedCommunesJson(null)).toEqual([]);
  });

  it("resolves explicit authorized list over primary defaults", () => {
    expect(resolveDriverAuthorizedCommunes({
      authorizedCommunes: ["Delmas", "Tabarre"],
      primaryCommune: "Carrefour",
    })).toEqual(["Delmas", "Tabarre"]);
  });

  it("falls back to default neighbors from primary commune", () => {
    expect(resolveDriverAuthorizedCommunes({ primaryCommune: "Carrefour" })).toEqual([
      "Carrefour", "Port-au-Prince", "Delmas",
    ]);
  });

  it("mergeZoneRule always includes primary commune", () => {
    expect(mergeZoneRule("Carrefour", ["Port-au-Prince"])).toEqual([
      "Carrefour", "Port-au-Prince",
    ]);
  });

  it("never treats GPS proximity as commune permission", () => {
    const decision = evaluateDispatchOffer(
      {
        status: "active",
        isOnline: true,
        country: "Haiti",
        primaryCommune: "Carrefour",
        authorizedCommunes: ["Carrefour", "Port-au-Prince", "Delmas"],
        latitude: 18.55,
        longitude: -72.3,
        hasActiveAssignment: false,
      },
      {
        pickupCity: "Jacmel",
        deliveryCity: "Jacmel",
        country: "Haiti",
        deliveryMethod: "motorcycle",
        status: "waiting",
        pickupLat: 18.55,
        pickupLng: -72.3,
      },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("pickup_unauthorized");
  });

  it("allows authorized pickup and destination", () => {
    const decision = evaluateDispatchOffer(
      {
        status: "active",
        country: "Haiti",
        primaryCommune: "Carrefour",
        authorizedCommunes: ["Carrefour", "Port-au-Prince", "Delmas"],
        hasActiveAssignment: false,
      },
      {
        pickupCity: "Delmas",
        deliveryCity: "Port-au-Prince",
        country: "Haiti",
        deliveryMethod: "motorcycle",
        status: "waiting",
      },
    );
    expect(decision.allowed).toBe(true);
    expect(decision.pickupCanonical).toBe("Delmas");
    expect(decision.destinationCanonical).toBe("Port-au-Prince");
  });

  it("blocks unauthorized destination even when pickup is allowed", () => {
    const decision = evaluateDispatchOffer(
      {
        status: "active",
        country: "Haiti",
        primaryCommune: "Carrefour",
        authorizedCommunes: ["Carrefour", "Port-au-Prince", "Delmas"],
      },
      {
        pickupCity: "Delmas",
        deliveryCity: "Jacmel",
        country: "Haiti",
        deliveryMethod: "motorcycle",
        status: "waiting",
      },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("destination_unauthorized");
  });

  it("blocks suspended / busy / offline / non-waiting offers", () => {
    const busy = evaluateDispatchOffer(
      { status: "active", hasActiveAssignment: true, primaryCommune: "Delmas", authorizedCommunes: ["Delmas"] },
      { pickupCity: "Delmas", deliveryCity: "Delmas", country: "Haiti", deliveryMethod: "motorcycle", status: "waiting" },
    );
    expect(busy.reasons).toContain("driver_busy");

    const suspended = evaluateDispatchOffer(
      { status: "suspended", primaryCommune: "Delmas", authorizedCommunes: ["Delmas"] },
      { pickupCity: "Delmas", deliveryCity: "Delmas", country: "Haiti", deliveryMethod: "motorcycle", status: "waiting" },
    );
    expect(suspended.reasons).toContain("driver_not_active");

    const offline = evaluateDispatchOffer(
      { status: "active", isOnline: false, primaryCommune: "Delmas", authorizedCommunes: ["Delmas"] },
      { pickupCity: "Delmas", deliveryCity: "Delmas", country: "Haiti", deliveryMethod: "motorcycle", status: "waiting" },
      { requireOnline: true },
    );
    expect(offline.reasons).toContain("driver_offline");

    const taken = evaluateDispatchOffer(
      { status: "active", primaryCommune: "Delmas", authorizedCommunes: ["Delmas"] },
      { pickupCity: "Delmas", deliveryCity: "Delmas", country: "Haiti", deliveryMethod: "motorcycle", status: "driver_assigned" },
    );
    expect(taken.reasons).toContain("offer_not_waiting");
  });

  it("enforces optional max distance without granting unauthorized communes", () => {
    const decision = evaluateDispatchOffer(
      {
        status: "active",
        primaryCommune: "Delmas",
        authorizedCommunes: ["Delmas"],
        latitude: 18.55,
        longitude: -72.3,
      },
      {
        pickupCity: "Delmas",
        deliveryCity: "Delmas",
        country: "Haiti",
        deliveryMethod: "motorcycle",
        status: "waiting",
        pickupLat: 18.7,
        pickupLng: -72.3,
      },
      { maxDistanceKm: 5 },
    );
    expect(decision.reasons).toContain("distance_exceeds_limit");
    expect(decision.distanceFromDriverKm).not.toBeNull();
  });

  it("estimates travel minutes from distance", () => {
    expect(estimateTravelMinutes(null)).toBeNull();
    expect(estimateTravelMinutes(0)).toBe(5);
    expect(estimateTravelMinutes(11)).toBeGreaterThanOrEqual(5);
  });

  it("isCommuneAuthorized matches canonically", () => {
    expect(isCommuneAuthorized(["Pétion-Ville"], "petionville")).toBe(true);
    expect(isCommuneAuthorized(["Delmas"], "Jacmel")).toBe(false);
  });
});
