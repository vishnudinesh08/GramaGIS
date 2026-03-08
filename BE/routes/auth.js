// routes/auth.js — POST /api/auth/login

import { Router } from "express";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── Users ─────────────────────────────────────────────────────────────────────
// Plain-text passwords are fine for a local demo portal.
// If you deploy publicly, switch to bcrypt hashes.
const USERS = [
    {
        id: 1,
        username: "admin",
        password: "gramagis2024",
        role: "superadmin",
        displayName: "Super Admin"
    },
    {
        id: 2,
        username: "panchayat",
        password: "vazhathope",
        role: "editor",
        displayName: "Panchayat Editor"
    }
];

// POST /api/auth/login
router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const user = USERS.find(
        u => u.username === username.trim().toLowerCase() && u.password === password
    );

    if (!user) {
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

// GET /api/auth/me — verify current token
router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

export default router;
