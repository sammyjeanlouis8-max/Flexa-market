/**
 * Firebase Android config gate for package com.flexamarket.app.
 * Never invent google-services.json fields — only validate files from Firebase Console.
 */

export const TARGET_ANDROID_PACKAGE = "com.flexamarket.app";
export const LEGACY_SUSPENDED_PACKAGE = "com.flexa.market";
export const FIREBASE_PROJECT_ID_EXPECTED = "flexa-market-8873a";

export type GoogleServicesClient = {
  client_info?: {
    mobilesdk_app_id?: string;
    android_client_info?: { package_name?: string };
  };
};

export type GoogleServicesJson = {
  project_info?: {
    project_id?: string;
    project_number?: string;
  };
  client?: GoogleServicesClient[];
};

export type FirebaseAndroidValidation = {
  ok: boolean;
  projectId: string | null;
  packages: string[];
  hasTargetPackage: boolean;
  hasLegacyPackageOnly: boolean;
  canWireGoogleServicesFile: boolean;
  reasons: string[];
};

export function listAndroidPackages(json: GoogleServicesJson | null | undefined): string[] {
  if (!json?.client?.length) return [];
  return json.client
    .map((c) => c?.client_info?.android_client_info?.package_name)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

export function validateGoogleServicesForTarget(
  json: GoogleServicesJson | null | undefined,
  targetPackage: string = TARGET_ANDROID_PACKAGE,
): FirebaseAndroidValidation {
  const reasons: string[] = [];
  if (!json || typeof json !== "object") {
    return {
      ok: false,
      projectId: null,
      packages: [],
      hasTargetPackage: false,
      hasLegacyPackageOnly: false,
      canWireGoogleServicesFile: false,
      reasons: ["google-services.json missing or unreadable"],
    };
  }

  const projectId = json.project_info?.project_id ?? null;
  const packages = listAndroidPackages(json);
  const hasTargetPackage = packages.includes(targetPackage);
  const hasLegacy = packages.includes(LEGACY_SUSPENDED_PACKAGE);
  const hasLegacyPackageOnly = hasLegacy && !hasTargetPackage;

  if (!projectId) reasons.push("project_info.project_id missing");
  if (projectId && projectId !== FIREBASE_PROJECT_ID_EXPECTED) {
    reasons.push(
      `unexpected project_id "${projectId}" (expected ${FIREBASE_PROJECT_ID_EXPECTED} unless Sammy confirms a different production project)`,
    );
  }
  if (!hasTargetPackage) {
    reasons.push(
      `Android package ${targetPackage} is not registered in this google-services.json`,
    );
  }
  if (hasLegacyPackageOnly) {
    reasons.push(
      `file only contains suspended package ${LEGACY_SUSPENDED_PACKAGE}; do not wire googleServicesFile`,
    );
  }
  if (packages.length === 0) reasons.push("no android client packages found");

  const canWireGoogleServicesFile = hasTargetPackage;
  const ok = hasTargetPackage && Boolean(projectId);

  return {
    ok,
    projectId,
    packages,
    hasTargetPackage,
    hasLegacyPackageOnly,
    canWireGoogleServicesFile,
    reasons: ok ? [] : reasons,
  };
}

/** True only when Expo app.json may safely reference googleServicesFile. */
export function shouldWireGoogleServicesFile(
  appPackage: string,
  json: GoogleServicesJson | null | undefined,
): boolean {
  if (appPackage !== TARGET_ANDROID_PACKAGE) return false;
  return validateGoogleServicesForTarget(json, TARGET_ANDROID_PACKAGE).canWireGoogleServicesFile;
}
