import jwt from "jsonwebtoken";
import { Router } from "express";
import { dbQuery, hasDbConfig } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { normalizeUsername, verifyPassword } from "../config/auth.js";

const router = Router();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function getClientKey(req) {
  return String(req.ip || req.headers["x-forwarded-for"] || "unknown");
}

function checkRateLimit(req, res) {
  const key = getClientKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.expiresAt <= now) {
    loginAttempts.set(key, { count: 0, expiresAt: now + LOGIN_WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfterSec = Math.ceil((entry.expiresAt - now) / 1000);
    res.set("Retry-After", String(Math.max(retryAfterSec, 1)));
    res.status(429).json({ error: "Too many login attempts. Please try again later." });
    return false;
  }

  return true;
}

function recordFailedAttempt(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.expiresAt <= now) {
    loginAttempts.set(key, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
    return;
  }

  entry.count += 1;
}

function clearFailedAttempts(req) {
  loginAttempts.delete(getClientKey(req));
}

router.post("/login", async (req, res) => {
  if (!checkRateLimit(req, res)) return;

  if (!hasDbConfig()) {
    return res.status(503).json({ error: "Authentication database is not configured." });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const normalizedUsername = normalizeUsername(username);
    const { rows } = await dbQuery(
      `SELECT id, username, password_hash, role, display_name, is_active
       FROM login
       WHERE username = $1
       LIMIT 1`,
      [normalizedUsername]
    );

    const user = rows[0];
    const valid = Boolean(user && user.is_active && verifyPassword(password, user.password_hash));

    if (!valid) {
      recordFailedAttempt(req);
      return res.status(401).json({ error: "Invalid username or password." });
    }

    clearFailedAttempts(req);

    await dbQuery(`UPDATE login SET last_login_at = now(), updated_at = now() WHERE id = $1`, [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({
      token,
      user: {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Auth login error:", error);
    res.status(500).json({ error: "Login failed." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;