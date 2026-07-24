---
name: Flexa delivery listing lookup
description: Why delivery queries must resolve the listing through the transaction fallback
---
Rule: any query on `deliveriesTable` that needs the product (title, images) must join `listingsTable` on `COALESCE(deliveries.listingId, transactions.listingId)`, joining `transactionsTable` first.

**Why:** delivery creation only sets `listingId` when the client sends it, so older/most rows have it null — a direct join returns null title/image and the driver UI falls back to the generic "Colis" package icon.

**How to apply:** when adding any new delivery list/detail query in `artifacts/api-server/src/routes/delivery.ts` (Flexa-market GitHub repo), copy the COALESCE join pattern used by the browse/active/mine queries.
