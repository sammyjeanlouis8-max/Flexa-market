import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

/**
 * Provider-neutral shipment snapshot.  The transaction remains the source of
 * truth for payment/order state; this table only describes carrier movement.
 */
export const shipmentsTable = pgTable("shipments", {
  trackingId: serial("tracking_id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  provider: text("provider").notNull().default("aftership"),
  providerTrackingId: text("provider_tracking_id"),
  carrier: text("carrier").notNull(),
  trackingNumber: text("tracking_number").notNull(),
  trackingStatus: text("tracking_status").notNull().default("label_created"),
  originCountry: text("origin_country"),
  destinationCountry: text("destination_country"),
  originPostalCode: text("origin_postal_code"),
  destinationPostalCode: text("destination_postal_code"),
  estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true }),
  lastLocation: text("last_location"),
  lastUpdate: timestamp("last_update", { withTimezone: true }),
  lastEventTimestamp: timestamp("last_event_timestamp", { withTimezone: true }),
  nextPollAt: timestamp("next_poll_at", { withTimezone: true }),
  rawSnapshot: jsonb("raw_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  providerTrackingUnique: uniqueIndex("shipments_provider_tracking_uidx")
    .on(t.provider, t.trackingNumber),
  orderUnique: uniqueIndex("shipments_order_uidx").on(t.orderId),
  pollDueIdx: index("shipments_poll_due_idx").on(t.nextPollAt, t.createdAt),
  orderIdx: index("shipments_order_idx").on(t.orderId),
  buyerIdx: index("shipments_buyer_idx").on(t.buyerId),
  sellerIdx: index("shipments_seller_idx").on(t.sellerId),
}));

export const shipmentEventsTable = pgTable("shipment_events", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => shipmentsTable.trackingId, { onDelete: "cascade" }),
  eventStatus: text("event_status").notNull(),
  eventDescription: text("event_description"),
  location: text("location"),
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
  carrierEventId: text("carrier_event_id"),
  rawEvent: jsonb("raw_event"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  carrierEventUnique: uniqueIndex("shipment_events_carrier_event_uidx")
    .on(t.shipmentId, t.carrierEventId),
  shipmentTimeIdx: index("shipment_events_shipment_time_idx")
    .on(t.shipmentId, t.eventTimestamp),
}));

export type Shipment = typeof shipmentsTable.$inferSelect;
export type ShipmentEvent = typeof shipmentEventsTable.$inferSelect;