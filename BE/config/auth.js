import crypto from "crypto";
import { dbQuery, hasDbConfig } from "../db.js";

export const USER_TABLE = "login";

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, passwordHash) {
  const [scheme, salt, expectedHex] = String(passwordHash || "").split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;

  const actualHex = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export async function ensureAuthSchema() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS ${USER_TABLE} (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('superadmin', 'editor')),
      display_name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function getBootstrapUsers() {
  const users = [];

  const superadminUsername = firstEnv("AUTH_BOOTSTRAP_SUPERADMIN_USERNAME");
  const superadminPassword = firstEnv("AUTH_BOOTSTRAP_SUPERADMIN_PASSWORD");
  if (superadminUsername && superadminPassword) {
    users.push({
      username: normalizeUsername(superadminUsername),
      passwordHash: hashPassword(superadminPassword),
      role: "superadmin",
      displayName: firstEnv("AUTH_BOOTSTRAP_SUPERADMIN_DISPLAY_NAME") || "Super Admin",
    });
  }

  const editorUsername = firstEnv("AUTH_BOOTSTRAP_EDITOR_USERNAME");
  const editorPassword = firstEnv("AUTH_BOOTSTRAP_EDITOR_PASSWORD");
  if (editorUsername && editorPassword) {
    users.push({
      username: normalizeUsername(editorUsername),
      passwordHash: hashPassword(editorPassword),
      role: "editor",
      displayName: firstEnv("AUTH_BOOTSTRAP_EDITOR_DISPLAY_NAME") || "Editor",
    });
  }

  return users;
}

export async function seedBootstrapUsersIfNeeded() {
  const bootstrapUsers = getBootstrapUsers();
  if (!bootstrapUsers.length) return;

  for (const user of bootstrapUsers) {
    await dbQuery(
      `INSERT INTO ${USER_TABLE} (username, password_hash, role, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         display_name = EXCLUDED.display_name,
         is_active = TRUE,
         updated_at = now()`,
      [user.username, user.passwordHash, user.role, user.displayName]
    );
  }

  console.log(`Synchronized ${bootstrapUsers.length} bootstrap auth user(s).`);
}

export async function initializeAuthStore() {
  if (!hasDbConfig()) {
    throw new Error("Database is required for authentication. Configure DATABASE_URL or PG* variables in BE/.env.");
  }

  await ensureAuthSchema();
  await seedBootstrapUsersIfNeeded();
}
