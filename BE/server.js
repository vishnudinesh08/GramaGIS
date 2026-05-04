import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import authRouter from "./routes/auth.js";
import feedbackRouter from "./routes/feedback.js";
import queryRouter from "./routes/query.js";
import proxyRouter from "./routes/proxy.js";
import { initializeAuthStore } from "./config/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const requiredEnv = ["JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

function getAllowedCorsOrigins() {
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "null"
  ];

  const configured = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...defaults, ...configured])];
}

const allowedCorsOrigins = new Set(getAllowedCorsOrigins());

app.use(cors({
  origin(origin, callback) {
    const isFileOrigin = typeof origin === "string" && origin.startsWith("file://");
    if (!origin || origin === "null" || isFileOrigin || allowedCorsOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed."));
  }
}));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "200kb" }));
app.use(express.text({ type: ["text/xml", "application/xml", "application/gml+xml"], limit: "200kb" }));

app.use("/FE", express.static(path.join(__dirname, "../FE")));

app.get("/", (req, res) => {
  res.redirect("/FE/html/index.html");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "GramaGIS Backend is running" });
});

app.use("/api/auth", authRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/nlquery", queryRouter);
app.use("/api/proxy", proxyRouter);

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
});

try {
  await initializeAuthStore();
  app.listen(PORT, () => {
    console.log(`GramaGIS backend running at http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to initialize server:", error.message);
  process.exit(1);
}

