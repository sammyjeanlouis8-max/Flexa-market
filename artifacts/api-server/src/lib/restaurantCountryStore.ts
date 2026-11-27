import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  restaurantComplianceDocumentsTable,
  restaurantComplianceRequirementTable,
  restaurantCountryAvailabilityTable,
  restaurantJurisdictionAvailabilityTable,
  restaurantRegulatoryAuditLogTable,
} from "@workspace/db";
import {
  RESTAURANT_COUNTRY_DEFAULTS,
  defaultCountryRow,
  mergeCountryRow,
  normalizeRestaurantCountryCode,
  type RestaurantCountryAvailabilityRow,
} from "./restaurantCountryPolicy";

export async function ensureRestaurantCountrySeeds(): Promise<void> {
  for (const row of RESTAURANT_COUNTRY_DEFAULTS) {
    await db.execute(sql`
      INSERT INTO restaurant_country_availability (
        country_code, country_name, status, enabled,
        restaurants_enabled, food_trucks_enabled, home_kitchens_enabled, catering_enabled,
        required_licenses_note, food_safety_requirements_note, regulatory_review_notes,
        suspension_reason
      ) VALUES (
        ${row.countryCode}, ${row.countryName}, ${row.status}, ${row.enabled},
        ${row.restaurantsEnabled}, ${row.foodTrucksEnabled}, ${row.homeKitchensEnabled}, ${row.cateringEnabled},
        ${row.requiredLicensesNote}, ${row.foodSafetyRequirementsNote}, ${row.regulatoryReviewNotes},
        ${row.suspensionReason}
      )
      ON CONFLICT (country_code) DO NOTHING
    `);
  }
}

export async function listRestaurantCountries(): Promise<RestaurantCountryAvailabilityRow[]> {
  try {
    await ensureRestaurantCountrySeeds();
    const rows = await db.select().from(restaurantCountryAvailabilityTable)
      .orderBy(restaurantCountryAvailabilityTable.countryCode);
    const mapped = rows.map((r) => mergeCountryRow({
      countryCode: r.countryCode,
      countryName: r.countryName,
      status: r.status as RestaurantCountryAvailabilityRow["status"],
      enabled: r.enabled,
      restaurantsEnabled: r.restaurantsEnabled,
      foodTrucksEnabled: r.foodTrucksEnabled,
      homeKitchensEnabled: r.homeKitchensEnabled,
      cateringEnabled: r.cateringEnabled,
      requiredLicensesNote: r.requiredLicensesNote,
      foodSafetyRequirementsNote: r.foodSafetyRequirementsNote,
      regulatoryReviewNotes: r.regulatoryReviewNotes,
      approvalDocumentUrl: r.approvalDocumentUrl,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      suspendedAt: r.suspendedAt?.toISOString() ?? null,
      suspensionReason: r.suspensionReason,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    }));
    // Ensure defaults appear even if insert raced
    const codes = new Set(mapped.map((m) => m.countryCode));
    for (const d of RESTAURANT_COUNTRY_DEFAULTS) {
      if (!codes.has(d.countryCode)) mapped.push(d);
    }
    return mapped;
  } catch {
    return RESTAURANT_COUNTRY_DEFAULTS.map((d) => ({ ...d }));
  }
}

export async function getRestaurantCountry(country: string): Promise<RestaurantCountryAvailabilityRow> {
  const code = normalizeRestaurantCountryCode(country);
  if (!code) return defaultCountryRow("");
  try {
    await ensureRestaurantCountrySeeds();
    const [row] = await db.select().from(restaurantCountryAvailabilityTable)
      .where(eq(restaurantCountryAvailabilityTable.countryCode, code))
      .limit(1);
    if (!row) return defaultCountryRow(code);
    return mergeCountryRow({
      countryCode: row.countryCode,
      countryName: row.countryName,
      status: row.status as RestaurantCountryAvailabilityRow["status"],
      enabled: row.enabled,
      restaurantsEnabled: row.restaurantsEnabled,
      foodTrucksEnabled: row.foodTrucksEnabled,
      homeKitchensEnabled: row.homeKitchensEnabled,
      cateringEnabled: row.cateringEnabled,
      requiredLicensesNote: row.requiredLicensesNote,
      foodSafetyRequirementsNote: row.foodSafetyRequirementsNote,
      regulatoryReviewNotes: row.regulatoryReviewNotes,
      approvalDocumentUrl: row.approvalDocumentUrl,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      suspendedAt: row.suspendedAt?.toISOString() ?? null,
      suspensionReason: row.suspensionReason,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    });
  } catch {
    return defaultCountryRow(code);
  }
}

export async function upsertRestaurantCountry(
  input: Partial<RestaurantCountryAvailabilityRow> & { countryCode: string },
  actorId: number,
): Promise<RestaurantCountryAvailabilityRow> {
  const code = normalizeRestaurantCountryCode(input.countryCode);
  const current = await getRestaurantCountry(code);
  const next = mergeCountryRow({ ...current, ...input, countryCode: code });
  const approvedAt =
    next.status === "approved" && next.enabled
      ? (current.approvedAt ? new Date(current.approvedAt) : new Date())
      : null;
  const suspendedAt =
    next.status === "suspended" || !next.enabled
      ? (next.status === "suspended" ? new Date() : current.suspendedAt ? new Date(current.suspendedAt) : null)
      : null;

  await db.execute(sql`
    INSERT INTO restaurant_country_availability (
      country_code, country_name, status, enabled,
      restaurants_enabled, food_trucks_enabled, home_kitchens_enabled, catering_enabled,
      required_licenses_note, food_safety_requirements_note, regulatory_review_notes,
      approval_document_url, approved_at, suspended_at, suspension_reason, updated_by, updated_at
    ) VALUES (
      ${next.countryCode}, ${next.countryName}, ${next.status}, ${next.enabled},
      ${next.restaurantsEnabled}, ${next.foodTrucksEnabled}, ${next.homeKitchensEnabled}, ${next.cateringEnabled},
      ${next.requiredLicensesNote}, ${next.foodSafetyRequirementsNote}, ${next.regulatoryReviewNotes},
      ${next.approvalDocumentUrl}, ${approvedAt}, ${suspendedAt}, ${next.suspensionReason},
      ${actorId}, NOW()
    )
    ON CONFLICT (country_code) DO UPDATE SET
      country_name = EXCLUDED.country_name,
      status = EXCLUDED.status,
      enabled = EXCLUDED.enabled,
      restaurants_enabled = EXCLUDED.restaurants_enabled,
      food_trucks_enabled = EXCLUDED.food_trucks_enabled,
      home_kitchens_enabled = EXCLUDED.home_kitchens_enabled,
      catering_enabled = EXCLUDED.catering_enabled,
      required_licenses_note = EXCLUDED.required_licenses_note,
      food_safety_requirements_note = EXCLUDED.food_safety_requirements_note,
      regulatory_review_notes = EXCLUDED.regulatory_review_notes,
      approval_document_url = EXCLUDED.approval_document_url,
      approved_at = EXCLUDED.approved_at,
      suspended_at = EXCLUDED.suspended_at,
      suspension_reason = EXCLUDED.suspension_reason,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `);

  await db.insert(restaurantRegulatoryAuditLogTable).values({
    actorId,
    action: "country_upsert",
    countryCode: next.countryCode,
    details: JSON.stringify({
      status: next.status,
      enabled: next.enabled,
      restaurantsEnabled: next.restaurantsEnabled,
      foodTrucksEnabled: next.foodTrucksEnabled,
      homeKitchensEnabled: next.homeKitchensEnabled,
    }),
  });

  return getRestaurantCountry(code);
}

export async function listJurisdictions(countryCode: string) {
  const code = normalizeRestaurantCountryCode(countryCode);
  return db.select().from(restaurantJurisdictionAvailabilityTable)
    .where(eq(restaurantJurisdictionAvailabilityTable.countryCode, code))
    .orderBy(desc(restaurantJurisdictionAvailabilityTable.updatedAt));
}

export async function upsertJurisdiction(
  input: {
    countryCode: string;
    level: string;
    name: string;
    status?: string;
    enabled?: boolean;
    restaurantsEnabled?: boolean;
    foodTrucksEnabled?: boolean;
    homeKitchensEnabled?: boolean;
    requiredLicensesNote?: string;
    regulatoryReviewNotes?: string;
    suspensionReason?: string | null;
  },
  actorId: number,
) {
  const code = normalizeRestaurantCountryCode(input.countryCode);
  const status = input.status || "not_reviewed";
  const enabled = !!input.enabled;
  await db.execute(sql`
    INSERT INTO restaurant_jurisdiction_availability (
      country_code, level, name, status, enabled,
      restaurants_enabled, food_trucks_enabled, home_kitchens_enabled,
      required_licenses_note, regulatory_review_notes, suspension_reason, updated_by, updated_at,
      approved_at, suspended_at
    ) VALUES (
      ${code}, ${input.level}, ${input.name}, ${status}, ${enabled},
      ${!!input.restaurantsEnabled}, ${!!input.foodTrucksEnabled}, ${!!input.homeKitchensEnabled},
      ${input.requiredLicensesNote || ""}, ${input.regulatoryReviewNotes || ""},
      ${input.suspensionReason || null}, ${actorId}, NOW(),
      ${status === "approved" && enabled ? sql`NOW()` : sql`NULL`},
      ${status === "suspended" ? sql`NOW()` : sql`NULL`}
    )
    ON CONFLICT (country_code, level, name) DO UPDATE SET
      status = EXCLUDED.status,
      enabled = EXCLUDED.enabled,
      restaurants_enabled = EXCLUDED.restaurants_enabled,
      food_trucks_enabled = EXCLUDED.food_trucks_enabled,
      home_kitchens_enabled = EXCLUDED.home_kitchens_enabled,
      required_licenses_note = EXCLUDED.required_licenses_note,
      regulatory_review_notes = EXCLUDED.regulatory_review_notes,
      suspension_reason = EXCLUDED.suspension_reason,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW(),
      approved_at = EXCLUDED.approved_at,
      suspended_at = EXCLUDED.suspended_at
  `);
  await db.insert(restaurantRegulatoryAuditLogTable).values({
    actorId,
    action: "jurisdiction_upsert",
    countryCode: code,
    details: JSON.stringify(input),
  });
  return listJurisdictions(code);
}

export async function listComplianceRequirements(countryCode: string) {
  const code = normalizeRestaurantCountryCode(countryCode);
  return db.select().from(restaurantComplianceRequirementTable)
    .where(eq(restaurantComplianceRequirementTable.countryCode, code));
}

export async function upsertComplianceRequirement(
  input: {
    countryCode: string;
    businessType?: string;
    requirementKey: string;
    label: string;
    required?: boolean;
    notes?: string;
  },
  actorId: number,
) {
  const code = normalizeRestaurantCountryCode(input.countryCode);
  const [row] = await db.insert(restaurantComplianceRequirementTable).values({
    countryCode: code,
    businessType: input.businessType || "*",
    requirementKey: input.requirementKey,
    label: input.label,
    required: input.required !== false,
    notes: input.notes || "",
  }).returning();
  await db.insert(restaurantRegulatoryAuditLogTable).values({
    actorId,
    action: "compliance_requirement_upsert",
    countryCode: code,
    details: JSON.stringify(input),
  });
  return row;
}

export async function listRegulatoryAuditLogs(limit = 100) {
  return db.select().from(restaurantRegulatoryAuditLogTable)
    .orderBy(desc(restaurantRegulatoryAuditLogTable.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
}

/** True when a mandatory verified permit is missing or expired. */
export async function hasBlockingExpiredOrMissingPermits(restaurantId: number, countryCode: string, businessType: string): Promise<boolean> {
  try {
    const code = normalizeRestaurantCountryCode(countryCode);
    const reqs = await db.select().from(restaurantComplianceRequirementTable)
      .where(eq(restaurantComplianceRequirementTable.countryCode, code));
    const required = reqs.filter((r) =>
      r.required && (r.businessType === "*" || r.businessType === businessType),
    );
    if (!required.length) return false;
    const docs = await db.select().from(restaurantComplianceDocumentsTable)
      .where(eq(restaurantComplianceDocumentsTable.restaurantId, restaurantId));
    const now = Date.now();
    for (const req of required) {
      const doc = docs.find((d) => d.requirementKey === req.requirementKey && d.status === "verified");
      if (!doc) return true;
      if (doc.expiresAt && doc.expiresAt.getTime() < now) return true;
    }
    return false;
  } catch {
    return false;
  }
}
