// query.js — GramaGIS Smart Query Engine
// All WFS calls go through Express backend to avoid CORS issues

var API_BASE = "http://localhost:3000";

// ── Layer registry ────────────────────────────────────────────────────────────
var layerMapping = {
    "bank":        "banks",
    "college":     "colleges",
    "fire":        "fire_stations",
    "office":      "government_offices",
    "hospital":    "hospitals",
    "hotel":       "hotels",
    "petrol":      "petrol_pumps",
    "police":      "police_stations",
    "post":        "post_offices",
    "restaurant":  "restaurants",
    "road":        "roads",
    "school":      "schools",
    "toilet":      "toilets",
    "ward":        "ward_boundary",
    "wards":       "wards"
};

// checkbox-id → exact GeoServer layer name
var LAYER_NAMES = {
    'banks':'Banks', 'colleges':'Colleges', 'fire_stations':'Fire Stations',
    'government_offices':'Government Offices', 'hospitals':'Hospitals',
    'hotels':'Hotels', 'petrol_pumps':'Petrol Pumps', 'police_stations':'Police Stations',
    'post_offices':'Post Offices', 'restaurants':'Restaurants', 'roads':'Roads',
    'schools':'Schools', 'toilets':'Toilets', 'ward_boundary':'Ward Boundary', 'wards':'Wards'
};

// ── Schema hint for Gemini ────────────────────────────────────────────────────
var DB_SCHEMA_HINT = `
You are a GeoServer CQL filter generator for a Panchayat GIS system called GramaGIS.

Available layers and their key attributes:
- banks              : name, ward_no, address
- colleges           : name, ward_no, address, status
- fire_stations      : name, ward_no, address, status
- government_offices : name, ward_no, address, status
- hospitals          : name, ward_no, address, status, date_established
- hotels             : name, ward_no, address, status
- petrol_pumps       : name, ward_no, address, status
- police_stations    : name, ward_no, address, status
- post_offices       : name, ward_no, address, status
- restaurants        : name, ward_no, address, status
- roads              : name, ward_no, road_type, status, date_established
- schools            : name, ward_no, address, status, date_established
- toilets            : name, ward_no, address, status
- ward_boundary      : ward_no, ward_name
- wards              : ward_no, ward_name

Rules:
- Respond ONLY with a JSON object — no markdown, no explanation.
- Format: { "layer": "<layer_key>", "cql": "<CQL filter string or empty string>" }
- Use ILIKE for text matching. Example: name ILIKE '%Sunrise%'
- Use = for exact numbers. Example: ward_no = 3
- Use AND to combine. Example: ward_no = 3 AND status = 'Active'
- If the query just asks to SHOW a layer with no filter, return cql: ""
- If you cannot map the query to any layer, return { "layer": null, "cql": "" }
`;

// ── Gemini call via backend ───────────────────────────────────────────────────
async function callGeminiNL2CQL(userQuery) {
    try {
        const response = await fetch(API_BASE + "/api/nlquery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: userQuery, schema: DB_SCHEMA_HINT })
        });
        if (!response.ok) throw new Error("Backend error: " + response.status);
        const data = await response.json();
        const cleaned = data.text.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (err) {
        console.error("Gemini NL2CQL error:", err);
        return null;
    }
}

// ── Keyword fallback ──────────────────────────────────────────────────────────
function keywordFallback(input) {
    let targetLayerKey = null;
    for (let keyword in layerMapping) {
        if (input.includes(keyword)) { targetLayerKey = layerMapping[keyword]; break; }
    }
    if (!targetLayerKey) return null;

    let filterParts = [];
    const wardMatch = input.match(/ward\s*(\d+)/);
    if (wardMatch) filterParts.push("ward_no = " + wardMatch[1]);
    if (input.includes("damaged") || input.includes("repair")) filterParts.push("status = 'damaged'");
    const yearMatch = input.match(/\d{4}/);
    if (yearMatch) {
        const y = yearMatch[0];
        if (input.includes("after"))       filterParts.push("date_established >= '" + y + "-01-01'");
        else if (input.includes("before")) filterParts.push("date_established <= '" + y + "-12-31'");
    }
    return { layer: targetLayerKey, cql: filterParts.join(" AND ") };
}

// ── Show toast notification ───────────────────────────────────────────────────
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show ' + (type || '');
    setTimeout(function() { t.className = ''; }, 3500);
}

// ── Main query function ───────────────────────────────────────────────────────
window.executeSmartQuery = async function(layers) {
    const inputField = document.getElementById('userInput');
    const input = inputField.value.trim();
    if (!input) return;

    const btn = document.getElementById('search-btn');
    btn.innerHTML = '<div class="btn-spinner"></div>';
    btn.disabled = true;

    // Step 1: AI or keyword parse
    let result = await callGeminiNL2CQL(input);
    if (!result || !result.layer) result = keywordFallback(input.toLowerCase());

    btn.innerHTML = '&#128269;';
    btn.disabled = false;

    if (!result || !result.layer) {
        showToast("No matching layer found. Try: 'hospitals in ward 3'", "error");
        return;
    }

    const { layer: layerKey, cql } = result;

    // Step 2: Reset all CQL filters
    Object.keys(layers).forEach(function(k) {
        if (layers[k].setParams && k !== 'world_map' && k !== 'panchayat_basemap') {
            layers[k].setParams({ CQL_FILTER: null });
        }
    });

    // Step 3: Apply filter + show layer
    if (layers[layerKey]) {
        if (cql) layers[layerKey].setParams({ CQL_FILTER: cql });
        if (!map.hasLayer(layers[layerKey])) {
            map.addLayer(layers[layerKey]);
            var cb = document.getElementById("check-" + layerKey);
            if (cb) cb.checked = true;
        }
        layers[layerKey].bringToFront();
        showToast("Showing: " + (LAYER_NAMES[layerKey] || layerKey) + (cql ? ' (filtered)' : ''), "success");
    }

    // Step 4: WFS zoom + info panel via backend proxy
    var geoName = LAYER_NAMES[layerKey] || layerKey;
    var wfsParams = "?layer=" + encodeURIComponent(geoName);
    if (cql) wfsParams += "&cql=" + encodeURIComponent(cql);

    try {
        const res  = await fetch(API_BASE + "/api/proxy/wfs" + wfsParams);
        const data = await res.json();

        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const geom    = feature.geometry;

            if (geom) {
                if (geom.type === "Point") {
                    map.setView([geom.coordinates[1], geom.coordinates[0]], 17);
                } else {
                    map.fitBounds(L.geoJSON(feature).getBounds(), { padding: [40,40] });
                }
            }

            showInfoPanel(feature.properties, layerKey);

            const highlight = L.geoJSON(feature, {
                style: { color:'#facc15', weight:5, fillOpacity:0.25 }
            }).addTo(map);
            setTimeout(function() { map.removeLayer(highlight); }, 4000);
        }
    } catch (err) {
        console.error("WFS proxy error:", err);
    }
};
