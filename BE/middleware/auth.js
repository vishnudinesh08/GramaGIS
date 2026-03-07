// middleware/auth.js — JWT verification
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
    const header = req.headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header." });
    }
    const token = header.split(" ")[1];
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        const msg = err.name === "TokenExpiredError"
            ? "Session expired. Please log in again."
            : "Invalid token.";
        return res.status(401).json({ error: msg });
    }
}

export function requireSuperAdmin(req, res, next) {
    if (req.user?.role !== "superadmin") {
        return res.status(403).json({ error: "Superadmin access required." });
    }
    next();
}
