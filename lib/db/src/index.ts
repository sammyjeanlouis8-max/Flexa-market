import pg from "pg";
import ws from "ws";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;
const isNeon =
  DATABASE_URL.includes("neon.tech") ||
  DATABASE_URL.includes(".neon.") ||
  DATABASE_URL.includes("neondb");

let _pool: InstanceType<typeof Pool> | NeonPool | null = null;

function createDb() {
  if (isNeon) {
    // Use @neondatabase/serverless WebSocket pool — supports transactions
    // and handles connection drops automatically without pgBouncer issues.
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: DATABASE_URL });
    _pool = pool;
    return drizzleNeon(pool, { schema });
  } else {
    const pool = new Pool({
      connectionString: DATABASE_URL,
      keepAlive: true,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 10000,
      max: 10,
      // DigitalOcean managed PostgreSQL uses a self-signed CA certificate that
      // is not in the default Node.js trust store. We require SSL but skip
      // hostname/chain verification so the connection works without bundling
      // the DO CA cert into the Docker image.
      ssl: DATABASE_URL.includes("ondigitalocean.com")
        ? { rejectUnauthorized: false }
        : undefined,
    });
    pool.on("error", (_err) => {
      // Prevent crash on idle client errors; pool reconnects automatically
    });
    _pool = pool;
    return drizzleNodePg(pool, { schema });
  }
}

export const db = createDb();
export const pool = _pool;

export * from "./schema";
