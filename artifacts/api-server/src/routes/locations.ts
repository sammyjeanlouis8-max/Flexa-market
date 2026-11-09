import { Router, type IRouter } from "express";
import { searchGeoPlaces } from "../lib/geoPlaces";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * GET /api/locations/autocomplete?q=&country=&limit=&lang=
 * Worldwide geographic autocomplete for Booster audience targeting.
 * Restricted to authenticated advertisers; results filtered to account country when provided.
 */
router.get("/locations/autocomplete", requireAuth, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 1) {
    res.json({ results: [] });
    return;
  }
  if (q.length > 80) {
    res.status(400).json({ error: "Query too long" });
    return;
  }

  // Prefer explicit query country, else advertiser profile country (market eligibility).
  const queryCountry = typeof req.query.country === "string" ? req.query.country.trim() : "";
  const profileCountry = (req.user as { country?: string | null } | undefined)?.country ?? null;
  const country = queryCountry || profileCountry || null;

  // Never allow targeting outside the advertiser's supported market country.
  if (queryCountry && profileCountry && queryCountry !== profileCountry) {
    res.status(400).json({
      error: "Location country must match your account advertising market",
    });
    return;
  }

  const limitRaw = parseInt(String(req.query.limit ?? "8"), 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 8;
  const lang = typeof req.query.lang === "string" ? req.query.lang : "en";

  try {
    const results = await searchGeoPlaces({ q, country, limit, lang });
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ results });
  } catch (err) {
    console.error("[locations/autocomplete]", err);
    res.status(502).json({ error: "Location search temporarily unavailable" });
  }
});

export default router;
