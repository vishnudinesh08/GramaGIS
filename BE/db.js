import { Pool } from "pg";

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

export function hasDbConfig() {
  return Boolean(
    firstEnv("DATABASE_URL") ||
      (
        firstEnv("PGHOST", "DB_HOST") &&
        firstEnv("PGUSER", "DB_USER") &&
        firstEnv("PGPASSWORD", "DB_PASSWORD") &&
        firstEnv("PGDATABASE", "DB_NAME")
      )
  );
}

function buildPoolConfig() {
  const databaseUrl = firstEnv("DATABASE_URL");
  if (databaseUrl) {
    const ssl =
      process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: false }
        : undefined;
    return { connectionString: databaseUrl, ssl };
  }

  const cfg = {};
  const host = firstEnv("PGHOST", "DB_HOST");
  const portValue = firstEnv("PGPORT", "DB_PORT");
  const user = firstEnv("PGUSER", "DB_USER");
  const password = firstEnv("PGPASSWORD", "DB_PASSWORD");
  const database = firstEnv("PGDATABASE", "DB_NAME");

  if (host) cfg.host = host;
  if (portValue) {
    const port = Number(portValue);
    if (Number.isFinite(port)) cfg.port = port;
  }
  if (user) cfg.user = user;
  if (typeof password === "string") cfg.password = password;
  if (database) cfg.database = database;

  return cfg;
}

export const pool = new Pool(buildPoolConfig());

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

export async function dbQuery(text, params) {
  return pool.query(text, params);
}
