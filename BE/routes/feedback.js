// routes/feedback.js — GET/POST/PATCH/DELETE /api/feedback

import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

// ── In-memory store (seeded with sample data from edit.html) ─────────────────
let items = [
    { id:1, reporter_name:"Rajesh Kumar", reporter_contact:"", category:"road", ward:"Ward 2", location_hint:"Near GVHSS", title:"Potholes near school gate", description:"Road in front of GVHSS has large potholes since last monsoon. Very dangerous for school children.", priority:"high", status:"open", submitted_at:"2026-03-05T08:00:00.000Z" },
    { id:2, reporter_name:"Anonymous",    reporter_contact:"", category:"map_error", ward:"Ward 7", location_hint:"", title:"Hospital location is wrong on map", description:"Holy Cross Hospital pin on the map is about 200m off. Should be near the old bus stand.", priority:"medium", status:"open", submitted_at:"2026-03-04T12:00:00.000Z" },
    { id:3, reporter_name:"Meena S.",     reporter_contact:"", category:"missing", ward:"Ward 11", location_hint:"Near post office", title:"ATM not shown on map", description:"There is a new SBI ATM near the post office in Ward 11 that is not shown on the GramaGIS map.", priority:"low", status:"open", submitted_at:"2026-03-03T09:30:00.000Z" }
];
let nextId = 4;

// GET /api/feedback — list all (admin only)
router.get("/", requireAuth, (req, res) => {
    const { status, priority, category, ward } = req.query;
    let result = [...items];
    if (status)   result = result.filter(f => f.status   === status);
    if (priority) result = result.filter(f => f.priority === priority);
    if (category) result = result.filter(f => f.category === category);
    if (ward)     result = result.filter(f => f.ward     === ward);
    result.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    res.json({ count: result.length, items: result });
});

// POST /api/feedback — submit new (public)
router.post("/", (req, res) => {
    const { reporter_name, reporter_contact, category, ward, location_hint, title, description, priority } = req.body;

    const missing = [];
    if (!category)    missing.push("category");
    if (!ward)        missing.push("ward");
    if (!title)       missing.push("title");
    if (!description) missing.push("description");
    if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(", ")}` });

    const VALID_PRIORITIES = ["low","medium","high"];
    const VALID_CATEGORIES = ["road","map_error","missing","outdated","other"];
    if (!VALID_CATEGORIES.includes(category))
        return res.status(400).json({ error: `Invalid category.` });

    const item = {
        id:               nextId++,
        reporter_name:    (reporter_name || "Anonymous").trim(),
        reporter_contact: (reporter_contact || "").trim(),
        category,
        ward,
        location_hint:    (location_hint || "").trim(),
        title:            title.trim(),
        description:      description.trim(),
        priority:         VALID_PRIORITIES.includes(priority) ? priority : "low",
        status:           "open",
        submitted_at:     new Date().toISOString()
    };
    items.push(item);
    console.log(`[feedback] #${item.id} "${item.title}" (${item.priority})`);
    res.status(201).json({ success: true, id: item.id });
});

// PATCH /api/feedback/:id — update status (admin only)
router.patch("/:id", requireAuth, (req, res) => {
    const item = items.find(f => f.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: "Not found." });

    const VALID = ["open","in_progress","resolved","closed"];
    const { status } = req.body;
    if (status && !VALID.includes(status))
        return res.status(400).json({ error: `Invalid status.` });

    if (status) item.status = status;
    item.updated_at = new Date().toISOString();
    res.json({ success: true, item });
});

// DELETE /api/feedback/:id — superadmin only
router.delete("/:id", requireAuth, requireSuperAdmin, (req, res) => {
    const idx = items.findIndex(f => f.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ error: "Not found." });
    items.splice(idx, 1);
    res.json({ success: true });
});

export default router;
