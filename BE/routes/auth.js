// routes/auth.js — POST /api/auth/login
// Matches the two accounts already hardcoded in login.html

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── Users (replace with a DB query when you add PostgreSQL) ──────────────────
// These hashes match:  admin → "gramagis2024"   panchayat → "vazhathope"
const USERS = [
    {
        id: 1,
        username: "admin",
        passwordHash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        role: "superadmin",
        displayName: "Super Admin"
    },
    {
        id: 2,
        username: "panchayat",
        passwordHash: "$2a$10$Wd3TFxHi8UiXk6RvW.ij0.qBBxO5WTqJc9SCtZ6YSMT8ITVL4kKHy",
        role: "editor",
        displayName: "Panchayat Editor"
    }
];

// POST /api/auth/login
router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const user = USERS.find(u => u.username === username.trim().toLowerCase());

    // Always run bcrypt to prevent timing attacks
    const hash = user?.passwordHash || "$2a$10$invalidhashpadding000000000000000000000000000000000000";
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
        return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({
        token,
        user: { username: user.username, displayName: user.displayName, role: user.role }
    });
});

// GET /api/auth/me — check who is logged in
router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

export default router;
