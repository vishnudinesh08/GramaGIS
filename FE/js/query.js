// query.js  —  GramaGIS Smart Query Engine
// Fixes:
//   1. filterParts declared BEFORE year-filter block (was used before declaration)
//   2. Gemini API replaces the old keyword-only matching

// ─── Layer registry ───────────────────────────────────────────────────────────
const layerMapping = {
    "bank":        "banks",
    "boundary":    "boundaries",
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
    "ward":        "ward_boundary"
};

// ─── Schema hint injected into every Gemini prompt ───────────────────────────
// Tells Gemini which layers and columns exist so it can produce valid CQL.
const DB_SCHEMA_HINT = `
You are a GeoServer CQL filter generator for a Panchayat GIS system called GramaGIS.

Available layers and their key attributes:
- banks            : name, ward_no, address
- boundaries       : name, ward_no
- colleges         : name, ward_no, address, status
- fire_stations    : name, ward_no, address, status
- government_offices : name, ward_no, address, status
- hospitals        : name, ward_no, address, status, date_established
- hotels           : name, ward_no, address, status
- petrol_pumps     : name, ward_no, address, status
- police_stations  : name, ward_no, address, status
- post_offices     : name, ward_no, address, status
- restaurants      : name, ward_no, address, status
- roads            : name, ward_no, road_type, status, date_established
- schools          : name, ward_no, address, status, date_established
- toilets          : name, ward_no, address, status
- ward_boundary    : ward_no, ward_name

Rules:
- Respond ONLY with a JSON object — no markdown, no explanation.
- Format: { "layer": "<layer_key>", "cql": "<CQL filter string or empty string>" }
- Use ILIKE for text matching (case-insensitive). Example: name ILIKE '%Sunrise%'
- Use = for exact matches. Example: ward_no = 3
- Use AND to combine conditions. Example: ward_no = 3 AND status = 'damaged'
- For date filters use: date_established >= '2010-01-01'
- If the query just asks to SHOW a layer with no filter, return an empty cql string "".
- If you cannot map the query to any layer, return { "layer": null, "cql": "" }
`;

// ─── Gemini API call ──────────────────────────────────────────────────────────
// Calls the Express.js backend proxy at /api/nlquery so the Gemini key
// never leaks to the browser.  The backend forwards to Gemini and returns
// the raw text response.
async function callGeminiNL2CQL(userQuery) {
    try {
        const response = await fetch("/api/nlquery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: userQuery, schema: DB_SCHEMA_HINT })
        });
        if (!response.ok) throw new Error(`Backend error: ${response.status}`);
        const data = await response.json();
        // data.text is the raw string Gemini returned
        const cleaned = data.text.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (err) {
        console.error("Gemini NL2CQL error:", err);
        return null;
    }
}

// ─── Fallback: keyword-only parser (used when Gemini is unavailable) ──────────
// FIX: filterParts is now declared FIRST, before the year-filter block uses it.
function keywordFallback(input) {
    let targetLayerKey = null;
    for (let keyword in layerMapping) {
        if (input.includes(keyword)) {
            targetLayerKey = layerMapping[keyword];
            break;
        }
    }
    if (!targetLayerKey) return null;

    // FIX: declare filterParts HERE, before the year block references it
    let filterParts = [];

    // Year filter
    const yearMatch = input.match(/\d{4}/);
    if (yearMatch) {
        const year = yearMatch[0];
        if (input.includes("after") || input.includes("newer")) {
            filterParts.push(`date_established >= '${year}-01-01'`);
        } else if (input.includes("before") || input.includes("older")) {
            filterParts.push(`date_established <= '${year}-12-31'`);
        } else {
            filterParts.push(`date_established >= '${year}-01-01' AND date_established <= '${year}-12-31'`);
        }
    }

    // Status filter
    if (input.includes("damaged") || input.includes("repair")) {
        filterParts.push("status = 'damaged'");
    }

    // Ward filter
    const wardMatch = input.match(/ward\s*(\d+)/);
    if (wardMatch) {
        filterParts.push(`ward_no = ${wardMatch[1]}`);
    }

    return { layer: targetLayerKey, cql: filterParts.join(" AND ") };
}

// ─── Main exported function ───────────────────────────────────────────────────
window.executeSmartQuery = async function(layers) {
    const inputField = document.getElementById('userInput');
    const input = inputField.value.trim();
    if (!input) return;

    const originalPlaceholder = inputField.placeholder;

    // Show a loading state on the search button
    const btn = inputField.nextElementSibling;
    const originalBtnText = btn.textContent;
    btn.textContent = "⏳";
    btn.disabled = true;

    // ── Step 1: Try Gemini first, fall back to keyword parser ────────────────
    let result = await callGeminiNL2CQL(input);

    if (!result || !result.layer) {
        // Gemini unavailable or returned null layer → keyword fallback
        result = keywordFallback(input.toLowerCase());
    }

    btn.textContent = originalBtnText;
    btn.disabled = false;

    if (!result || !result.layer) {
        showNoResultsFeedback(inputField, "Try: Schools in Ward 3, damaged roads...");
        return;
    }

    const { layer: targetLayerKey, cql: finalCQL } = result;

    // ── Step 2: Reset all WMS CQL filters ────────────────────────────────────
    Object.keys(layers).forEach(key => {
        if (layers[key].setParams && key !== 'world_map' && key !== 'panchayat_basemap') {
            layers[key].setParams({ CQL_FILTER: null });
        }
    });

    // ── Step 3: Apply filter and ensure the layer is visible ─────────────────
    if (layers[targetLayerKey]) {
        layers[targetLayerKey].setParams({ CQL_FILTER: finalCQL || null });
        if (!map.hasLayer(layers[targetLayerKey])) {
            map.addLayer(layers[targetLayerKey]);
            const checkbox = document.getElementById(`check-${targetLayerKey}`);
            if (checkbox) checkbox.checked = true;
        }
    }

    // ── Step 4: WFS deep search — zoom + highlight a specific feature ─────────
    // Derive the GeoServer layer name from the key (e.g. fire_stations → Fire Stations)
    const geoServerName = targetLayerKey
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    const wfsUrl =
        `http://localhost:8080/geoserver/gramagis/ows` +
        `?service=WFS&version=1.0.0&request=GetFeature` +
        `&typeName=gramagis:${encodeURIComponent(geoServerName)}` +
        `&outputFormat=application/json` +
        `&CQL_FILTER=name ILIKE '%25${encodeURIComponent(input)}%25'` +
        ` OR ward_name ILIKE '%25${encodeURIComponent(input)}%25'`;

    try {
        const response = await fetch(wfsUrl);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const geom    = feature.geometry;

            // Zoom
            if (geom.type === "Point") {
                map.setView([geom.coordinates[1], geom.coordinates[0]], 17);
            } else {
                map.fitBounds(L.geoJSON(feature).getBounds());
            }

            // Info panel
            displayInfoOnRight(feature.properties);

            // Highlight ring — auto-removed after 3 s
            const highlight = L.geoJSON(feature, { color: 'yellow', weight: 5 }).addTo(map);
            setTimeout(() => map.removeLayer(highlight), 3000);

        } else if (!finalCQL) {
            // Only show "no results" when it was a specific name search, not a broad category show
            showNoResultsFeedback(inputField, originalPlaceholder);
        }
    } catch (err) {
        console.error("WFS Search Error:", err);
    }
};

// ─── Info panel ───────────────────────────────────────────────────────────────
function displayInfoOnRight(props) {
    const panel   = document.getElementById('info-panel');
    const title   = document.getElementById('info-title');
    const content = document.getElementById('info-content');

    panel.style.display = 'block';
    title.innerText = props.name || props.Name || "Details";

    const skipKeys = new Set(['geom', 'id', 'gid', 'objectid']);
    let html = "<ul>";
    for (const key in props) {
        if (skipKeys.has(key.toLowerCase())) continue;
        const val        = props[key];
        const displayVal = (val === null || val === undefined || val === "")
            ? "<i style='color:#999'>Attribute not found</i>"
            : val;
        const cleanKey   = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        html += `<li><b>${cleanKey}:</b> ${displayVal}</li>`;
    }
    html += "</ul>";
    content.innerHTML = html;
}

// ─── UX helpers ───────────────────────────────────────────────────────────────
function showNoResultsFeedback(inputField, originalText) {
    inputField.value       = "";
    inputField.placeholder = "No results found!";
    setTimeout(() => { inputField.placeholder = originalText; }, 3000);
}

function closeInfoPanel() {
    document.getElementById('info-panel').style.display = 'none';
}