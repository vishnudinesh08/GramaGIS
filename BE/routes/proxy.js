// routes/proxy.js — GeoServer WFS & WFS-T proxy
//
// GET  /api/proxy/wfs?layer=hospitals&cql=ward_no=3
//      → proxies to GeoServer WFS GetFeature (returns GeoJSON)
//
// POST /api/proxy/wfst  { layer, action, data, id }
//      → proxies WFS-T insert / update / delete to GeoServer
//      → requires JWT

import { Router } from "express";
import fetch from "node-fetch";
import { requireAuth } from "../middleware/auth.js";
import {
    GEOSERVER_URL, GEOSERVER_WORKSPACE,
    geoServerAuth, toLayerName, ALLOWED_LAYERS
} from "../config/geoserver.js";

const router = Router();

// ── GET /api/proxy/wfs ────────────────────────────────────────────────────────
router.get("/wfs", async (req, res) => {
    const { layer, cql, maxFeatures = 1000 } = req.query;

    if (!layer)                    return res.status(400).json({ error: "layer param is required." });
    if (!ALLOWED_LAYERS.has(layer)) return res.status(400).json({ error: `Unknown layer: ${layer}` });

    const typeName = `${GEOSERVER_WORKSPACE}:${toLayerName(layer)}`;
    const params   = new URLSearchParams({
        service:      "WFS",
        version:      "1.0.0",
        request:      "GetFeature",
        typeName,
        outputFormat: "application/json",
        maxFeatures:  String(maxFeatures)
    });
    if (cql && cql.trim()) params.set("CQL_FILTER", cql.trim());

    const url = `${GEOSERVER_URL}/${GEOSERVER_WORKSPACE}/ows?${params}`;

    try {
        const upstream = await fetch(url, { headers: { Authorization: geoServerAuth() } });
        if (!upstream.ok) {
            const txt = await upstream.text();
            console.error("GeoServer WFS error:", txt.slice(0, 300));
            return res.status(502).json({ error: "GeoServer returned an error." });
        }
        res.json(await upstream.json());
    } catch (err) {
        console.error("WFS proxy error:", err.message);
        res.status(502).json({ error: "Could not reach GeoServer." });
    }
});

// ── POST /api/proxy/wfst ──────────────────────────────────────────────────────
router.post("/wfst", requireAuth, async (req, res) => {
    const { layer, action, data, id } = req.body;

    if (!layer || !action)          return res.status(400).json({ error: "layer and action are required." });
    if (!ALLOWED_LAYERS.has(layer)) return res.status(400).json({ error: `Unknown layer: ${layer}` });
    if ((action === "update" || action === "delete") && !id)
        return res.status(400).json({ error: "id is required for update/delete." });

    const typeName = `${GEOSERVER_WORKSPACE}:${toLayerName(layer)}`;
    let xml;
    try { xml = buildWFST(typeName, action, data || {}, id); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const url = `${GEOSERVER_URL}/${GEOSERVER_WORKSPACE}/wfs`;

    try {
        const upstream = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/xml", Authorization: geoServerAuth() },
            body:    xml
        });
        const text = await upstream.text();
        if (!upstream.ok) {
            console.error("GeoServer WFS-T error:", text.slice(0, 300));
            return res.status(502).json({ error: "WFS-T request failed.", detail: text.slice(0, 200) });
        }
        res.json({ success: true, rawResponse: text });
    } catch (err) {
        console.error("WFS-T proxy error:", err.message);
        res.status(502).json({ error: "Could not reach GeoServer." });
    }
});

// ── WFS-T XML builder ─────────────────────────────────────────────────────────
function esc(v) {
    if (v == null) return "";
    return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                    .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

const SKIP = new Set(["id","gid","geom","the_geom","wkb_geometry"]);
const NS   = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction service="WFS" version="1.1.0"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.1.0/wfs.xsd">`;

function buildWFST(typeName, action, data, id) {
    const localName = typeName.split(":")[1];
    const props = Object.entries(data).filter(([k]) => !SKIP.has(k));

    if (action === "insert") {
        const fields = props.map(([k,v]) => `      <${localName}:${k}>${esc(v)}</${localName}:${k}>`).join("\n");
        return `${NS}\n  <wfs:Insert>\n    <${typeName}>\n${fields}\n    </${typeName}>\n  </wfs:Insert>\n</wfs:Transaction>`;
    }
    if (action === "update") {
        const fields = props.map(([k,v]) =>
            `    <wfs:Property>\n      <wfs:Name>${k}</wfs:Name>\n      <wfs:Value>${esc(v)}</wfs:Value>\n    </wfs:Property>`
        ).join("\n");
        return `${NS}\n  <wfs:Update typeName="${typeName}">\n${fields}\n    <ogc:Filter><ogc:FeatureId fid="${typeName}.${id}"/></ogc:Filter>\n  </wfs:Update>\n</wfs:Transaction>`;
    }
    if (action === "delete") {
        return `${NS}\n  <wfs:Delete typeName="${typeName}">\n    <ogc:Filter><ogc:FeatureId fid="${typeName}.${id}"/></ogc:Filter>\n  </wfs:Delete>\n</wfs:Transaction>`;
    }
    throw new Error(`Unknown action "${action}". Must be insert, update, or delete.`);
}

export default router;
