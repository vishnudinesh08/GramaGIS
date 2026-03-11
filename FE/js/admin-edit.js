(function () {
    var API_BASE = window.GRAMA_API_BASE || (window.location.port === '3000' ? '' : 'http://localhost:3000');
    var auth = JSON.parse(sessionStorage.getItem('gramagis_auth') || 'null');

    var LAYER_WFS_NAMES = {
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
        toilets: 'Toilets',
        ward_boundary: 'Ward Boundary',
        wards: 'Wards'
    };

    var STATUS_LABELS = {
        not_resolved: 'Not Resolved',
        in_progress: 'In Progress',
        resolved: 'Resolved'
    };

    var FEEDBACK_FILTER = { status: 'all' };
    var currentLayer = 'hospitals';
    var currentSchema = { attributes: [], geometryField: null, geometryType: null };
    var currentRows = [];
    var currentColumns = [];
    var editingRowKey = null;
    var deletingRowKey = null;
    var geometryEditor = { map: null, layerGroup: null, vertices: [], geometryType: '' };
    var DRAW_DEFAULT_CENTER = [9.846, 76.955];

function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(message, type) {
        var toast = document.getElementById('toast');
        if (!toast) return;
        toast.className = 'toast toast-' + (type || 'success') + ' show';
        document.getElementById('toast-text').textContent = message;
        document.getElementById('toast-icon').textContent = type === 'error' ? 'x' : '+';
        setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }

    function getAuthHeaders(includeJson) {
        var headers = {};
        if (auth && auth.token) headers.Authorization = 'Bearer ' + auth.token;
        if (includeJson) headers['Content-Type'] = 'application/json';
        return headers;
    }

    function toTitleCase(value) {
        return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
    }

    function geometryToWkt(geometry) {
        if (!geometry || !geometry.type) return '';
        if (geometry.type === 'Point') return 'POINT(' + geometry.coordinates[0] + ' ' + geometry.coordinates[1] + ')';
        if (geometry.type === 'LineString') return 'LINESTRING(' + geometry.coordinates.map(function (c) { return c[0] + ' ' + c[1]; }).join(', ') + ')';
        if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0]) return 'POLYGON((' + geometry.coordinates[0].map(function (c) { return c[0] + ' ' + c[1]; }).join(', ') + '))';
        return JSON.stringify(geometry);
    }

    function inferInputType(attr) {
        var type = String(attr && attr.type || '').toLowerCase();
        if (type.indexOf('int') !== -1 || type.indexOf('double') !== -1 || type.indexOf('decimal') !== -1 || type.indexOf('float') !== -1) return 'number';
        if (type.indexOf('date') !== -1 && type.indexOf('time') === -1) return 'date';
        if (type.indexOf('boolean') !== -1) return 'checkbox';
        return 'text';
    }

    function getSchemaAttrMap() {
        var map = {};
        (currentSchema.attributes || []).forEach(function (attr) { map[attr.name] = attr; });
        return map;
    }

    function normalizeSchemaColumns(schema, rows) {
        var cols = [];
        var seen = new Set();
        (schema.attributes || []).forEach(function (attr) {
            if (attr.isGeometry) return;
            seen.add(attr.name);
            cols.push(attr.name);
        });
        (rows || []).forEach(function (row) {
            Object.keys(row.properties || {}).forEach(function (key) {
                if (!seen.has(key)) {
                    seen.add(key);
                    cols.push(key);
                }
            });
        });
        if (String(schema.geometryType || '').toLowerCase() === 'point') {
            ['longitude', 'latitude'].forEach(function (field) {
                if (!seen.has(field)) {
                    seen.add(field);
                    cols.push(field);
                }
            });
        }
        var hasPointCoords = seen.has('longitude') && seen.has('latitude');
        if (schema.geometryField && !(String(schema.geometryType || '').toLowerCase() === 'point' && hasPointCoords)) cols.push('geometry_wkt');
        return cols;
    }

    function createRowFromFeature(feature, index) {
        return {
            rowKey: 'row-' + index + '-' + (feature.id || 'new'),
            featureId: feature.id || '',
            geometry: feature.geometry || null,
            geometryWkt: geometryToWkt(feature.geometry),
            properties: { ...(feature.properties || {}) }
        };
    }

    function findRow(rowKey) {
        return currentRows.find(function (row) { return row.rowKey === rowKey; }) || null;
    }

    function populateLayerOptions() {
        var select = document.getElementById('layer-select');
        if (!select) return;
        select.innerHTML = Object.keys(LAYER_WFS_NAMES).map(function (key) {
            return '<option value="' + key + '">' + escapeHtml(toTitleCase(key)) + '</option>';
        }).join('');
        select.value = currentLayer;
    }

    function injectToolbarButtons() {
        var bar = document.querySelector('.layer-bar');
        if (!bar || document.getElementById('download-geojson-btn')) return;
        var wrap = document.createElement('div');
        wrap.className = 'admin-extra-actions';
        wrap.innerHTML = '' +
            '<button class="btn-secondary-action" id="refresh-layer-btn" type="button">Refresh</button>' +
            '<button class="btn-secondary-action" id="download-geojson-btn" type="button">Download GeoJSON</button>' +
            '<button class="btn-secondary-action" id="download-csv-btn" type="button">Download CSV</button>';
        bar.appendChild(wrap);
        document.getElementById('refresh-layer-btn').addEventListener('click', function () { loadLayerData(); });
        document.getElementById('download-geojson-btn').addEventListener('click', function () { downloadLayer('geojson'); });
        document.getElementById('download-csv-btn').addEventListener('click', function () { downloadLayer('csv'); });
    }

    function ensureFeedbackToolbar() {
        var tab = document.getElementById('tab-feedback');
        var heading = tab ? tab.querySelector('h2') : null;
        if (!tab || !heading || document.getElementById('feedback-filter-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'feedback-filter-bar';
        bar.style.display = 'flex';
        bar.style.gap = '12px';
        bar.style.alignItems = 'center';
        bar.style.justifyContent = 'flex-end';
        bar.style.width = '100%';
        bar.style.margin = '0 0 18px 0';
        bar.innerHTML = '' +
            '<label for="feedback-status-filter" style="font-size:0.82rem;color:var(--muted)">Status</label>' +
            '<select id="feedback-status-filter" class="layer-select" style="max-width:220px">' +
            '  <option value="all">All</option>' +
            '  <option value="not_resolved">Not Resolved</option>' +
            '  <option value="in_progress">In Progress</option>' +
            '  <option value="resolved">Resolved</option>' +
            '</select>';
        heading.insertAdjacentElement('afterend', bar);
        document.getElementById('feedback-status-filter').addEventListener('change', function (evt) {
            FEEDBACK_FILTER.status = evt.target.value;
            renderFeedback();
        });
    }

    async function loadLayerData() {
        currentLayer = document.getElementById('layer-select').value;
        document.getElementById('table-search').value = '';
        try {
            var layerName = LAYER_WFS_NAMES[currentLayer];
            var results = await Promise.all([
                fetch(API_BASE + '/api/proxy/schema?layer=' + encodeURIComponent(layerName)).then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.error || ('Schema failed (' + res.status + ')')); return data; }); }),
                fetch(API_BASE + '/api/proxy/wfs?layer=' + encodeURIComponent(layerName)).then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.error || ('Layer load failed (' + res.status + ')')); return data; }); })
            ]);
            currentSchema = results[0] || { attributes: [], geometryField: null, geometryType: null };
            currentRows = ((results[1] && results[1].features) || []).map(createRowFromFeature);
            currentColumns = normalizeSchemaColumns(currentSchema, currentRows);
            renderTable(currentRows);
            var selectedLabel = document.getElementById('layer-select').selectedOptions[0].text;
            document.getElementById('stat-layer').textContent = selectedLabel;
            document.getElementById('stat-count').textContent = currentRows.length;
            var heroLayer = document.getElementById('hero-current-layer');
            var heroCount = document.getElementById('hero-record-count');
            if (heroLayer) heroLayer.textContent = selectedLabel;
            if (heroCount) heroCount.textContent = currentRows.length;
        } catch (err) {
            console.error('Layer load error:', err);
            currentRows = [];
            currentColumns = [];
            renderTable([]);
            document.getElementById('stat-count').textContent = '0';
            showToast(err.message || 'Failed to load layer data.', 'error');
        }
    }

    function renderTable(rows) {
        var head = document.getElementById('table-head');
        var body = document.getElementById('table-body');
        var cols = currentColumns.slice();
        head.innerHTML = '<tr>' + cols.map(function (c) { return '<th>' + escapeHtml(toTitleCase(c)) + '</th>'; }).join('') + '<th>ACTIONS</th></tr>';
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="' + (cols.length + 1) + '"><div class="empty-state"><h3>No records found</h3><p>This layer has no data, or no records matched your search.</p></div></td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (row) {
            var cells = cols.map(function (col) {
                var value = col === 'geometry_wkt' ? row.geometryWkt : row.properties[col];
                return '<td>' + escapeHtml(value == null || value === '' ? '�' : value) + '</td>';
            }).join('');
            return '<tr>' + cells + '<td><div class="row-actions">' +
                '<button class="action-btn edit" title="Edit" onclick="openEditModal(\'' + escapeHtml(row.rowKey) + '\')">Edit</button>' +
                '<button class="action-btn delete" title="Delete" onclick="openDeleteModal(\'' + escapeHtml(row.rowKey) + '\')">Delete</button>' +
                '</div></td></tr>';
        }).join('');
    }

    function filterTable() {
        var q = document.getElementById('table-search').value.toLowerCase();
        var filtered = currentRows.filter(function (row) {
            return currentColumns.some(function (col) {
                var value = col === 'geometry_wkt' ? row.geometryWkt : row.properties[col];
                return String(value == null ? '' : value).toLowerCase().indexOf(q) !== -1;
            });
        });
        renderTable(filtered);
    }


    function isPointGeometryType() {
        return String(currentSchema.geometryType || '').toLowerCase() === 'point';
    }

    function isDrawableGeometryType() {
        var type = String(currentSchema.geometryType || '').toLowerCase();
        return type === 'linestring' || type === 'polygon' || type === 'multilinestring' || type === 'multipolygon';
    }

    function normalizeDrawGeometryType() {
        var type = String(currentSchema.geometryType || '').toLowerCase();
        if (type.indexOf('polygon') !== -1) return 'polygon';
        return 'line';
    }

    function parseWktVertices(wkt) {
        var text = String(wkt || '').trim();
        if (!text) return [];
        var type = normalizeDrawGeometryType();
        var body = '';
        if (type === 'polygon') {
            var polygonMatch = text.match(/^polygon\s*\(\((.*)\)\)$/i);
            if (!polygonMatch) return [];
            body = polygonMatch[1];
        } else {
            var lineMatch = text.match(/^linestring\s*\((.*)\)$/i);
            if (!lineMatch) return [];
            body = lineMatch[1];
        }
        var vertices = body.split(',').map(function (pair) {
            var parts = pair.trim().split(/\s+/);
            if (parts.length < 2) return null;
            var lng = Number(parts[0]);
            var lat = Number(parts[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            return [lng, lat];
        }).filter(Boolean);
        if (type === 'polygon' && vertices.length > 1) {
            var first = vertices[0];
            var last = vertices[vertices.length - 1];
            if (first[0] === last[0] && first[1] === last[1]) vertices.pop();
        }
        return vertices;
    }

    function buildGeometryWkt(vertices) {
        var type = normalizeDrawGeometryType();
        if (type === 'polygon') {
            if (vertices.length < 3) return '';
            var ring = vertices.concat([[vertices[0][0], vertices[0][1]]]);
            return 'POLYGON((' + ring.map(function (v) { return v[0] + ' ' + v[1]; }).join(', ') + '))';
        }
        if (vertices.length < 2) return '';
        return 'LINESTRING(' + vertices.map(function (v) { return v[0] + ' ' + v[1]; }).join(', ') + ')';
    }

    function destroyGeometryEditor() {
        if (geometryEditor.map) {
            geometryEditor.map.off();
            geometryEditor.map.remove();
        }
        geometryEditor = { map: null, layerGroup: null, vertices: [], geometryType: '' };
    }

    function updateGeometryEditorStatus() {
        var status = document.getElementById('geometry-editor-status');
        if (!status) return;
        var type = normalizeDrawGeometryType();
        if (!geometryEditor.vertices.length) {
            status.textContent = type === 'polygon'
                ? 'Click the mini map to add polygon vertices. At least 3 points are needed.'
                : 'Click the mini map to add line vertices. At least 2 points are needed.';
            return;
        }
        status.textContent = geometryEditor.vertices.length + ' vertex' + (geometryEditor.vertices.length === 1 ? '' : 'es') + ' captured.';
    }

    function renderGeometryOnMap() {
        if (!geometryEditor.map || !geometryEditor.layerGroup) return;
        geometryEditor.layerGroup.clearLayers();
        var latLngs = geometryEditor.vertices.map(function (v) { return [v[1], v[0]]; });
        latLngs.forEach(function (latLng, index) {
            var marker = L.circleMarker(latLng, {
                radius: 5,
                color: '#1a73e8',
                weight: 2,
                fillColor: '#60a5fa',
                fillOpacity: 0.9
            }).bindTooltip(String(index + 1), { permanent: true, direction: 'top', offset: [0, -6] });
            geometryEditor.layerGroup.addLayer(marker);
        });
        if (latLngs.length >= 2 && geometryEditor.geometryType === 'line') {
            geometryEditor.layerGroup.addLayer(L.polyline(latLngs, { color: '#2ecc71', weight: 4 }));
        }
        if (latLngs.length >= 3 && geometryEditor.geometryType === 'polygon') {
            geometryEditor.layerGroup.addLayer(L.polygon(latLngs, { color: '#2ecc71', weight: 3, fillColor: '#2ecc71', fillOpacity: 0.18 }));
        }
        var wktField = document.getElementById('edit-geometry_wkt');
        if (wktField) wktField.value = buildGeometryWkt(geometryEditor.vertices);
        if (latLngs.length) geometryEditor.map.fitBounds(L.latLngBounds(latLngs).pad(0.35));
        updateGeometryEditorStatus();
    }

    function initGeometryEditor(initialWkt) {
        if (!isDrawableGeometryType()) return;
        var mapEl = document.getElementById('geometry-editor-map');
        if (!mapEl || !window.L) return;
        destroyGeometryEditor();
        geometryEditor.geometryType = normalizeDrawGeometryType();
        geometryEditor.vertices = parseWktVertices(initialWkt);
        geometryEditor.map = L.map(mapEl, { attributionControl: false }).setView(DRAW_DEFAULT_CENTER, 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true }).addTo(geometryEditor.map);
        geometryEditor.layerGroup = L.layerGroup().addTo(geometryEditor.map);
        geometryEditor.map.on('click', function (evt) {
            geometryEditor.vertices.push([Number(evt.latlng.lng.toFixed(6)), Number(evt.latlng.lat.toFixed(6))]);
            renderGeometryOnMap();
        });
        setTimeout(function () {
            if (geometryEditor.map) geometryEditor.map.invalidateSize();
            renderGeometryOnMap();
        }, 60);
    }

    function undoGeometryVertex() {
        if (!geometryEditor.vertices.length) return;
        geometryEditor.vertices.pop();
        renderGeometryOnMap();
    }

    function clearGeometryDrawing() {
        geometryEditor.vertices = [];
        var wktField = document.getElementById('edit-geometry_wkt');
        if (wktField) wktField.value = '';
        if (geometryEditor.map) geometryEditor.map.setView(DRAW_DEFAULT_CENTER, 14);
        renderGeometryOnMap();
    }

    function renderDynamicFields(row) {
        var body = document.getElementById('modal-body');
        var attrMap = getSchemaAttrMap();
        var html = currentColumns.map(function (col) {
            var label = toTitleCase(col);
            var value = col === 'geometry_wkt' ? (row.geometryWkt || '') : (row.properties[col] ?? '');
            if (col === 'geometry_wkt') {
                if (isDrawableGeometryType()) {
                    return '<textarea id="edit-geometry_wkt" style="display:none">' + escapeHtml(value) + '</textarea>' +
                        '<div class="geometry-editor-block">' +
                        '<label>Geometry Drawing</label>' +
                        '<p class="geometry-editor-help">Click on the mini map to place vertices. The system will generate the geometry automatically for this layer.</p>' +
                        '<div class="geometry-editor-toolbar">' +
                        '<button type="button" class="btn-add geometry-editor-btn" onclick="undoGeometryVertex()">Undo Vertex</button>' +
                        '<button type="button" class="btn-cancel geometry-editor-btn" onclick="clearGeometryDrawing()">Clear Shape</button>' +
                        '</div>' +
                        '<div id="geometry-editor-map" class="geometry-editor-map"></div>' +
                        '<div id="geometry-editor-status" class="geometry-editor-status"></div>' +
                        '</div>';
                }
                return '<div class="form-group"><label>' + escapeHtml(label) + '</label><textarea id="edit-' + escapeHtml(col) + '" rows="4" placeholder="LINESTRING(...), POLYGON((...)), or other WKT">' + escapeHtml(value) + '</textarea></div>';
            }
            var attr = attrMap[col] || { type: 'xsd:string' };
            var inputType = inferInputType(attr);
            if (inputType === 'checkbox') {
                return '<div class="form-group"><label>' + escapeHtml(label) + '</label><input type="checkbox" id="edit-' + escapeHtml(col) + '" ' + (value === true || String(value).toLowerCase() === 'true' ? 'checked' : '') + '></div>';
            }
            if (String(col).toLowerCase().indexOf('description') !== -1) {
                return '<div class="form-group"><label>' + escapeHtml(label) + '</label><textarea id="edit-' + escapeHtml(col) + '" rows="4">' + escapeHtml(value) + '</textarea></div>';
            }
            return '<div class="form-group"><label>' + escapeHtml(label) + '</label><input type="' + inputType + '" id="edit-' + escapeHtml(col) + '" value="' + escapeHtml(value) + '"></div>';
        }).join('');
        html += '<div class="form-group" style="margin-top:8px"><label>Additional Attribute</label><div id="custom-fields"></div><button type="button" class="btn-add" style="margin-top:8px" onclick="addCustomAttributeField()">Add Attribute Field</button><p style="font-size:0.75rem;color:var(--muted);margin-top:8px">Custom attributes are sent to GeoServer, but brand-new schema columns still require PostGIS/GeoServer schema changes.</p></div>';
        body.innerHTML = html;
        if (isDrawableGeometryType()) initGeometryEditor(row.geometryWkt || '');
    }

    function openEditModal(rowKey) {
        var row = findRow(rowKey);
        if (!row) return;
        editingRowKey = rowKey;
        document.getElementById('modal-title').textContent = 'Edit � ' + (row.properties.name || row.featureId || 'Record');
        renderDynamicFields(row);
        document.getElementById('edit-modal').classList.add('open');
    }

    function openAddModal() {
        editingRowKey = null;
        document.getElementById('modal-title').textContent = 'Add New Record';
        renderDynamicFields({ properties: {}, geometryWkt: '' });
        document.getElementById('edit-modal').classList.add('open');
    }

    function closeEditModal() {
        destroyGeometryEditor();
        document.getElementById('edit-modal').classList.remove('open');
        editingRowKey = null;
    }

    function addCustomAttributeField() {
        var wrap = document.getElementById('custom-fields');
        if (!wrap) return;
        var idx = wrap.children.length;
        var item = document.createElement('div');
        item.className = 'form-group';
        item.innerHTML = '<input type="text" id="custom-name-' + idx + '" placeholder="attribute_name" style="margin-bottom:8px"><input type="text" id="custom-value-' + idx + '" placeholder="value">';
        wrap.appendChild(item);
    }

    function collectFormValues() {
        var values = {};
        currentColumns.forEach(function (col) {
            var el = document.getElementById('edit-' + col);
            if (!el || col === 'geometry_wkt') return;
            values[col] = el.type === 'checkbox' ? el.checked : el.value;
        });
        var geometryWktEl = document.getElementById('edit-geometry_wkt');
        var geometryWkt = geometryWktEl ? geometryWktEl.value.trim() : '';
        var customWrap = document.getElementById('custom-fields');
        if (customWrap) {
            Array.prototype.slice.call(customWrap.children).forEach(function (_, idx) {
                var nameEl = document.getElementById('custom-name-' + idx);
                var valueEl = document.getElementById('custom-value-' + idx);
                if (nameEl && valueEl && nameEl.value.trim()) values[nameEl.value.trim()] = valueEl.value;
            });
        }
        return { properties: values, geometryWkt: geometryWkt };
    }

    async function saveRecord() {
        var row = editingRowKey ? findRow(editingRowKey) : null;
        var payload = collectFormValues();
        var action = row ? 'update' : 'insert';
        try {
            var res = await fetch(API_BASE + '/api/proxy/feature-edit', {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ layer: currentLayer, action: action, featureId: row ? row.featureId : '', properties: payload.properties, geometryWkt: payload.geometryWkt })
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'Session expired. Please sign in again.' : ('Save failed (' + res.status + ')')));
            showToast(action === 'insert' ? 'Record added successfully.' : 'Record updated successfully.', 'success');
            closeEditModal();
            await loadLayerData();
        } catch (err) {
            console.error('Save error:', err);
            showToast(err.message || 'Failed to save record.', 'error');
        }
    }

    function openDeleteModal(rowKey) {
        deletingRowKey = rowKey;
        var row = findRow(rowKey);
        document.getElementById('delete-target-name').textContent = '"' + ((row && (row.properties.name || row.featureId)) || 'this record') + '"';
        document.getElementById('delete-modal').classList.add('open');
    }

    function closeDeleteModal() {
        document.getElementById('delete-modal').classList.remove('open');
        deletingRowKey = null;
    }

    async function confirmDelete() {
        var row = findRow(deletingRowKey);
        if (!row) return;
        try {
            var res = await fetch(API_BASE + '/api/proxy/feature-edit', {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ layer: currentLayer, action: 'delete', featureId: row.featureId })
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'Session expired. Please sign in again.' : ('Delete failed (' + res.status + ')')));
            closeDeleteModal();
            showToast('Record deleted.', 'success');
            await loadLayerData();
        } catch (err) {
            console.error('Delete error:', err);
            showToast(err.message || 'Failed to delete record.', 'error');
        }
    }

    function downloadLayer(format) {
        var layerName = LAYER_WFS_NAMES[currentLayer];
        var url = API_BASE + '/api/proxy/download?layer=' + encodeURIComponent(layerName) + '&format=' + encodeURIComponent(format);
        fetch(url, { headers: getAuthHeaders(false) })
            .then(function (res) {
                if (!res.ok) return res.json().then(function (data) { throw new Error(data.error || 'Download failed.'); });
                return res.blob().then(function (blob) {
                    var link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = currentLayer + '.' + (format === 'csv' ? 'csv' : 'geojson');
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
                });
            })
            .catch(function (err) { showToast(err.message || 'Download failed.', 'error'); });
    }

    async function renderFeedback() {
        var container = document.getElementById('feedback-list');
        var badge = document.getElementById('feedback-badge');
        var query = FEEDBACK_FILTER.status && FEEDBACK_FILTER.status !== 'all' ? '?status=' + encodeURIComponent(FEEDBACK_FILTER.status) : '';
        container.innerHTML = '<p class="feedback-empty-state">Loading feedback...</p>';
        try {
            var res = await fetch(API_BASE + '/api/feedback' + query, { headers: getAuthHeaders(false) });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'Session expired. Please sign in again.' : ('Feedback load failed (' + res.status + ')')));
            var items = data.items || [];
            badge.textContent = items.length;
            if (!items.length) {
                container.innerHTML = '<p class="feedback-empty-state">No feedback reports yet.</p>';
                return;
            }
            container.innerHTML = items.map(function (f) {
                var statusKey = String(f.status || 'not_resolved').toLowerCase();
                var resolved = statusKey === 'resolved';
                var inProgress = statusKey === 'in_progress';
                var statusClass = resolved ? 'is-resolved' : (inProgress ? 'is-progress' : 'is-open');
                return '<article class="admin-feedback-card ' + statusClass + '">' +
                    '<div class="admin-feedback-top">' +
                    '<div class="admin-feedback-copy">' +
                    '<h3>' + escapeHtml(f.title) + '</h3>' +
                    '<p class="admin-feedback-meta">Ward ' + escapeHtml(f.ward) + ' | ' + escapeHtml(String(f.category || '').replace(/_/g, ' ')) + ' | by ' + escapeHtml(f.reporter_name || 'Anonymous') + '</p>' +
                    '</div>' +
                    '<div class="admin-feedback-tags">' +
                    '<span class="feedback-chip priority-chip">' + escapeHtml(String(f.priority || 'low').toUpperCase()) + '</span>' +
                    '<span class="feedback-chip status-chip">' + escapeHtml(STATUS_LABELS[statusKey] || statusKey) + '</span>' +
                    '</div>' +
                    '</div>' +
                    '<p class="admin-feedback-body">' + escapeHtml(f.description) + '</p>' +
                    '<div class="admin-feedback-actions">' +
                    '<button onclick="markStatus(' + Number(f.id) + ', &#39;not_resolved&#39;, this)" class="btn-cancel feedback-action-btn' + (statusKey === 'not_resolved' ? ' is-active' : '') + '">Mark Not Resolved</button>' +
                    '<button onclick="markStatus(' + Number(f.id) + ', &#39;in_progress&#39;, this)" class="btn-secondary-action feedback-action-btn action-progress' + (inProgress ? ' is-active' : '') + '">Mark In Progress</button>' +
                    '<button onclick="markStatus(' + Number(f.id) + ', &#39;resolved&#39;, this)" class="btn-add feedback-action-btn action-resolve' + (resolved ? ' is-active' : '') + '">Mark Resolved</button>' +
                    '</div>' +
                    '</article>';
            }).join('');
        } catch (err) {
            console.error('Feedback load error:', err);
            container.innerHTML = '<p class="feedback-empty-state">Could not load feedback from server.</p>';
            showToast(err.message || 'Failed to load feedback.', 'error');
        }
    }

    async function markStatus(id, status, btn) {
        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Updating...';
            }
            var res = await fetch(API_BASE + '/api/feedback/' + id, {
                method: 'PATCH',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ status: status })
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || ('Update failed (' + res.status + ')'));
            showToast('Feedback updated.', 'success');
            await renderFeedback();
        } catch (err) {
            console.error('Feedback update error:', err);
            showToast(err.message || 'Failed to update feedback.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = status === 'not_resolved' ? 'Mark Not Resolved' : (status === 'in_progress' ? 'Mark In Progress' : 'Mark Resolved');
            }
        }
    }

    function switchTab(tab, evt) {
        document.getElementById('tab-data').style.display = tab === 'data' ? 'flex' : 'none';
        document.getElementById('tab-feedback').style.display = tab === 'feedback' ? 'flex' : 'none';
        document.getElementById('breadcrumb-title').textContent = tab === 'data' ? 'Data Manager' : 'Feedback Inbox';
        Array.prototype.slice.call(document.querySelectorAll('.nav-item')).forEach(function (n) { n.classList.remove('active'); });
        if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
        if (tab === 'feedback') renderFeedback();
    }

    function handleLogout() {
        sessionStorage.removeItem('gramagis_auth');
        window.location.href = 'index.html';
    }

    function initAuth() {
        if (!auth || !auth.loggedIn) {
            document.getElementById('auth-gate').style.display = 'flex';
            document.querySelector('.sidebar').style.display = 'none';
            document.getElementById('main-content').style.display = 'none';
            return false;
        }
        document.getElementById('logged-user').textContent = auth.username;
        document.getElementById('sidebar-role').textContent = auth.role === 'superadmin' ? 'Super Admin' : 'Editor';
        return true;
    }

    window.filterTable = filterTable;
    window.openEditModal = openEditModal;
    window.openAddModal = openAddModal;
    window.closeEditModal = closeEditModal;
    window.saveRecord = saveRecord;
    window.openDeleteModal = openDeleteModal;
    window.closeDeleteModal = closeDeleteModal;
    window.confirmDelete = confirmDelete;
    window.switchTab = switchTab;
    window.handleLogout = handleLogout;
    window.addCustomAttributeField = addCustomAttributeField;
    window.markStatus = markStatus;
    window.undoGeometryVertex = undoGeometryVertex;
    window.clearGeometryDrawing = clearGeometryDrawing;

    populateLayerOptions();
    injectToolbarButtons();
    ensureFeedbackToolbar();
    if (initAuth()) loadLayerData();
})();



