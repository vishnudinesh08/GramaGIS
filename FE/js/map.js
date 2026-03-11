// Stable map setup: direct WMS (no embedded credentials), centered smaller view
var map = L.map('map', {
    zoomControl: false,
    minZoom: 10,
    maxZoom: 18,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    dragging: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: false,
    layers: []
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

var DEFAULT_CENTER = [9.846, 76.955];
var DEFAULT_ZOOM = 12.5;
map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

var directWmsUrl = (window.GRAMA_GEOSERVER_WMS || 'http://127.0.0.1:8080/geoserver/wms').replace(/\/$/, '');
var geoServerUrl = directWmsUrl;
var layers = {};

function createWmsLayer(layerName, zIndex, options) {
    var opts = options || {};
    return L.tileLayer.wms(geoServerUrl, {
        layers: layerName,
        styles: opts.styles || '',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        uppercase: true,
        zIndex: zIndex,
        opacity: typeof opts.opacity === 'number' ? opts.opacity : 1,
        className: opts.className || ''
    });
}

// Basemap
layers.panchayat_basemap = createWmsLayer('gramagis:basemap', 1, {
    className: 'basemap-tile',
    opacity: 0.95
});
layers.panchayat_basemap.addTo(map);

// Overlays used by sidebar checkboxes
var layerConfig = {
    ward_boundary: 'gramagis:Ward Boundary',
    wards: 'gramagis:Wards',
    atm: 'gramagis:ATM',
    schools: 'gramagis:Schools',
    colleges: 'gramagis:Colleges',
    community_halls: 'gramagis:Community halls',
    toilets: 'gramagis:Toilets',
    hotels: 'gramagis:Hotels',
    restaurants: 'gramagis:Restaurants',
    roads: 'gramagis:Roads',
    petrol_pumps: 'gramagis:Petrol Pumps',
    hospitals: 'gramagis:Hospitals',
    police_stations: 'gramagis:Police Stations',
    banks: 'gramagis:Banks',
    fire_stations: 'gramagis:Fire Stations',
    government_offices: 'gramagis:Government Offices',
    post_offices: 'gramagis:Post Offices',
    feedback: 'gramagis:feedback'
};

Object.keys(layerConfig).forEach(function (id) {
    layers[id] = createWmsLayer(layerConfig[id], 1200, { opacity: 1 });
});

function applyInitialLayerState() {
    Object.keys(layerConfig).forEach(function (id) {
        var checkbox = document.getElementById('check-' + id);
        if (checkbox && checkbox.checked) {
            map.addLayer(layers[id]);
            layers[id].bringToFront();
        }
    });
}

function centerBasemap() {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
}

setTimeout(function () {
    map.invalidateSize();
    centerBasemap();
    applyInitialLayerState();
}, 300);

window.addEventListener('resize', function () {
    map.invalidateSize();
    centerBasemap();
});

function toggleLayer(layerID, checkbox) {
    var selectedLayer = layers[layerID];
    if (!selectedLayer) return;

    // Selecting layers manually exits search-focus mode and returns to base view.
    if (typeof window.resetSearchContext === 'function') {
        window.resetSearchContext(layers, layerID);
    }

    if (checkbox.checked) {
        map.addLayer(selectedLayer);
        if (layerID !== 'panchayat_basemap') selectedLayer.bringToFront();
    } else {
        map.removeLayer(selectedLayer);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderInfoPanel(props, layerKey) {
    var panel = document.getElementById('info-panel');
    var title = document.getElementById('info-title');
    var content = document.getElementById('info-content');
    if (!panel || !title || !content) return;

    title.textContent = String(layerKey || 'Feature Details').replace(/_/g, ' ');

    var rows = Object.entries(props || {}).map(function(entry) {
        return '<li><b>' + escapeHtml(entry[0]) + ':</b> ' + escapeHtml(entry[1]) + '</li>';
    }).join('');

    content.innerHTML = rows ? '<ul>' + rows + '</ul>' : '<p>No attributes found.</p>';
    panel.style.display = 'flex';
    panel.classList.add('visible');
}

var clickRequestToken = 0;

map.on('click', function(e) {
    clickRequestToken += 1;
    var token = clickRequestToken;

    var activeLayers = Object.entries(layers)
        .filter(function(entry) {
            return map.hasLayer(entry[1]) && entry[0] !== 'panchayat_basemap';
        })
        .sort(function(a, b) {
            // Keep boundary as lowest priority so feature layers win when overlapping.
            if (a[0] === 'ward_boundary' || a[0] === 'wards') return 1;
            if (b[0] === 'ward_boundary' || b[0] === 'wards') return -1;
            return 0;
        });

    if (!activeLayers.length) return;

    (async function() {
        try {
            for (var i = 0; i < activeLayers.length; i += 1) {
                // Ignore stale responses if user already clicked again.
                if (token !== clickRequestToken) return;

                var activeLayerKey = activeLayers[i][0];
                var activeLayer = activeLayers[i][1];
                var url = getFeatureInfoUrl(e.latlng, activeLayer);
                var res = await fetch(url);
                var data = await res.json();

                if (token !== clickRequestToken) return;

                if (data.features && data.features.length > 0) {
                    renderInfoPanel(data.features[0].properties || {}, activeLayerKey);
                    return;
                }
            }
        } catch (err) {
            console.error('Feature info error:', err);
        }
    })();
});

function getFeatureInfoUrl(latlng, layer) {
    var point = map.latLngToContainerPoint(latlng, map.getZoom());
    var size = map.getSize();
    var params = {
        request: 'GetFeatureInfo',
        service: 'WMS',
        srs: 'EPSG:4326',
        version: '1.1.1',
        format: 'image/png',
        bbox: map.getBounds().toBBoxString(),
        height: size.y,
        width: size.x,
        layers: layer.wmsParams.layers,
        query_layers: layer.wmsParams.layers,
        info_format: 'application/json',
        x: Math.round(point.x),
        y: Math.round(point.y)
    };
    return geoServerUrl + L.Util.getParamString(params, geoServerUrl, true);
}

function triggerSearch() {
    if (typeof executeSmartQuery === 'function') {
        executeSmartQuery(layers);
    }
}

function closeInfoPanel() {
    var panel = document.getElementById('info-panel');
    var toggleBtn = document.getElementById('panel-toggle-btn');
    if (!panel) return;
    panel.classList.remove('visible');
    panel.classList.remove('minimized');
    panel.style.display = 'none';
    if (toggleBtn) {
        toggleBtn.innerHTML = '&#8722;';
        toggleBtn.title = 'Minimize panel';
    }
}







