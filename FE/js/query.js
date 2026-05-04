
var API_BASE = window.GRAMA_API_BASE || (window.location.port === '3000' ? '' : 'http://localhost:3000');

var CONTEXT_LAYER_KEYS = new Set(['wards', 'ward_boundary']);

// Layer registry
var layerMapping = {
    atm:         'atm',
    atms:        'atm',
    bank:        'banks',
    banks:       'banks',
    college:     'colleges',
    colleges:    'colleges',
    community:   'community_halls',
    communities: 'community_halls',
    hall:        'community_halls',
    halls:       'community_halls',
    fire:        'fire_stations',
    fires:       'fire_stations',
    office:      'government_offices',
    offices:     'government_offices',
    hospital:    'hospitals',
    hospitals:   'hospitals',
    hotel:       'hotels',
    hotels:      'hotels',
    petrol:      'petrol_pumps',
    police:      'police_stations',
    polices:     'police_stations',
    post:        'post_offices',
    posts:       'post_offices',
    restaurant:  'restaurants',
    restaurants: 'restaurants',
    road:        'roads',
    roads:       'roads',
    school:      'schools',
    schools:     'schools',
    boundary:    'ward_boundary',
    ward:        'wards',
    wards:       'wards',
    feedback:    'feedback',
    report:      'feedback',
    reports:     'feedback',
    complaint:   'feedback',
    complaints:  'feedback'
};

// checkbox-id -> exact GeoServer layer name
var LAYER_NAMES = {
    atm: 'ATM',
    banks: 'Banks',
    colleges: 'Colleges',
    community_halls: 'Community halls',
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
    wards: 'Wards',
    feedback: 'feedback'
};

// Allowed fields per layer based on current PostGIS schema.
var LAYER_FIELDS = {
    atm: ['name', 'ward_no', 'ward_name', 'location', 'latitude', 'longitude'],
    banks: ['name', 'ward_no', 'ward_name', 'location', 'latitude', 'longitude'],
    colleges: ['name', 'ward_no', 'ward_name', 'location', 'type', 'ownership', 'phone', 'status', 'latitude', 'longitude'],
    community_halls: ['name', 'ward_no', 'ward_name', 'ownership', 'location', 'area', 'latitude', 'longitude'],
    fire_stations: ['id', 'name', 'ward_no', 'ward_name'],
    government_offices: ['id', 'name', 'phone', 'ward_no', 'ward_name'],
    hospitals: ['name', 'ward_no', 'ward_name', 'type', 'ownership', 'location', 'working_hours', 'latitude', 'longitude'],
    hotels: ['name', 'ward_no', 'ward_name', 'location', 'latitude', 'longitude'],
    petrol_pumps: ['name', 'ward_no', 'ward_name', 'location', 'latitude', 'longitude'],
    police_stations: ['name', 'ward_no', 'ward_name', 'address', 'contact', 'latitude', 'longitude'],
    post_offices: ['name', 'ward_no', 'ward_name', 'location', 'ownership', 'working_hours', 'latitude', 'longitude'],
    restaurants: ['name', 'ward_no', 'ward_name', 'location', 'latitude', 'longitude'],
    roads: ['name', 'location', 'highway', 'lanes', 'maxspeed', 'oneway', 'sidewalk', 'surface'],
    schools: ['id', 'ward_no', 'ward_name', 'name', 'location', 'category', 'ownership', 'latitude', 'longitude'],
    ward_boundary: ['id', 'name'],
    wards: ['id', 'name', 'ward_name', 'admin', 'local_authority'],
    feedback: ['id', 'reporter_name', 'reporter_contact', 'category', 'ward', 'location_hint', 'title', 'description', 'priority', 'status', 'longitude', 'latitude']
};

var ATTRIBUTE_ALIASES = {
    ward: ['ward_no', 'ward_name', 'ward'],
    area: ['location', 'location_hint', 'ward_name'],
    place: ['location', 'location_hint', 'name'],
    near: ['location', 'location_hint'],
    landmark: ['location', 'location_hint'],
    owner: ['ownership'],
    operator: ['ownership'],
    type: ['type', 'category'],
    category: ['category', 'type'],
    contact: ['contact', 'phone', 'reporter_contact'],
    phone: ['phone', 'contact', 'reporter_contact'],
    issue: ['title', 'description', 'category'],
    complaint: ['title', 'description', 'category'],
    feedback: ['title', 'description', 'category'],
    problem: ['title', 'description', 'status'],
    road_type: ['highway', 'surface'],
    speed: ['maxspeed'],
    title: ['title', 'name'],
    name: ['name', 'title']
};

var SEARCH_EXAMPLES = [
    'schools in ward 7',
    'private schools in ward 7',
    'hospitals and banks in ward 5',
    'roads with surface concrete in ward 3',
    'feedback with status resolved',
    'restaurants near painavu',
    'schools with ownership government and category aided',
    'hospitals with type clinic in ward 9'
];

// Schema hint for Gemini
var DB_SCHEMA_HINT = `
You are a GeoServer CQL filter generator for GramaGIS.

Available layers and attributes:
- atm: name, ward_no, ward_name, location
- banks: name, ward_no, ward_name, location
- colleges: name, ward_no, ward_name, location, type, ownership, phone, status
- community_halls: name, ward_no, ward_name, ownership, location, area
- fire_stations: id, name, ward_no, ward_name
- government_offices: id, name, phone, ward_no, ward_name
- hospitals: name, ward_no, ward_name, type, ownership, location, working_hours
- hotels: name, ward_no, ward_name, location
- petrol_pumps: name, ward_no, ward_name, location
- police_stations: name, ward_no, ward_name, address, contact
- post_offices: name, ward_no, ward_name, location, ownership, working_hours
- restaurants: name, ward_no, ward_name, location
- roads: name, location, highway, lanes, maxspeed, oneway, sidewalk, surface
- schools: id, ward_no, ward_name, name, Location, category, ownership, latitude, longitude
- ward_boundary: id, name
- wards: id, name, ward_name, admin, local_authority
- feedback: id, reporter_name, reporter_contact, category, ward, location_hint, title, description, priority, status, longitude, latitude

Rules:
- Respond ONLY with a JSON object: { "layer": "<layer_key>", "cql": "<CQL string or empty>" }
- Use only attributes listed for the chosen layer.
- Never invent attributes (for example: address/status/date_established where missing).
- Use ILIKE for text matching and = for numeric exact matches.
- For multiple ward numbers, use IN, e.g., ward_no IN (9,13).
- If a query cannot map to a layer, return { "layer": null, "cql": "" }.
`;

function layerHasField(layerKey, fieldName) {
    var list = LAYER_FIELDS[layerKey] || [];
    return list.some(function (field) {
        return String(field).toLowerCase() === String(fieldName).toLowerCase();
    });
}

function getLayerFieldName(layerKey, fieldName) {
    var list = LAYER_FIELDS[layerKey] || [];
    var found = list.find(function (field) {
        return String(field).toLowerCase() === String(fieldName).toLowerCase();
    });
    return found || fieldName;
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeCqlText(text) {
    return String(text || '').replace(/'/g, "''").trim();
}

function levenshtein(a, b) {
    var s = String(a || '').toLowerCase();
    var t = String(b || '').toLowerCase();
    var dp = Array.from({ length: s.length + 1 }, function (_, i) {
        return Array.from({ length: t.length + 1 }, function (__ , j) {
            return i === 0 ? j : (j === 0 ? i : 0);
        });
    });

    for (var i = 1; i <= s.length; i += 1) {
        for (var j = 1; j <= t.length; j += 1) {
            var cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[s.length][t.length];
}

function getClosestFields(layerKey, fieldName, limit) {
    var fields = (LAYER_FIELDS[layerKey] || []).slice();
    return fields
        .map(function (field) {
            return { field: field, score: levenshtein(fieldName, field) };
        })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, limit || 3)
        .map(function (item) { return item.field; });
}

function resolveAliasField(layerKey, token) {
    if (!token) return null;
    if (layerHasField(layerKey, token)) return getLayerFieldName(layerKey, token);

    var aliases = ATTRIBUTE_ALIASES[token] || [];
    for (var i = 0; i < aliases.length; i += 1) {
        if (layerHasField(layerKey, aliases[i])) return getLayerFieldName(layerKey, aliases[i]);
    }

    return null;
}

function getSearchExamples(layerKey) {
    if (!layerKey) return SEARCH_EXAMPLES.slice(0, 5);
    var singular = Object.keys(layerMapping).find(function (key) {
        return layerMapping[key] === layerKey && !key.endsWith('s');
    }) || layerKey;

    return SEARCH_EXAMPLES.filter(function (example) {
        return example.toLowerCase().indexOf(singular.toLowerCase()) !== -1 || example.toLowerCase().indexOf(layerKey.toLowerCase()) !== -1;
    }).slice(0, 4);
}

function renderSearchSuggestionPanel(titleText, message, suggestions) {
    var panel = document.getElementById('info-panel');
    var title = document.getElementById('info-title');
    var subtitle = document.getElementById('info-subtitle');
    var content = document.getElementById('info-content');
    if (!panel || !title || !content) return;

    title.textContent = titleText || 'Search Help';
    if (subtitle) subtitle.textContent = 'Search guidance';
    content.innerHTML = '<div class="search-help">'
        + '<p>' + escapeHtml(message || 'Try a more specific search.') + '</p>'
        + '<div class="info-result-meta">Possible searches</div>'
        + '<ul class="search-suggestion-list">'
        + (suggestions || []).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('')
        + '</ul>'
        + '</div>';

    panel.classList.remove('minimized');
    panel.style.display = 'flex';
    panel.classList.add('visible');
}

var PLACE_NAME_ALIASES = {
    cheruthony: 'cheruthoni'
};
var KNOWN_WARD_NAMES = [
    'perumkala', 'mukkannankudy', 'painavu', 'gandhinagar', 'cheruthoni', 'cheruthony',
    'thannikkandam', 'thadikampadu', 'karimban', 'manjappara', 'mulakuvally',
    'kesamuni', 'vazhathope', 'peppara', 'maniyarankudy'
];

function normalizePlaceSearchValue(value) {
    var raw = String(value || '').trim();
    if (!raw) return raw;
    var normalized = PLACE_NAME_ALIASES[raw.toLowerCase()];
    return normalized || raw;
}
var SEARCH_STOP_WORDS = new Set([
    'a', 'an', 'and', 'around', 'at', 'by', 'for', 'from', 'having', 'in', 'inside',
    'is', 'near', 'of', 'on', 'or', 'the', 'to', 'ward', 'where', 'with', 'within'
]);
function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function getSearchableTextFields(layerKey) {
    var preferred = ['name', 'ward_name', 'location', 'Location', 'title', 'description', 'type', 'category', 'ownership', 'address', 'area', 'admin', 'local_authority'];
    return preferred.filter(function (field) {
        return layerHasField(layerKey, field);
    });
}
function extractFreeTextTokens(input) {
    return normalizeSearchText(input).split(' ').filter(function (token) {
        if (!token || token.length < 3) return false;
        if (SEARCH_STOP_WORDS.has(token)) return false;
        if (layerMapping[token]) return false;
        if (ATTRIBUTE_ALIASES[token]) return false;
        if (/^\d+$/.test(token)) return false;
        return true;
    });
}
function buildGenericTextClause(layerKey, rawTokens) {
    var fields = getSearchableTextFields(layerKey);
    if (!fields.length) return '';
    var tokens = Array.from(new Set((rawTokens || []).map(function (token) {
        return normalizePlaceSearchValue(token);
    }).filter(Boolean)));
    if (!tokens.length) return '';
    return tokens.map(function (token) {
        var safe = escapeCqlText(token);
        return '(' + fields.map(function (field) {
            return field + " ILIKE '%" + safe + "%'";
        }).join(' OR ') + ')';
    }).join(' AND ');
}
function buildPlaceClause(layerKey, placeValue, options) {
    var normalizedPlace = normalizePlaceSearchValue(placeValue);
    if (!normalizedPlace) return '';
    var opts = options || {};
    var fields = [];
    if (opts.preferWard && layerHasField(layerKey, 'ward_name')) fields.push(getLayerFieldName(layerKey, 'ward_name'));
    if (layerHasField(layerKey, 'location')) fields.push(getLayerFieldName(layerKey, 'location'));
    if (layerHasField(layerKey, 'Location')) fields.push(getLayerFieldName(layerKey, 'Location'));
    if (!fields.length && layerHasField(layerKey, 'ward_name')) fields.push(getLayerFieldName(layerKey, 'ward_name'));
    if (!fields.length && layerHasField(layerKey, 'name')) fields.push(getLayerFieldName(layerKey, 'name'));
    fields = Array.from(new Set(fields));
    if (!fields.length) return '';
    var safe = escapeCqlText(normalizedPlace);
    if (fields.length === 1) {
        return fields[0] + " ILIKE '%" + safe + "%'";
    }
    return '(' + fields.map(function (field) {
        return field + " ILIKE '%" + safe + "%'";
    }).join(' OR ') + ')';
}
function getBroadSearchLayerKeys(inputLower) {
    var detected = detectLayerKeysInInput(inputLower || '');
    var candidates = detected.length ? detected.slice() : Object.keys(LAYER_FIELDS).filter(function (layerKey) {
        return getSearchableTextFields(layerKey).length > 0;
    });
    if (/\bward\b/i.test(inputLower || '') && candidates.indexOf('wards') === -1) {
        candidates.unshift('wards');
    }
    return Array.from(new Set(candidates));
}
function getFeatureSearchText(feature, layerKey) {
    var props = feature && feature.properties ? feature.properties : {};
    return getSearchableTextFields(layerKey).map(function (field) {
        return props[field];
    }).filter(function (value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
    }).join(' ');
}
function getWardPriorityScore(queryTokens, feature, layerKey) {
    if (layerKey !== 'wards' && layerKey !== 'ward_boundary') return 0;
    var props = feature && feature.properties ? feature.properties : {};
    var wardFields = [props.name, props.ward_name].filter(function (value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
    }).map(function (value) {
        return normalizeSearchText(normalizePlaceSearchValue(value));
    });
    if (!wardFields.length || !queryTokens.length) return 0;
    var score = 0;
    var joinedQuery = queryTokens.join(' ').trim();
    wardFields.forEach(function (fieldValue) {
        if (!fieldValue) return;
        if (joinedQuery && fieldValue === joinedQuery) score = Math.max(score, 120);
        if (joinedQuery && fieldValue.indexOf(joinedQuery) !== -1) score = Math.max(score, 80);
        var allTokensMatch = queryTokens.every(function (token) {
            return fieldValue.indexOf(token) !== -1 || levenshtein(fieldValue, token) <= 2;
        });
        if (allTokensMatch) score = Math.max(score, 60);
    });
    return score;
}
function preferWardMatches(matches, queryTokens) {
    var wardMatches = (matches || []).filter(function (feature) {
        if (!feature || (feature.__layerKey !== 'wards' && feature.__layerKey !== 'ward_boundary')) return false;
        return (feature.__wardPriorityScore || 0) >= 60;
    });
    if (!wardMatches.length) return matches;
    return wardMatches.sort(function (a, b) {
        return (b.__matchScore || 0) - (a.__matchScore || 0);
    });
}
function getFuzzyScore(queryTokens, candidateText) {
    var text = normalizeSearchText(candidateText);
    if (!text) return 0;
    var words = text.split(' ').filter(Boolean);
    var score = 0;
    queryTokens.forEach(function (token) {
        if (text.indexOf(token) !== -1) {
            score += 12;
            return;
        }
        var bestWordScore = 0;
        words.forEach(function (word) {
            if (word === token) {
                bestWordScore = Math.max(bestWordScore, 12);
                return;
            }
            var distance = levenshtein(token, word);
            var allowedDistance = token.length >= 8 ? 2 : 1;
            if (distance <= allowedDistance) {
                bestWordScore = Math.max(bestWordScore, 9 - distance);
                return;
            }
            if (token.length >= 5 && (word.indexOf(token) !== -1 || token.indexOf(word) !== -1)) {
                bestWordScore = Math.max(bestWordScore, 6);
            }
        });
        score += bestWordScore;
    });
    return score;
}
async function runBroadSearch(inputLower) {
    var candidateLayers = getBroadSearchLayerKeys(inputLower);
    var queryTokens = extractFreeTextTokens(inputLower).map(function (token) {
        return normalizeSearchText(normalizePlaceSearchValue(token));
    }).filter(Boolean);
    if (!candidateLayers.length || !queryTokens.length) return [];
    var responses = await Promise.all(candidateLayers.map(async function (layerKey) {
        try {
            var geoName = LAYER_NAMES[layerKey] || layerKey;
            var res = await fetch(API_BASE + '/api/proxy/wfs?layer=' + encodeURIComponent(geoName) + '&maxFeatures=250');
            var data = await res.json();
            if (!res.ok || !data.features) return [];
            return data.features.map(function (feature) {
                feature.__layerKey = layerKey;
                var baseScore = getFuzzyScore(queryTokens, getFeatureSearchText(feature, layerKey));
                var wardBoost = getWardPriorityScore(queryTokens, feature, layerKey);
                feature.__wardPriorityScore = wardBoost;
                feature.__matchScore = baseScore + wardBoost;
                return feature;
            }).filter(function (feature) {
                return feature.__matchScore >= Math.max(8, queryTokens.length * 6);
            });
        } catch (err) {
            console.error('Broad search fallback failed for ' + layerKey + ':', err);
            return [];
        }
    }));
    return preferWardMatches(responses.flat(), queryTokens).sort(function (a, b) {
        return (b.__matchScore || 0) - (a.__matchScore || 0);
    }).slice(0, 30);
}

function addCondition(parts, field, operator, value) {
    if (!field || value === undefined || value === null || value === '') return;
    if (operator === 'numeric') {
        parts.push(field + ' = ' + value);
        return;
    }
    parts.push(field + " ILIKE '%" + escapeCqlText(value) + "%'");
}

function extractExplicitAttributeRequests(input) {
    var requests = [];
    var regex = /(?:with|where|having|whose|named|called)\s+([a-z_]+)\s+(?:is\s+|=\s*)?([a-z0-9_\- ]+)/gi;
    var match;

    while ((match = regex.exec(input))) {
        var value = String(match[2] || '').split(/\b(and|or|in ward|near|around|within)\b/i)[0].trim();
        if (!value) continue;
        requests.push({ fieldToken: String(match[1] || '').toLowerCase(), value: value });
    }

    return requests;
}

function extractImplicitAttributeFilters(layerKey, input, filterParts) {
    var lower = input.toLowerCase();

    ['government', 'private', 'public', 'aided', 'unaided'].forEach(function (value) {
        if (!lower.includes(value)) return;
        var field = resolveAliasField(layerKey, 'ownership') || resolveAliasField(layerKey, 'category') || resolveAliasField(layerKey, 'type');
        if (field) addCondition(filterParts, field, 'text', value);
    });

    ['resolved', 'in progress', 'not resolved', 'high', 'medium', 'low', 'damaged', 'repair', 'concrete', 'tar', 'clinic'].forEach(function (value) {
        if (!lower.includes(value)) return;

        if ((value === 'resolved' || value === 'in progress' || value === 'not resolved') && resolveAliasField(layerKey, 'status')) {
            addCondition(filterParts, resolveAliasField(layerKey, 'status'), 'text', value.replace(/\s+/g, '_'));
        } else if ((value === 'high' || value === 'medium' || value === 'low') && resolveAliasField(layerKey, 'priority')) {
            addCondition(filterParts, resolveAliasField(layerKey, 'priority'), 'text', value);
        } else if ((value === 'damaged' || value === 'repair') && resolveAliasField(layerKey, 'status')) {
            addCondition(filterParts, resolveAliasField(layerKey, 'status'), 'text', 'damaged');
        } else if ((value === 'concrete' || value === 'tar') && resolveAliasField(layerKey, 'surface')) {
            addCondition(filterParts, resolveAliasField(layerKey, 'surface'), 'text', value);
        } else if (value === 'clinic' && resolveAliasField(layerKey, 'type')) {
            addCondition(filterParts, resolveAliasField(layerKey, 'type'), 'text', value);
        }
    });
}

function buildSearchGuidanceMessage(unmatched) {
    if (!unmatched || !unmatched.length) return '';
    return unmatched.map(function (item) {
        var suggestions = item.suggestions && item.suggestions.length ? (' Try ' + item.suggestions.join(', ') + '.') : '';
        return (LAYER_NAMES[item.layerKey] || item.layerKey) + " does not have '" + item.fieldToken + "'." + suggestions;
    }).join(' ');
}

function sanitizeCqlForLayer(layerKey, rawCql) {
    if (!rawCql || typeof rawCql !== 'string') return '';
    var allowed = LAYER_FIELDS[layerKey] || [];
    if (!allowed.length) return rawCql;

    var allowedSet = new Set(allowed);
    var parts = rawCql.split(/\s+AND\s+/i);

    var kept = parts.filter(function (part) {
        var cleaned = part.trim().replace(/^\(+|\)+$/g, '');
        var m = cleaned.match(/^"?([A-Za-z_][A-Za-z0-9_:]*)"?\s*(=|ILIKE|LIKE|IN|>=|<=|>|<)/i);
        if (!m) return false;
        var field = m[1];
        if (allowedSet.has(field)) return true;

        // Also allow case-insensitive match of allowed fields.
        return allowed.some(function (f) { return f.toLowerCase() === field.toLowerCase(); });
    });

    return kept.join(' AND ');
}

function remapCqlForLayer(layerKey, rawCql) {
    if (!rawCql || typeof rawCql !== 'string') return '';
    var cql = rawCql;

    // Wards table uses ward_name (string values like '10'), not ward_no.
    if (layerKey === 'wards') {
        cql = cql.replace(/\bward_no\b/gi, 'ward_name');
        cql = cql.replace(/ward_name\s*=\s*(\d+)/gi, "ward_name = '$1'");
        cql = cql.replace(/ward_name\s+IN\s*\(([^)]+)\)/gi, function (_, values) {
            var quoted = values.split(',')
                .map(function (v) { return String(v).trim().replace(/^'+|'+$/g, ''); })
                .filter(Boolean)
                .map(function (v) { return "'" + v + "'"; });
            return 'ward_name IN (' + quoted.join(',') + ')';
        });
    }
    return cql;
}

// Gemini call via backend
async function callGeminiNL2CQL(userQuery) {
    try {
        var response = await fetch(API_BASE + '/api/nlquery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userQuery, schema: DB_SCHEMA_HINT })
        });
        if (!response.ok) throw new Error('Backend error: ' + response.status);

        var data = await response.json();
        var cleaned = (data.text || '').replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (err) {
        console.error('Gemini NL2CQL error:', err);
        return null;
    }
}

function getWardNumbersFromInput(input) {
    var matches = Array.from(input.matchAll(/ward\s*(\d+)/g)).map(function (m) { return m[1]; });
    return Array.from(new Set(matches));
}


function resolveKnownWardName(value) {
    var normalized = normalizeSearchText(normalizePlaceSearchValue(value));
    if (!normalized) return '';
    var exact = KNOWN_WARD_NAMES.find(function (name) {
        return normalizeSearchText(normalizePlaceSearchValue(name)) === normalized;
    });
    if (exact) return normalizePlaceSearchValue(exact);
    var closest = '';
    var closestScore = Infinity;
    KNOWN_WARD_NAMES.forEach(function (name) {
        var normalizedName = normalizeSearchText(normalizePlaceSearchValue(name));
        var distance = levenshtein(normalized, normalizedName);
        if (distance < closestScore) {
            closest = normalizePlaceSearchValue(name);
            closestScore = distance;
        }
    });
    return closestScore <= 2 ? closest : '';
}
function isStandaloneWardSearch(input) {
    var normalized = normalizeSearchText(input || '');
    if (!normalized || normalized.indexOf(' ') !== -1) return false;
    return Boolean(resolveKnownWardName(normalized));
}
function hasExplicitWardIntent(input) {
    if (/\bward\b/i.test(input || '')) return true;
    return isStandaloneWardSearch(input);
}
function getStandaloneWardQuery(input) {
    var normalized = normalizeSearchText(input || '');
    if (!normalized || normalized.indexOf(' ') !== -1) return null;
    var wardName = resolveKnownWardName(normalized);
    if (!wardName) return null;
    return {
        layerKey: 'wards',
        cql: "name ILIKE '%" + escapeCqlText(wardName) + "%'",
        unmatchedFields: []
    };
}
function getWardNameFromInput(input) {
    var trailingMatch = input.match(/\b([a-z][a-z\s-]*)\s+ward\b/i);
    if (trailingMatch) {
        return String(trailingMatch[1] || '').replace(/\s+/g, ' ').trim();
    }
    var match = input.match(/\b(?:in|inside|within)\s+ward\s+([a-z][a-z\s-]*)/i);
    if (match) {
        var explicitWardName = String(match[1] || '')
            .split(/\b(and|with|near|around|within)\b/i)[0]
            .replace(/\s+/g, ' ')
            .trim();
        return explicitWardName;
    }

    var inMatch = input.match(/\bin\s+([a-z][a-z\s-]*)/i);
    if (!inMatch) return '';

    var name = inMatch[1].trim();
    name = name.split(/\b(and|with|near|around|within)\b/i)[0].trim();
    name = name.replace(/^ward\s+/i, '').replace(/\s+/g, ' ').trim();
    if (!name) return '';
    if (/^\d+$/.test(name)) return '';
    return name;
}
function hasMeaningfulLocalFilter(query) {
    return Boolean(query && typeof query.cql === 'string' && query.cql.trim());
}

async function buildLayerQueryWithFallback(layerKey, inputLower, inputOriginal) {
    var localQuery = buildLayerQueryFromInput(layerKey, inputLower);
    if (hasMeaningfulLocalFilter(localQuery)) {
        return localQuery;
    }

    var aiResult = await callGeminiNL2CQL(inputOriginal || inputLower);
    if (!aiResult || !aiResult.layer) {
        return localQuery;
    }

    var aiLayerKey = aiResult.layer;
    var explicitWardMatch = inputLower.match(/ward\s*(\d+)/);
    var explicitWardNo = explicitWardMatch ? explicitWardMatch[1] : null;
    if (explicitWardNo && aiLayerKey === 'ward_boundary') aiLayerKey = 'wards';
    if (aiLayerKey !== layerKey) {
        return localQuery;
    }

    return {
        layerKey: aiLayerKey,
        cql: sanitizeCqlForLayer(aiLayerKey, remapCqlForLayer(aiLayerKey, normalizeCql(aiResult.cql || ''))),
        unmatchedFields: localQuery.unmatchedFields || []
    };
}

function detectLayerKeysInInput(input) {
    var found = [];
    var seen = new Set();
    var keys = Object.keys(layerMapping).sort(function (a, b) { return b.length - a.length; });

    keys.forEach(function (keyword) {
        var pattern = new RegExp('\\b' + escapeRegex(keyword) + '\\b', 'i');
        if (pattern.test(input)) {
            var layerKey = layerMapping[keyword];
            if (!seen.has(layerKey)) {
                seen.add(layerKey);
                found.push(layerKey);
            }
        }
    });

    return found;
}

function getCheckedSearchLayerKeys() {
    return Array.from(document.querySelectorAll('input[id^="check-"]:checked'))
        .map(function (checkbox) {
            return String(checkbox.id || '').replace(/^check-/, '');
        })
        .filter(function (layerKey) {
            return layerKey && !CONTEXT_LAYER_KEYS.has(layerKey);
        });
}

async function buildScopedLayerQueries(layerKeys, inputLower, inputOriginal) {
    return Promise.all((layerKeys || []).map(function (layerKey) {
        return buildLayerQueryWithFallback(layerKey, inputLower, inputOriginal);
    }));
}

function buildLayerQueryFromInput(layerKey, input) {
    var filterParts = [];
    var wards = getWardNumbersFromInput(input);
    var wardNameText = getWardNameFromInput(input);
    var resolvedWardName = resolveKnownWardName(wardNameText);
    var unmatchedFields = [];
    var explicitRequests = extractExplicitAttributeRequests(input);

    if (layerHasField(layerKey, 'ward_no')) {
        if (wards.length === 1) filterParts.push(getLayerFieldName(layerKey, 'ward_no') + ' = ' + wards[0]);
        else if (wards.length > 1) filterParts.push(getLayerFieldName(layerKey, 'ward_no') + ' IN (' + wards.join(',') + ')');
    } else if (layerHasField(layerKey, 'ward_name')) {
        if (wards.length === 1) {
            filterParts.push(getLayerFieldName(layerKey, 'ward_name') + " = '" + wards[0] + "'");
        } else if (wards.length > 1) {
            var quoted = wards.map(function (w) { return "'" + w + "'"; });
            filterParts.push(getLayerFieldName(layerKey, 'ward_name') + ' IN (' + quoted.join(',') + ')');
        }
    } else if (layerHasField(layerKey, 'ward') && wards.length === 1) {
        addCondition(filterParts, getLayerFieldName(layerKey, 'ward'), 'text', wards[0]);
    }

    var hasExplicitWardKeyword = /\bward\b/i.test(input);
    var standaloneWardSearch = isStandaloneWardSearch(input);
    if (!wards.length && resolvedWardName && (hasExplicitWardKeyword || standaloneWardSearch)) {
        var wardClause = buildPlaceClause(layerKey, resolvedWardName, { preferWard: true });
        if (wardClause) filterParts.push(wardClause);
    } else if (!wards.length && wardNameText && hasExplicitWardKeyword) {
        var explicitWardClause = buildPlaceClause(layerKey, wardNameText, { preferWard: true });
        if (explicitWardClause) filterParts.push(explicitWardClause);
    } else if (!wards.length && wardNameText) {
        var placeClause = buildPlaceClause(layerKey, wardNameText, { preferWard: false });
        if (placeClause) filterParts.push(placeClause);
    }

    explicitRequests.forEach(function (request) {
        var resolvedField = resolveAliasField(layerKey, request.fieldToken);
        if (!resolvedField) {
            unmatchedFields.push({
                layerKey: layerKey,
                fieldToken: request.fieldToken,
                suggestions: getClosestFields(layerKey, request.fieldToken, 3)
            });
            return;
        }

        if ((resolvedField === 'ward_no' || resolvedField === 'id') && /^\d+$/.test(request.value)) {
            addCondition(filterParts, resolvedField, 'numeric', request.value);
            return;
        }

        addCondition(filterParts, resolvedField, 'text', normalizePlaceSearchValue(request.value));
    });

    extractImplicitAttributeFilters(layerKey, input, filterParts);

    var genericTextClause = buildGenericTextClause(layerKey, extractFreeTextTokens(input));
    if (genericTextClause && filterParts.indexOf(genericTextClause) === -1) {
        filterParts.push(genericTextClause);
    }

    var yearMatch = input.match(/\d{4}/);
    if (yearMatch && layerHasField(layerKey, 'date_established')) {
        var y = yearMatch[0];
        if (input.includes('after')) filterParts.push("date_established >= '" + y + "-01-01'");
        else if (input.includes('before')) filterParts.push("date_established <= '" + y + "-12-31'");
    }

    return { layerKey: layerKey, cql: Array.from(new Set(filterParts)).join(' AND '), unmatchedFields: unmatchedFields };
}

// Keyword fallback
function keywordFallback(input) {
    var targetLayerKey = null;
    for (var keyword in layerMapping) {
        if (input.includes(keyword)) {
            targetLayerKey = layerMapping[keyword];
            break;
        }
    }
    if (!targetLayerKey) return null;

    var q = buildLayerQueryFromInput(targetLayerKey, input);
    return { layer: q.layerKey, cql: q.cql };
}
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show ' + (type || '');
    setTimeout(function () { t.className = ''; }, 3500);
}

function normalizeCql(rawCql) {
    if (!rawCql || typeof rawCql !== 'string') return '';
    var cql = rawCql;
    var wardMatches = Array.from(cql.matchAll(/ward_no\s*=\s*(\d+)/gi)).map(function (m) { return m[1]; });
    var uniqueWards = Array.from(new Set(wardMatches));

    if (uniqueWards.length > 1 && /ward_no\s*=\s*\d+\s+AND\s+ward_no\s*=\s*\d+/i.test(cql)) {
        cql = cql.replace(/ward_no\s*=\s*\d+(\s+AND\s+ward_no\s*=\s*\d+)+/ig, 'ward_no IN (' + uniqueWards.join(',') + ')');
    }

    return cql;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

var searchResultState = { layerKey: null, features: [] };
var searchHighlightLayer = null;
var isSearchModeActive = false;

function getResultTitle(feature, index) {
    var props = feature && feature.properties ? feature.properties : {};
    var base = props.name || props.ward_name || props.location || props.Location || ('Result ' + (index + 1));
    return String(base);
}

function getResultSubtitle(feature) {
    var props = feature && feature.properties ? feature.properties : {};
    var parts = [];
    if (feature && feature.__layerKey) parts.push(LAYER_NAMES[feature.__layerKey] || feature.__layerKey);
    if (props.ward_name) parts.push(String(props.ward_name));
    if (props.ward_no !== undefined && props.ward_no !== null && props.ward_no !== '') parts.push('Ward ' + props.ward_no);
    if (props.location || props.Location) parts.push(String(props.location || props.Location));
    return parts.join(' | ');
}

function buildPropsList(props, maxItems) {
    var entries = Object.entries(props || {});
    if (typeof maxItems === 'number' && maxItems > 0) entries = entries.slice(0, maxItems);
    return entries.map(function (entry) {
        return '<li><b>' + escapeHtml(entry[0]) + ':</b> <span class="val">' + escapeHtml(entry[1]) + '</span></li>';
    }).join('');
}

function focusSearchResult(index) {
    var feature = searchResultState.features[index];
    if (!feature || !feature.geometry) return;

    if (searchHighlightLayer && map.hasLayer(searchHighlightLayer)) map.removeLayer(searchHighlightLayer);

    var geom = feature.geometry;
    if (geom.type === 'Point') {
        map.setView([geom.coordinates[1], geom.coordinates[0]], 16);
    } else {
        map.fitBounds(L.geoJSON(feature).getBounds(), { padding: [90, 90], maxZoom: 12 });
    }

    searchHighlightLayer = L.geoJSON(feature, {
        style: { color: '#facc15', weight: 5, fillOpacity: 0.25 }
    }).addTo(map);
}

window.focusSearchResult = focusSearchResult;
window.toggleResultCard = function (index) {
    var card = document.getElementById('result-card-' + index);
    if (!card) return;
    card.classList.toggle('expanded');
};
window.resetSearchContext = function (layers, selectedLayerKey, options) {
    if (!isSearchModeActive) return;
    var opts = options || {};

    if (searchHighlightLayer && map.hasLayer(searchHighlightLayer)) {
        map.removeLayer(searchHighlightLayer);
    }

    Object.keys(layers || {}).forEach(function (k) {
        if (!layers[k]) return;

        if (map.hasLayer(layers[k])) {
            map.removeLayer(layers[k]);
        }

        if (layers[k].setParams) {
            layers[k].setParams({ CQL_FILTER: '' });
        }

        var cb = document.getElementById('check-' + k);
        if (cb && k !== selectedLayerKey) {
            cb.checked = false;
        }
    });

    searchResultState = { layerKey: null, features: [] };
    isSearchModeActive = false;

    if (typeof closeInfoPanel === 'function') closeInfoPanel();
    if (!opts.preserveView && typeof centerBasemap === 'function') centerBasemap();
};

window.toggleInfoPanelCollapse = function () {
    var panel = document.getElementById('info-panel');
    var btn = document.getElementById('panel-toggle-btn');
    if (!panel) return;

    var isMin = panel.classList.toggle('minimized');
    if (btn) {
        btn.innerHTML = isMin ? '&#43;' : '&#8722;';
        btn.title = isMin ? 'Expand panel' : 'Minimize panel';
    }
};

function renderSearchResults(features, layerKey, titleOverride) {
    var panel = document.getElementById('info-panel');
    var title = document.getElementById('info-title');
    var subtitle = document.getElementById('info-subtitle');
    var content = document.getElementById('info-content');
    if (!panel || !title || !content) return;

    searchResultState.layerKey = layerKey;
    searchResultState.features = features || [];

    panel.classList.remove('minimized');
    var toggleBtn = document.getElementById('panel-toggle-btn');
    if (toggleBtn) {
        toggleBtn.innerHTML = '&#8722;';
        toggleBtn.title = 'Minimize panel';
    }

    title.textContent = titleOverride || (LAYER_NAMES[layerKey] || layerKey || 'Feature Details');
    if (subtitle) {
        subtitle.textContent = searchResultState.features.length + ' result' + (searchResultState.features.length === 1 ? '' : 's');
    }

    if (!searchResultState.features.length) {
        content.innerHTML = '<p>No attributes found.</p>';
        panel.style.display = 'flex';
        panel.classList.add('visible');
        return;
    }

    var cards = searchResultState.features.map(function (feature, idx) {
        var subtitle = getResultSubtitle(feature);
        return '<div class="result-mini-card" id="result-card-' + idx + '">'
            + '<div class="result-mini-head">'
            + '<button class="result-name-btn" onclick="toggleResultCard(' + idx + ')" title="Expand or collapse">' + escapeHtml(getResultTitle(feature, idx)) + '</button>'
            + '<div class="result-mini-actions">'
            + '<button class="view-result-btn" onclick="focusSearchResult(' + idx + ')">Map</button>'
            + '<button class="expand-result-btn" onclick="toggleResultCard(' + idx + ')" title="Expand or collapse">&#9662;</button>'
            + '</div>'
            + '</div>'
            + '<div class="result-mini-body">' + (subtitle ? '<div class="result-subtitle">' + escapeHtml(subtitle) + '</div>' : '') + '<ul>' + buildPropsList(feature.properties || {}) + '</ul></div>'
            + '</div>';
    }).join('');

    content.innerHTML = cards;
    panel.style.display = 'flex';
    panel.classList.add('visible');
}

window.executeSmartQuery = async function (layers) {
    var inputField = document.getElementById('userInput');
    var input = inputField.value.trim();
    if (!input) return;

    var inputLower = input.toLowerCase();
    var btn = document.getElementById('search-btn');
    btn.innerHTML = '<div class="btn-spinner"></div>';
    btn.disabled = true;

    var detectedLayers = detectLayerKeysInInput(inputLower);
    var detectedNonContextLayers = detectedLayers.filter(function (k) { return !CONTEXT_LAYER_KEYS.has(k); });
    var checkedSearchLayers = getCheckedSearchLayerKeys();
    var scopedLayerKeys = detectedNonContextLayers.length ? detectedNonContextLayers : checkedSearchLayers;
    var isMultiLayerQuery = scopedLayerKeys.length > 1;
    var layerQueries = [];
    var unmatchedFields = [];

    if (detectedNonContextLayers.length) {
        layerQueries = await buildScopedLayerQueries(detectedNonContextLayers, inputLower, input);
    } else if (checkedSearchLayers.length) {
        layerQueries = await buildScopedLayerQueries(checkedSearchLayers, inputLower, input);
    } else {
        var standaloneWardQuery = getStandaloneWardQuery(inputLower);
        if (standaloneWardQuery) {
            layerQueries.push(standaloneWardQuery);
        } else {
            var result = await callGeminiNL2CQL(input);
            if (!result || !result.layer) result = keywordFallback(inputLower);

        if (!result || !result.layer) {
            var broadMatches = await runBroadSearch(inputLower);
            btn.innerHTML = '&#128269;';
            btn.disabled = false;
            if (broadMatches.length) {
                renderSearchResults(broadMatches, 'combined', 'Search Results');
                isSearchModeActive = true;
                focusSearchResult(0);
                return;
            }
            renderSearchSuggestionPanel('Search Help', 'I could not identify a layer from that query. Try naming a layer and one or two attributes.', getSearchExamples());
            showToast('No matching layer found. Try a layer name like schools, hospitals, roads, or feedback.', 'error');
            return;
        }

        var explicitWardMatch = inputLower.match(/ward\s*(\d+)/);
        var explicitWardNo = explicitWardMatch ? explicitWardMatch[1] : null;
        var layerKey = result.layer;
        if (explicitWardNo && layerKey === 'ward_boundary') layerKey = 'wards';

        var localQuery = buildLayerQueryFromInput(layerKey, inputLower);
        var cql = localQuery.cql || sanitizeCqlForLayer(layerKey, remapCqlForLayer(layerKey, normalizeCql(result.cql || '')));
        if (layerKey === 'wards' && explicitWardNo && !cql) cql = "ward_name = '" + explicitWardNo + "'";

        layerQueries.push({ layerKey: layerKey, cql: cql, unmatchedFields: localQuery.unmatchedFields || [] });
        }
    }

    layerQueries = layerQueries
        .filter(function (q) { return q && q.layerKey; })
        .map(function (q) {
            unmatchedFields = unmatchedFields.concat(q.unmatchedFields || []);
            return {
                layerKey: q.layerKey,
                cql: sanitizeCqlForLayer(q.layerKey, remapCqlForLayer(q.layerKey, normalizeCql(q.cql || ''))),
                unmatchedFields: q.unmatchedFields || []
            };
        });

    if (!layerQueries.length) {
        btn.innerHTML = '&#128269;';
        btn.disabled = false;
        renderSearchSuggestionPanel('Search Help', 'I could not build a valid query from that search.', getSearchExamples());
        return;
    }

    Object.keys(layers).forEach(function (k) {
        if (layers[k].setParams && k !== 'world_map') {
            layers[k].setParams({ CQL_FILTER: '' });
        }
    });

    layerQueries.forEach(function (q) {
        if (!layers[q.layerKey]) return;

        if (q.cql) layers[q.layerKey].setParams({ CQL_FILTER: q.cql });
        if (!map.hasLayer(layers[q.layerKey])) {
            map.addLayer(layers[q.layerKey]);
            var cb = document.getElementById('check-' + q.layerKey);
            if (cb) cb.checked = true;
        }
        layers[q.layerKey].bringToFront();
    });

    btn.innerHTML = '&#128269;';
    btn.disabled = false;

    var mergedFeatures = [];
    var successfulLayers = 0;

    try {
        for (var i = 0; i < layerQueries.length; i += 1) {
            var q = layerQueries[i];
            var geoName = LAYER_NAMES[q.layerKey] || q.layerKey;
            var wfsParams = '?layer=' + encodeURIComponent(geoName);
            if (q.cql) wfsParams += '&cql=' + encodeURIComponent(q.cql);

            var res = await fetch(API_BASE + '/api/proxy/wfs' + wfsParams);
            var data = await res.json();

            if (!res.ok) {
                console.error('WFS proxy error (' + q.layerKey + '):', data);
                continue;
            }

            successfulLayers += 1;
            if (data.features && data.features.length > 0) {
                data.features.forEach(function (f) {
                    f.__layerKey = q.layerKey;
                    mergedFeatures.push(f);
                });
            }
        }

        if (mergedFeatures.length > 0) {
            var title = isMultiLayerQuery ? 'Combined Results' : null;
            var panelLayerKey = layerQueries.length === 1 ? layerQueries[0].layerKey : 'combined';
            renderSearchResults(mergedFeatures, panelLayerKey, title);
            isSearchModeActive = true;
            focusSearchResult(0);

            var guidance = buildSearchGuidanceMessage(unmatchedFields);
            if (guidance) showToast(guidance, 'success');
        } else if (successfulLayers > 0) {
            if (hasExplicitWardIntent(inputLower)) {
                var noResultMessage = buildSearchGuidanceMessage(unmatchedFields) || 'No matching features found in that ward.';
                var firstLayer = layerQueries[0] ? layerQueries[0].layerKey : null;
                renderSearchSuggestionPanel('No Results', noResultMessage, getSearchExamples(firstLayer));
                showToast('No matching features found for that ward.', 'error');
                return;
            }

            var fuzzyMatches = await runBroadSearch(inputLower);
            if (fuzzyMatches.length) {
                renderSearchResults(fuzzyMatches, 'combined', 'Closest Matches');
                isSearchModeActive = true;
                focusSearchResult(0);
                showToast('No exact result found, so I showed the closest matches.', 'success');
                return;
            }
            var noResultMessage = buildSearchGuidanceMessage(unmatchedFields) || 'No matching features found. Try another attribute or ward.';
            var firstLayer = layerQueries[0] ? layerQueries[0].layerKey : null;
            renderSearchSuggestionPanel('No Results', noResultMessage, getSearchExamples(firstLayer));
            showToast('No matching features found for current filters.', 'error');
        } else {
            if (hasExplicitWardIntent(inputLower)) {
                var failedLayer = layerQueries[0] ? layerQueries[0].layerKey : null;
                renderSearchSuggestionPanel('Query Help', 'The layer query failed for a ward-specific search. Please try the exact ward name or reload the layer.', getSearchExamples(failedLayer));
                showToast('Layer query failed for that ward search.', 'error');
                return;
            }

            var rescueMatches = await runBroadSearch(inputLower);
            if (rescueMatches.length) {
                renderSearchResults(rescueMatches, 'combined', 'Closest Matches');
                isSearchModeActive = true;
                focusSearchResult(0);
                showToast('Exact layer query failed, so I showed the closest matches instead.', 'success');
                return;
            }

            var failedLayer = layerQueries[0] ? layerQueries[0].layerKey : null;
            renderSearchSuggestionPanel('Query Help', 'The layer query failed. This usually means the GeoServer layer schema needs refresh or the published fields changed.', getSearchExamples(failedLayer));
            showToast('Layer query failed. Check GeoServer layer fields.', 'error');
        }
    } catch (err) {
        console.error('WFS proxy error:', err);
        renderSearchSuggestionPanel('Query Help', 'Could not reach the query service. Please try again in a moment.', getSearchExamples());
        showToast('Could not reach query service.', 'error');
    }
};





































