// BE/routes/proxy.js
const express = require('express');
const router  = express.Router();
const fetch   = (...a) => import('node-fetch').then(({default:f}) => f(...a));

const GEO_BASE  = process.env.GEOSERVER_URL || 'http://localhost:8080/geoserver';
const GEO_USER  = process.env.GEOSERVER_USER || 'admin';
const GEO_PASS  = process.env.GEOSERVER_PASS || 'geoserver';
const WORKSPACE = 'gramagis';

function geoAuth() {
    return 'Basic ' + Buffer.from(GEO_USER + ':' + GEO_PASS).toString('base64');
}

// ── GET /api/proxy/wfs?layer=Hospitals&cql=ward_no=3 ─────────────────────────
router.get('/wfs', async (req, res) => {
    try {
        const layerName = req.query.layer;
        const cql       = req.query.cql || '';
        if (!layerName) return res.status(400).json({ error: 'layer param required' });

        let url = `${GEO_BASE}/${WORKSPACE}/ows`
            + `?service=WFS&version=1.0.0&request=GetFeature`
            + `&typeName=${WORKSPACE}:${encodeURIComponent(layerName)}`
            + `&outputFormat=application/json`
            + `&maxFeatures=200`;

        if (cql) url += `&CQL_FILTER=${encodeURIComponent(cql)}`;

        const geoRes = await fetch(url, {
            headers: { Authorization: geoAuth() }
        });
        if (!geoRes.ok) {
            const txt = await geoRes.text();
            return res.status(geoRes.status).json({ error: txt });
        }
        const data = await geoRes.json();
        res.json(data);
    } catch (err) {
        console.error('WFS proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/proxy/wfst  (transactional edits — admin only) ──────────────────
router.post('/wfst', async (req, res) => {
    try {
        const xml = req.body;
        if (!xml) return res.status(400).json({ error: 'XML body required' });

        const geoRes = await fetch(`${GEO_BASE}/wfs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml',
                Authorization: geoAuth()
            },
            body: xml
        });
        const text = await geoRes.text();
        res.status(geoRes.status).send(text);
    } catch (err) {
        console.error('WFS-T proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/proxy/wms  (optional — for future use) ───────────────────────────
router.get('/wms', async (req, res) => {
    try {
        const params = new URLSearchParams(req.query).toString();
        const url    = `${GEO_BASE}/wms?${params}`;
        const geoRes = await fetch(url, { headers: { Authorization: geoAuth() } });
        const buf    = await geoRes.buffer();
        res.set('Content-Type', geoRes.headers.get('content-type'));
        res.send(buf);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
