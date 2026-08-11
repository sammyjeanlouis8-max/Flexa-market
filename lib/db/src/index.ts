import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;

// DigitalOcean managed PostgreSQL uses a self-signed CA — skip chain verification.
// Neon and other hosted providers use trusted certs so rejectUnauthorized stays true.
const sslConfig = DATABASE_URL.includes("ondigitalocean.com")
  ? { rejectUnauthorized: false }
  : true;

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig,
  keepAlive: true,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  max: 10,
});

pool.on("error", (_err) => {
  // Prevent crash on idle client errors; pool reconnects automatically
});

import { drizzle } from "drizzle-orm/node-postgres";
export const db = drizzle(pool, { schema });

export * from "./schema";
