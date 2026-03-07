// server.js — GramaGIS Express Backend
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes    from "./routes/auth.js";
import queryRoutes   from "./routes/query.js";
import proxyRoutes   from "./routes/proxy.js";
import feedbackRoutes from "./routes/feedback.js";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/nlquery",  queryRoutes);
app.use("/api/proxy",    proxyRoutes);
app.use("/api/feedback", feedbackRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    console.log(`\n🌿 GramaGIS backend → http://localhost:${PORT}`);
    console.log(`   POST /api/auth/login`);
    console.log(`   POST /api/nlquery`);
    console.log(`   GET  /api/proxy/wfs?layer=hospitals`);
    console.log(`   POST /api/proxy/wfst`);
    console.log(`   GET  /api/feedback`);
    console.log(`   POST /api/feedback\n`);
});
