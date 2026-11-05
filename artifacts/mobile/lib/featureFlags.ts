/**
 * Mobile feature flags. Keep dormant product code/routes intact so features
 * can be re-enabled later without restoring deleted APIs or screens.
 */

/** When false, Loan must not appear in any visible native navigation. */
export const LOANS_NAV_VISIBLE = false;

/** Route kept registered for future reactivation — do not delete loans.tsx. */
export const LOANS_ROUTE = "/loans" as const;
