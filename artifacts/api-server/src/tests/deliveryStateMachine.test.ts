/**
 * Phase 3 — Delivery state machine tests.
 *
 * These tests pin down the legal transitions. Any code change that breaks
 * one of them is either an intentional state-flow change (in which case the
 * test must be updated alongside) or a regression that would have produced
 * stuck deliveries / lost escrow in production.
 */
import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isDeliveryStatus,
  isTerminal,
  InvalidDeliveryTransitionError,
  ALL_DELIVERY_STATUSES,
} from "../lib/deliveryStateMachine";

describe("Phase 3 — Delivery state machine", () => {
  describe("type guard", () => {
    it("accepts every documented status", () => {
      for (const s of ALL_DELIVERY_STATUSES) {
        expect(isDeliveryStatus(s)).toBe(true);
      }
    });
    it("rejects garbage", () => {
      expect(isDeliveryStatus("")).toBe(false);
      expect(isDeliveryStatus("in_transit")).toBe(false); // legacy alias — not in our enum
      expect(isDeliveryStatus(null)).toBe(false);
      expect(isDeliveryStatus(42)).toBe(false);
    });
  });

  describe("happy path — full delivery cycle", () => {
    it("waiting → driver_assigned → picked_up → arrived → delivered → completed", () => {
      expect(canTransition("waiting", "driver_assigned")).toBe(true);
      expect(canTransition("driver_assigned", "picked_up")).toBe(true);
      expect(canTransition("picked_up", "arrived")).toBe(true);
      expect(canTransition("arrived", "delivered")).toBe(true);
      expect(canTransition("delivered", "completed")).toBe(true);
    });
  });

  describe("return cycle", () => {
    it("arrived → returning → returned", () => {
      expect(canTransition("arrived", "returning")).toBe(true);
      expect(canTransition("returning", "returned")).toBe(true);
    });
    it("failed_pickup → returning → returned", () => {
      expect(canTransition("failed_pickup", "returning")).toBe(true);
    });
  });

  describe("dispute entry/exit", () => {
    it("any active status can transition to disputed", () => {
      for (const s of [
        "waiting", "driver_assigned", "picked_up", "arrived",
        "delivered", "buyer_absent", "failed_pickup", "returning",
      ] as const) {
        expect(canTransition(s, "disputed")).toBe(true);
      }
    });
    it("terminal statuses cannot enter dispute", () => {
      expect(canTransition("completed", "disputed")).toBe(false);
      expect(canTransition("returned", "disputed")).toBe(false);
      expect(canTransition("cancelled", "disputed")).toBe(false);
    });
    it("disputed exits only to completed, returned, or cancelled (admin resolution)", () => {
      expect(canTransition("disputed", "completed")).toBe(true);
      expect(canTransition("disputed", "returned")).toBe(true);
      expect(canTransition("disputed", "cancelled")).toBe(true);
      expect(canTransition("disputed", "delivered")).toBe(false);
      expect(canTransition("disputed", "waiting")).toBe(false);
    });
  });

  describe("forbidden transitions (the regressions we are guarding against)", () => {
    it("delivered cannot go back to waiting / driver_assigned / picked_up", () => {
      expect(canTransition("delivered", "waiting")).toBe(false);
      expect(canTransition("delivered", "driver_assigned")).toBe(false);
      expect(canTransition("delivered", "picked_up")).toBe(false);
    });
    it("waiting cannot jump straight to completed (skipping driver assignment)", () => {
      expect(canTransition("waiting", "completed")).toBe(false);
    });
    it("completed is terminal — no transitions out", () => {
      for (const s of ALL_DELIVERY_STATUSES) {
        if (s === "completed") continue;
        expect(canTransition("completed", s)).toBe(false);
      }
    });
  });

  describe("idempotency", () => {
    it("status → same status is always allowed (safe re-write)", () => {
      for (const s of ALL_DELIVERY_STATUSES) {
        expect(canTransition(s, s)).toBe(true);
      }
    });
  });

  describe("terminal-status helper", () => {
    it("flags the four terminal statuses", () => {
      expect(isTerminal("completed")).toBe(true);
      expect(isTerminal("returned")).toBe(true);
      expect(isTerminal("seller_closed")).toBe(true);
      expect(isTerminal("cancelled")).toBe(true);
    });
    it("does not flag in-flight statuses", () => {
      expect(isTerminal("waiting")).toBe(false);
      expect(isTerminal("delivered")).toBe(false);
      expect(isTerminal("disputed")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("throws InvalidDeliveryTransitionError on forbidden transitions", () => {
      expect(() => assertTransition("delivered", "waiting")).toThrow(InvalidDeliveryTransitionError);
    });
    it("throws on unknown source statuses", () => {
      expect(() => assertTransition("garbage", "completed")).toThrow(InvalidDeliveryTransitionError);
    });
    it("does not throw on allowed transitions", () => {
      expect(() => assertTransition("waiting", "driver_assigned")).not.toThrow();
    });
  });
});
