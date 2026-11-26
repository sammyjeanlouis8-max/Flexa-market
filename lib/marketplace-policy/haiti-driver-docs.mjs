/**
 * Haiti Flexa Market driver application — required documents by vehicle type.
 * Shared by API (submit validation) and can be mirrored by the web wizard.
 */

/** @typedef {"moto" | "car" | "other" | string | null | undefined} VehicleType */

/**
 * Canonical document field keys stored on driver_applications.
 * @type {Record<string, { field: string, code: string, labelEn: string, labelHt: string, labelFr: string }>}
 */
export const HAITI_DRIVER_DOC_DEFS = {
  nationalId: {
    field: "photoNationalId",
    code: "national_id",
    labelEn: "National ID",
    labelHt: "Pyès idantite",
    labelFr: "Pièce d'identité",
  },
  selfieWithId: {
    field: "facePhotoHoldingId",
    code: "selfie_with_id",
    labelEn: "Selfie holding ID",
    labelHt: "Selfie ak pyès idantite",
    labelFr: "Selfie avec pièce d'identité",
  },
  licenseFront: {
    field: "photoLicenseFront",
    code: "license_front",
    labelEn: "Driver's license",
    labelHt: "Lisans chofè",
    labelFr: "Permis de conduire",
  },
  vehicleRegistration: {
    field: "photoVehicleRegistration",
    code: "vehicle_registration",
    labelEn: "Vehicle registration",
    labelHt: "Dokiman veyikil",
    labelFr: "Carte grise / immatriculation",
  },
};

/**
 * Required document codes for a vehicle type (Haiti program).
 * @param {VehicleType} vehicleType
 * @returns {string[]}
 */
export function requiredDocCodesForVehicle(vehicleType) {
  const vt = String(vehicleType || "").toLowerCase();
  const base = ["national_id", "selfie_with_id"];
  if (vt === "car" || vt === "motorcycle" || vt === "moto") {
    const docs = [...base, "vehicle_registration"];
    if (vt === "car") docs.push("license_front");
    return docs;
  }
  // "other" / unknown — still require identity + selfie with ID
  return base;
}

/**
 * @param {Record<string, unknown>} app  normalized application fields (camelCase)
 * @param {VehicleType} vehicleType
 * @param {string} [lang]  en | ht | fr
 */
export function findMissingDriverDocs(app, vehicleType, lang = "en") {
  const required = requiredDocCodesForVehicle(vehicleType);
  const byCode = Object.fromEntries(
    Object.values(HAITI_DRIVER_DOC_DEFS).map((d) => [d.code, d]),
  );
  const missing = [];
  for (const code of required) {
    const def = byCode[code];
    if (!def) continue;
    const val = app?.[def.field];
    if (!val || !String(val).trim()) {
      const label =
        lang === "ht" ? def.labelHt : lang === "fr" ? def.labelFr : def.labelEn;
      missing.push({ code: def.code, field: def.field, label });
    }
  }
  return missing;
}

/**
 * Legacy rows dual-wrote the same National ID URL into selfie fields.
 * @param {Record<string, unknown>} app
 */
export function isUncertainDriverPhotoAssignment(app) {
  const id = app?.photoNationalId ? String(app.photoNationalId) : "";
  const selfie = app?.photoIdSelfie ? String(app.photoIdSelfie) : "";
  const holding = app?.facePhotoHoldingId ? String(app.facePhotoHoldingId) : "";
  if (id) return false;
  if (selfie && holding && selfie === holding) return true;
  if (selfie && !holding) return true;
  if (holding && !selfie && !id) return true;
  return false;
}
