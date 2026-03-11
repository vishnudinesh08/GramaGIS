// routes/feedback.js - GET/POST/PATCH /api/feedback (PostgreSQL)

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { dbQuery, hasDbConfig } from "../db.js";

const router = Router();

const STATUS_ALIASES = {
  open: "not_resolved",
  closed: "resolved",
  not_resolved: "not_resolved",
  in_progress: "in_progress",
  resolved: "resolved",
};
const VALID_STATUSES = ["not_resolved", "in_progress", "resolved"];
const DB_CATEGORIES = [
  "road",
  "water",
  "sanitation",
  "electricity",
  "health",
  "drainage",
  "waste",
  "streetlight",
  "transport",
  "education",
  "building",
  "map_error",
  "missing_asset",
  "safety",
  "environment",
  "other"
];

const CATEGORY_ALIASES = {
  missing: "missing_asset",
  street_light: "streetlight",
  garbage: "waste",
  sewerage: "drainage",
};

function ensureDbConfigured(res) {
  if (hasDbConfig()) return true;
  res.status(503).json({
    error: "Database is not configured. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE in BE/.env."
  });
  return false;
}

function normalizeStatus(input) {
  const raw = String(input || "").trim().toLowerCase();
  return STATUS_ALIASES[raw] || null;
}

function mapFeedbackRow(row) {
  if (!row) return row;
  return { ...row, status: normalizeStatus(row.status) || row.status };
}

function normalizeCategory(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const mapped = CATEGORY_ALIASES[raw] || raw;
  return DB_CATEGORIES.includes(mapped) ? mapped : null;
}

function normalizeCategoryWithRaw(input) {
  if (!input) return { raw: null, normalized: null };
  const raw = String(input).trim().toLowerCase();
  const normalized = normalizeCategory(raw);
  return { raw, normalized };
}

function parseWard(input) {
  if (input == null) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;
  if (raw === "unknown") return 0;
  const match = raw.match(/(\d{1,3})/);
  if (!match) return null;
  const ward = Number(match[1]);
  return Number.isInteger(ward) && ward >= 0 ? ward : null;
}

function parseOptionalNumber(input) {
  if (input == null || input === "") return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function validateLonLat(longitude, latitude) {
  if (longitude == null && latitude == null) return { ok: true };
  if (longitude == null || latitude == null) {
    return { ok: false, error: "Both longitude and latitude must be provided together." };
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, error: "Longitude must be between -180 and 180." };
  }
  if (latitude < -90 || latitude > 90) {
    return { ok: false, error: "Latitude must be between -90 and 90." };
  }
  return { ok: true };
}

function buildListQuery(where) {
  return `
    SELECT
      id,
      category,
      ward,
      title,
      description,
      priority,
      status,
      reporter_name,
      reporter_phone,
      created_at,
      updated_at,
      longitude,
      latitude,
      CASE WHEN geom IS NULL THEN NULL ELSE ST_AsGeoJSON(geom)::json END AS geom,
      count(*) OVER() AS total_count
    FROM feedback
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE
        WHEN status IN ('resolved', 'closed') THEN 2
        WHEN status = 'in_progress' THEN 1
        ELSE 0
      END,
      created_at DESC
  `;
}

function mapRows(rows, hideReporterPhone) {
  const count = rows.length ? Number(rows[0].total_count) : 0;
  const items = rows.map(({ total_count, ...rest }) => {
    const mapped = mapFeedbackRow(rest);
    if (hideReporterPhone) {
      const { reporter_phone, ...safe } = mapped;
      return safe;
    }
    return mapped;
  });
  return { count, items };
}

async function listFeedback(req, res, hideReporterPhone) {
  const { status, priority, category, ward } = req.query;
  const where = [];
  const params = [];

  if (status) {
    const s = normalizeStatus(status);
    if (!s) return res.status(400).json({ error: "Invalid status." });
    if (s === "resolved") {
      where.push(`status IN ('resolved', 'closed')`);
    } else if (s === "not_resolved") {
      where.push(`status IN ('not_resolved', 'open')`);
    } else {
      params.push(s);
      where.push(`status = $${params.length}`);
    }
  }

  if (priority) {
    const p = String(priority).trim().toLowerCase();
    if (!["low", "medium", "high"].includes(p)) {
      return res.status(400).json({ error: "Invalid priority." });
    }
    params.push(p);
    where.push(`priority = $${params.length}`);
  }

  if (category) {
    const c = normalizeCategory(category);
    if (!c) return res.status(400).json({ error: "Invalid category." });
    params.push(c);
    where.push(`category = $${params.length}`);
  }

  if (ward != null && ward !== "") {
    const w = parseWard(ward);
    if (w == null) return res.status(400).json({ error: "Invalid ward." });
    params.push(w);
    where.push(`ward = $${params.length}`);
  }

  const { rows } = await dbQuery(buildListQuery(where), params);
  res.json(mapRows(rows, hideReporterPhone));
}

router.get("/public", async (req, res) => {
  if (!ensureDbConfigured(res)) return;
  try {
    await listFeedback(req, res, true);
  } catch (err) {
    console.error("Feedback PUBLIC GET error:", err);
    res.status(500).json({ error: "Failed to load feedback." });
  }
});

router.get("/", requireAuth, async (req, res) => {
  if (!ensureDbConfigured(res)) return;
  try {
    await listFeedback(req, res, false);
  } catch (err) {
    console.error("Feedback GET error:", err);
    res.status(500).json({ error: "Failed to load feedback." });
  }
});

router.post("/", async (req, res) => {
  if (!ensureDbConfigured(res)) return;

  try {
    const {
      reporter_name,
      reporter_phone,
      reporter_contact,
      category,
      ward,
      location_hint,
      title,
      description,
      priority,
      longitude,
      latitude,
    } = req.body || {};

    const missing = [];
    if (!category) missing.push("category");
    if (!ward && ward !== 0) missing.push("ward");
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(", ")}` });

    const { raw: rawCategory, normalized: c } = normalizeCategoryWithRaw(category);
    if (!c) return res.status(400).json({ error: "Invalid category." });

    const w = parseWard(ward);
    if (w == null) return res.status(400).json({ error: "Invalid ward." });

    const pRaw = String(priority || "low").trim().toLowerCase();
    const p = ["low", "medium", "high"].includes(pRaw) ? pRaw : "low";

    const name = String(reporter_name || "Anonymous").trim() || "Anonymous";
    const phone = String(reporter_phone || reporter_contact || "").trim() || null;

    const lon = parseOptionalNumber(longitude);
    const lat = parseOptionalNumber(latitude);
    const ll = validateLonLat(lon, lat);
    if (!ll.ok) return res.status(400).json({ error: ll.error });

    const t = String(title).trim();
    const desc = String(description).trim();
    const locHint = String(location_hint || "").trim();
    const categoryNote = rawCategory && rawCategory !== c ? `Reported category: ${rawCategory}\n` : "";
    const locationNote = locHint ? `Location/Landmark: ${locHint}\n` : "";
    const prefix = `${categoryNote}${locationNote}`.trim();
    const finalDesc = prefix ? `${prefix}\n\n${desc}` : desc;

    const insertSql = `
      INSERT INTO feedback (
        category, ward, title, description, priority, status,
        reporter_name, reporter_phone, longitude, latitude
      ) VALUES (
        $1, $2, $3, $4, $5, 'not_resolved',
        $6, $7, $8::double precision, $9::double precision
      )
      RETURNING id
    `;

    const { rows } = await dbQuery(insertSql, [c, w, t, finalDesc, p, name, phone, lon, lat]);
    res.status(201).json({ success: true, id: rows[0]?.id });
  } catch (err) {
    console.error("Feedback POST error:", err);
    res.status(500).json({ error: "Failed to submit feedback." });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  if (!ensureDbConfigured(res)) return;

  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id." });

    const normalized = normalizeStatus(req.body?.status);
    if (!normalized) return res.status(400).json({ error: "Invalid status." });

    const sql = `
      UPDATE feedback
      SET status = $1, updated_at = now()
      WHERE id = $2
      RETURNING
        id,
        category,
        ward,
        title,
        description,
        priority,
        status,
        reporter_name,
        reporter_phone,
        created_at,
        updated_at,
        longitude,
        latitude,
        CASE WHEN geom IS NULL THEN NULL ELSE ST_AsGeoJSON(geom)::json END AS geom
    `;
    const { rows } = await dbQuery(sql, [normalized, id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found." });
    res.json({ success: true, item: mapFeedbackRow(rows[0]) });
  } catch (err) {
    console.error("Feedback PATCH error:", err);
    res.status(500).json({ error: "Failed to update feedback." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  res.status(403).json({ error: "Deleting feedback is disabled for transparency." });
});

export default router;



