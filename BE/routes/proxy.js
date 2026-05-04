import { Router } from 'express';
import fetch from 'node-fetch';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

const GEO_BASE = process.env.GEOSERVER_URL || 'http://localhost:8080/geoserver';
const GEO_USER = process.env.GEOSERVER_USER || '';
const GEO_PASS = process.env.GEOSERVER_PASS || '';
const ENABLE_RAW_WFST = String(process.env.ENABLE_RAW_WFST || '').toLowerCase() === 'true';
const WORKSPACE = process.env.GEOSERVER_WORKSPACE || 'gramagis';

const LAYER_NAME_MAP = {
    atm: 'ATM',
    banks: 'Banks',
    colleges: 'Colleges',
    community_halls: 'Community halls',
    feedback: 'feedback',
    fire_stations: 'Fire Stations',
    government_offices: 'Government Offices',
    hospitals: 'Hospitals',
    hotels: 'Hotels',
    petrol_pumps: 'Petrol Pumps',
    police_stations: 'Police Stations',
    post_offices: 'Post Offices',
    restaurants: 'Restaurants',
    roads: 'Roads',
    schools: 'Schools',
    ward_boundary: 'Ward Boundary',
    wards: 'Wards'
};
const ALLOWED_LAYER_NAMES = new Set(Object.values(LAYER_NAME_MAP));

function geoAuth() {
    if (!GEO_USER || !GEO_PASS) return undefined;
    return 'Basic ' + Buffer.from(GEO_USER + ':' + GEO_PASS).toString('base64');
}

function buildGeoHeaders(extra = {}) {
    const auth = geoAuth();
    return auth ? { ...extra, Authorization: auth } : extra;
}

function normalizeLayerName(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const mapped = LAYER_NAME_MAP[raw];
    if (mapped) return mapped;
    const exact = Array.from(ALLOWED_LAYER_NAMES).find((name) => name.toLowerCase() === raw.toLowerCase());
    return exact || '';
}
function normalizeWmsLayerToken(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const withoutWorkspace = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;
    const normalized = normalizeLayerName(withoutWorkspace);
    if (!normalized) return '';
    return `${WORKSPACE}:${normalized}`;
}
function normalizeWmsLayerList(input) {
    const rawItems = String(input || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    if (!rawItems.length) return [];
    const normalizedItems = rawItems.map(normalizeWmsLayerToken).filter(Boolean);
    if (normalizedItems.length !== rawItems.length) return [];
    return normalizedItems;
}
function getQueryParam(query, ...keys) {
    for (const key of keys) {
        if (query[key] != null && query[key] !== '') return query[key];
        const match = Object.keys(query).find((candidate) => candidate.toLowerCase() === String(key).toLowerCase());
        if (match && query[match] != null && query[match] !== '') return query[match];
    }
    return undefined;
}
function buildSafeWmsParams(query) {
    const requestType = String(getQueryParam(query, 'request') || '').trim().toLowerCase();
    if (!requestType || !['getmap', 'getfeatureinfo'].includes(requestType)) {
        throw new Error('Unsupported WMS request.');
    }
    const layers = normalizeWmsLayerList(getQueryParam(query, 'layers'));
    if (!layers.length) {
        throw new Error('Invalid or unsupported WMS layer.');
    }
    const params = new URLSearchParams();
    params.set('service', 'WMS');
    params.set('request', requestType === 'getmap' ? 'GetMap' : 'GetFeatureInfo');
    params.set('version', String(getQueryParam(query, 'version') || '1.1.1'));
    params.set('layers', layers.join(','));
    if (requestType === 'getmap') {
        [
            ['styles'],
            ['format'],
            ['transparent'],
            ['height'],
            ['width'],
            ['srs', 'crs'],
            ['bbox']
        ].forEach((aliases) => {
            const value = getQueryParam(query, ...aliases);
            if (value != null && value !== '') params.set(aliases[0], String(value));
        });
        if (!params.get('format')) params.set('format', 'image/png');
        return params;
    }
    const queryLayers = normalizeWmsLayerList(
        getQueryParam(query, 'query_layers', 'queryLayers', 'layers')
    );
    if (!queryLayers.length) {
        throw new Error('Invalid or unsupported WMS query layer.');
    }
    [
        ['styles'],
        ['format'],
        ['transparent'],
        ['height'],
        ['width'],
        ['srs', 'crs'],
        ['bbox'],
        ['info_format'],
        ['x', 'i'],
        ['y', 'j']
    ].forEach((aliases) => {
        const value = getQueryParam(query, ...aliases);
        if (value != null && value !== '') params.set(aliases[0], String(value));
    });
    params.set('query_layers', queryLayers.join(','));
    if (!params.get('format')) params.set('format', 'image/png');
    if (!params.get('info_format')) params.set('info_format', 'application/json');
    return params;
}

function clampMaxFeatures(input, defaultValue = 200, maxValue = 1000) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) return String(defaultValue);
    return String(Math.min(Math.floor(parsed), maxValue));
}

function isSafeXmlFieldName(value) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

function requireEditor(req, res, next) {
    if (req.user?.role !== 'editor' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: 'Editor or superadmin access required.' });
    }
    next();
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function coerceValue(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function wktToGml(wkt, srsName = 'EPSG:4326') {
    const text = String(wkt || '').trim();
    if (!text) return '';

    const pointMatch = text.match(/^POINT\s*\(([-\d.]+)\s+([-\d.]+)\)$/i);
    if (pointMatch) {
        return `<gml:Point srsName="${escapeXml(srsName)}"><gml:coordinates decimal="." cs="," ts=" ">${pointMatch[1]},${pointMatch[2]}</gml:coordinates></gml:Point>`;
    }

    const lineMatch = text.match(/^LINESTRING\s*\((.+)\)$/i);
    if (lineMatch) {
        const coords = lineMatch[1].split(',').map((pair) => {
            const parts = pair.trim().split(/\s+/);
            return `${parts[0]},${parts[1]}`;
        }).join(' ');
        return `<gml:LineString srsName="${escapeXml(srsName)}"><gml:coordinates decimal="." cs="," ts=" ">${coords}</gml:coordinates></gml:LineString>`;
    }

    const polyMatch = text.match(/^POLYGON\s*\(\((.+)\)\)$/i);
    if (polyMatch) {
        const coords = polyMatch[1].split(',').map((pair) => {
            const parts = pair.trim().split(/\s+/);
            return `${parts[0]},${parts[1]}`;
        }).join(' ');
        return `<gml:Polygon srsName="${escapeXml(srsName)}"><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates decimal="." cs="," ts=" ">${coords}</gml:coordinates></gml:LinearRing></gml:outerBoundaryIs></gml:Polygon>`;
    }

    throw new Error('Unsupported geometry WKT. Use POINT, LINESTRING, or POLYGON.');
}

function inferPointWkt(properties) {
    const lon = properties.longitude ?? properties.lon ?? properties.x;
    const lat = properties.latitude ?? properties.lat ?? properties.y;
    if (lon === undefined || lat === undefined || lon === null || lat === null || lon === '') return '';
    const x = Number(lon);
    const y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
    return `POINT(${x} ${y})`;
}

function buildPropertyXml(properties) {
    return Object.entries(properties || {})
        .filter(([key, value]) =>
            key &&
            key !== 'id' &&
            key !== 'fid' &&
            key !== 'geometry_wkt' &&
            key !== 'geom' &&
            value !== undefined &&
            value !== null &&
            String(value).trim() !== '' &&
            isSafeXmlFieldName(key)
        )
        .map(([key, value]) => `<${WORKSPACE}:${key}>${escapeXml(coerceValue(value))}</${WORKSPACE}:${key}>`)
        .join('');
}

function buildInsertXml(layerName, properties, geometryWkt) {
    const safeProps = { ...(properties || {}) };
    const geometryXml = geometryWkt ? `<${WORKSPACE}:geom>${wktToGml(geometryWkt)}</${WORKSPACE}:geom>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction service="WFS" version="1.0.0"
 xmlns:wfs="http://www.opengis.net/wfs"
 xmlns:gml="http://www.opengis.net/gml"
 xmlns:ogc="http://www.opengis.net/ogc"
 xmlns:${WORKSPACE}="http://${WORKSPACE}.local">
  <wfs:Insert>
    <${WORKSPACE}:${escapeXml(layerName)}>
      ${geometryXml}
      ${buildPropertyXml(safeProps)}
    </${WORKSPACE}:${escapeXml(layerName)}>
  </wfs:Insert>
</wfs:Transaction>`;
}

function buildUpdateXml(layerName, featureId, properties, geometryWkt) {
    const sets = Object.entries(properties || {})
        .filter(([key, value]) =>
            key &&
            key !== 'id' &&
            key !== 'fid' &&
            key !== 'geometry_wkt' &&
            key !== 'geom' &&
            value !== undefined &&
            value !== null &&
            String(value).trim() !== '' &&
            isSafeXmlFieldName(key)
        )
        .map(([key, value]) => `
    <wfs:Property>
      <wfs:Name>${escapeXml(key)}</wfs:Name>
      <wfs:Value>${escapeXml(coerceValue(value))}</wfs:Value>
    </wfs:Property>`)
        .join('');

    const geomSet = geometryWkt ? `
    <wfs:Property>
      <wfs:Name>geom</wfs:Name>
      <wfs:Value>${wktToGml(geometryWkt)}</wfs:Value>
    </wfs:Property>` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction service="WFS" version="1.0.0"
 xmlns:wfs="http://www.opengis.net/wfs"
 xmlns:gml="http://www.opengis.net/gml"
 xmlns:ogc="http://www.opengis.net/ogc"
 xmlns:${WORKSPACE}="http://${WORKSPACE}.local">
  <wfs:Update typeName="${WORKSPACE}:${escapeXml(layerName)}">${sets}${geomSet}
    <ogc:Filter>
      <ogc:FeatureId fid="${escapeXml(featureId)}"/>
    </ogc:Filter>
  </wfs:Update>
</wfs:Transaction>`;
}

function buildDeleteXml(layerName, featureId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction service="WFS" version="1.0.0"
 xmlns:wfs="http://www.opengis.net/wfs"
 xmlns:gml="http://www.opengis.net/gml"
 xmlns:ogc="http://www.opengis.net/ogc"
 xmlns:${WORKSPACE}="http://${WORKSPACE}.local">
  <wfs:Delete typeName="${WORKSPACE}:${escapeXml(layerName)}">
    <ogc:Filter>
      <ogc:FeatureId fid="${escapeXml(featureId)}"/>
    </ogc:Filter>
  </wfs:Delete>
</wfs:Transaction>`;
}

async function forwardTransaction(xml) {
    const geoRes = await fetchWithTimeout(`${GEO_BASE}/wfs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            ...buildGeoHeaders()
        },
        body: xml
    }, 15000);

    const text = await geoRes.text();
    if (!geoRes.ok) {
        throw new Error(text || `GeoServer returned ${geoRes.status}`);
    }

    if (/exception|ServiceException|ows:ExceptionText/i.test(text)) {
        throw new Error(text);
    }

    return text;
}

function parseSchema(xml, featureData) {
    const attributes = [];
    const seen = new Set();
    const geometryTypes = [];
    const re = /<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"[^>]*nillable="([^"]+)"[^>]*>/g;
    let match;
    while ((match = re.exec(xml))) {
        const name = match[1];
        const type = match[2];
        if (name === 'boundedBy') continue;
        const isGeometry = /^gml:/i.test(type);
        if (!seen.has(name)) {
            seen.add(name);
            attributes.push({ name, type, nillable: String(match[3]).toLowerCase() === 'true', isGeometry });
            if (isGeometry) geometryTypes.push(type);
        }
    }

    const sampleKeys = new Set();
    (featureData.features || []).forEach((feature) => {
        Object.keys(feature.properties || {}).forEach((key) => sampleKeys.add(key));
        if (feature.geometry_name) sampleKeys.add(feature.geometry_name);
    });

    Array.from(sampleKeys).forEach((name) => {
        if (!seen.has(name)) {
            attributes.push({ name, type: 'xsd:string', nillable: true, isGeometry: name === 'geom' });
        }
    });

    const geometryField = attributes.find((attr) => attr.isGeometry)?.name || (featureData.features?.[0]?.geometry_name || 'geom');
    const geometryType = featureData.features?.[0]?.geometry?.type || geometryTypes[0] || null;
    return { attributes, geometryField, geometryType };
}

function buildWfsUrl(layerName, extraParams = {}) {
    const params = new URLSearchParams({
        service: 'WFS',
        version: '1.0.0',
        request: 'GetFeature',
        typeName: `${WORKSPACE}:${layerName}`,
        ...extraParams
    });
    return `${GEO_BASE}/${WORKSPACE}/ows?${params.toString()}`;
}

router.get('/wfs', async (req, res) => {
    try {
        const layerName = normalizeLayerName(req.query.layer);
        const cql = req.query.cql || '';
        if (!layerName) return res.status(400).json({ error: 'layer param required' });

        const extra = {
            outputFormat: 'application/json',
            maxFeatures: clampMaxFeatures(req.query.maxFeatures)
        };
        if (cql) extra.CQL_FILTER = cql;
        const url = buildWfsUrl(layerName, extra);

        const geoRes = await fetchWithTimeout(url, { headers: buildGeoHeaders() }, 12000);
        if (!geoRes.ok) {
            const txt = await geoRes.text();
            return res.status(geoRes.status).json({ error: txt });
        }

        const contentType = geoRes.headers.get('content-type') || '';
        const bodyText = await geoRes.text();
        if (!contentType.toLowerCase().includes('application/json')) {
            return res.status(502).json({ error: 'GeoServer returned non-JSON response for WFS request.', details: bodyText.slice(0, 800) });
        }

        try {
            res.json(JSON.parse(bodyText));
        } catch {
            res.status(502).json({ error: 'GeoServer returned invalid JSON for WFS request.', details: bodyText.slice(0, 800) });
        }
    } catch (err) {
        const message = err.name === 'AbortError' ? 'GeoServer WFS request timed out.' : err.message;
        console.error('WFS proxy error:', message);
        res.status(500).json({ error: message });
    }
});

router.get('/schema', requireAuth, requireEditor, async (req, res) => {
    try {
        const layerName = normalizeLayerName(req.query.layer);
        if (!layerName) return res.status(400).json({ error: 'layer param required' });

        const schemaUrl = `${GEO_BASE}/${WORKSPACE}/ows?service=WFS&version=1.1.0&request=DescribeFeatureType&typeName=${encodeURIComponent(`${WORKSPACE}:${layerName}`)}`;
        const sampleUrl = buildWfsUrl(layerName, { outputFormat: 'application/json', maxFeatures: '25' });
        const [schemaRes, sampleRes] = await Promise.all([
            fetchWithTimeout(schemaUrl, { headers: buildGeoHeaders() }, 12000),
            fetchWithTimeout(sampleUrl, { headers: buildGeoHeaders() }, 12000)
        ]);

        const schemaText = await schemaRes.text();
        if (!schemaRes.ok) return res.status(schemaRes.status).json({ error: schemaText });

        let sampleData = { features: [] };
        if (sampleRes.ok) {
            try {
                sampleData = JSON.parse(await sampleRes.text());
            } catch {
                sampleData = { features: [] };
            }
        }

        const parsed = parseSchema(schemaText, sampleData);
        res.json({ layer: layerName, ...parsed });
    } catch (err) {
        const message = err.name === 'AbortError' ? 'GeoServer schema request timed out.' : err.message;
        console.error('Schema proxy error:', message);
        res.status(500).json({ error: message });
    }
});

router.get('/download', requireAuth, requireEditor, async (req, res) => {
    try {
        const layerName = normalizeLayerName(req.query.layer);
        const format = String(req.query.format || 'geojson').toLowerCase();
        const cql = req.query.cql || '';
        if (!layerName) return res.status(400).json({ error: 'layer param required' });

        const formatMap = {
            geojson: { outputFormat: 'application/json', contentType: 'application/geo+json', ext: 'geojson' },
            json: { outputFormat: 'application/json', contentType: 'application/json', ext: 'json' },
            csv: { outputFormat: 'csv', contentType: 'text/csv', ext: 'csv' },
            kml: { outputFormat: 'application/vnd.google-earth.kml+xml', contentType: 'application/vnd.google-earth.kml+xml', ext: 'kml' }
        };
        const selected = formatMap[format] || formatMap.geojson;

        const extra = { outputFormat: selected.outputFormat, maxFeatures: '5000' };
        if (cql) extra.CQL_FILTER = cql;
        const url = buildWfsUrl(layerName, extra);
        const geoRes = await fetchWithTimeout(url, { headers: buildGeoHeaders() }, 20000);
        const body = Buffer.from(await geoRes.arrayBuffer());
        if (!geoRes.ok) return res.status(geoRes.status).send(body);

        res.status(200);
        res.set('Content-Type', selected.contentType);
        res.set('Content-Disposition', `attachment; filename="${layerName.replace(/\s+/g, '_').toLowerCase()}.${selected.ext}"`);
        res.send(body);
    } catch (err) {
        const message = err.name === 'AbortError' ? 'GeoServer download timed out.' : err.message;
        console.error('Download proxy error:', message);
        res.status(500).json({ error: message });
    }
});

router.post('/feature-edit', requireAuth, requireEditor, async (req, res) => {
    try {
        const layerName = normalizeLayerName(req.body.layer);
        const action = String(req.body.action || '').toLowerCase();
        const featureId = req.body.featureId;
        const properties = req.body.properties || {};
        let geometryWkt = String(req.body.geometryWkt || '').trim();

        if (!layerName) return res.status(400).json({ error: 'layer is required.' });
        if (!['insert', 'update', 'delete'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });

        if (!geometryWkt && action === 'insert') {
            geometryWkt = inferPointWkt(properties);
        }

        let xml = '';
        if (action === 'insert') {
            xml = buildInsertXml(layerName, properties, geometryWkt);
        } else if (action === 'update') {
            if (!featureId) return res.status(400).json({ error: 'featureId is required for update.' });
            xml = buildUpdateXml(layerName, featureId, properties, geometryWkt);
        } else {
            if (!featureId) return res.status(400).json({ error: 'featureId is required for delete.' });
            xml = buildDeleteXml(layerName, featureId);
        }

        const responseText = await forwardTransaction(xml);
        res.json({ success: true, action, responseText });
    } catch (err) {
        console.error('Feature edit proxy error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/wfst', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        if (!ENABLE_RAW_WFST) {
            return res.status(403).json({ error: 'Raw WFS-T proxy is disabled.' });
        }

        const xml = typeof req.body === 'string' ? req.body : '';
        if (!xml) return res.status(400).json({ error: 'XML body required' });
        const text = await forwardTransaction(xml);
        res.status(200).send(text);
    } catch (err) {
        const message = err.name === 'AbortError' ? 'GeoServer WFS-T request timed out.' : err.message;
        console.error('WFS-T proxy error:', message);
        res.status(500).json({ error: message });
    }
});

router.get('/wms-layers', requireAuth, requireEditor, async (req, res) => {
    try {
        const capUrl = `${GEO_BASE}/wms?service=WMS&request=GetCapabilities&version=1.1.1`;
        const geoRes = await fetchWithTimeout(capUrl, { headers: buildGeoHeaders() }, 12000);
        if (!geoRes.ok) {
            const txt = await geoRes.text();
            return res.status(geoRes.status).json({ error: txt });
        }

        const xml = await geoRes.text();
        const matches = xml.match(/<Name>[^<]+<\/Name>/g) || [];
        const names = matches
            .map((m) => m.replace('<Name>', '').replace('</Name>', '').trim())
            .filter((name) => name && !/^WMS$/i.test(name));

        res.json({ layers: Array.from(new Set(names)) });
    } catch (err) {
        const message = err.name === 'AbortError' ? 'GeoServer capabilities request timed out.' : err.message;
        console.error('WMS capabilities proxy error:', message);
        res.status(500).json({ error: message, layers: [] });
    }
});

router.get('/wms', async (req, res) => {
    try {
        const params = buildSafeWmsParams(req.query).toString();
        const url = `${GEO_BASE}/wms?${params}`;
        const geoRes = await fetchWithTimeout(url, { headers: buildGeoHeaders() }, 15000);
        const contentType = geoRes.headers.get('content-type') || 'application/octet-stream';
        const body = Buffer.from(await geoRes.arrayBuffer());
        res.status(geoRes.status);
        res.set('Content-Type', contentType);
        res.send(body);
    } catch (err) {
        const message = err.name === 'AbortError' ? 'GeoServer WMS request timed out.' : err.message;
        console.error('WMS proxy error:', message);
        res.status(500).json({ error: message });
    }
});

export default router;




