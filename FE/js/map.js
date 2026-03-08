// 1. Initialize Map with dragging ENABLED and centered view
var map = L.map('map', { 
    zoomControl: false,
    minZoom: 11,
    maxZoom: 18,
    dragging: true,  // ENABLED by default
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: false,
    layers: [] 
});

// Set a default center view (will be updated after ward boundary loads)
map.setView([9.5, 76.9], 13);

L.control.zoom({ position: 'bottomright' }).addTo(map);

var geoServerUrl = "http://localhost:8080/geoserver/wms"; 
var layers = {};

// 2. BASEMAPS
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, 
    attribution: '© OpenStreetMap'
});
layers['world_map'] = osm;

var panchayatBasemap = L.tileLayer.wms(geoServerUrl, {
    layers: 'gramagis:basemap',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    zIndex: 1 
});
layers['panchayat_basemap'] = panchayatBasemap;
panchayatBasemap.addTo(map);

// 3. Define Vector Layers
window.allLayerNames = [
    'Banks', 'Colleges', 'Fire Stations', 'Government Offices', 
    'Hospitals', 'Hotels', 'Petrol Pumps', 'Police Stations', 
    'Post Offices', 'Restaurants', 'Schools', 'Toilets', 
    'Roads', 'Wards', 'Ward Boundary'
];

allLayerNames.forEach(name => {
    let id = name.toLowerCase().replace(/\s+/g, '_');
    layers[id] = L.tileLayer.wms(geoServerUrl, {
        layers: `gramagis:${name}`, 
        format: 'image/png', 
        transparent: true, 
        version: '1.1.1', 
        zIndex: 1000 
    });
});

// 4. MASKING LOGIC - Load Ward Boundary and center map
var maskLayer; 
var wfsUrl = "http://localhost:8080/geoserver/gramagis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gramagis:Ward Boundary&outputFormat=application/json";

fetch(wfsUrl)
    .then(res => {
        if (!res.ok) {
            throw new Error(`WFS request failed: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        // Check if we have valid data
        if (!data.features || data.features.length === 0) {
            console.warn('No ward boundary features found');
            return;
        }

        // Create the mask (grey area outside panchayat)
        var world = [[90, -180], [90, 180], [-90, 180], [-90, -180]];
        
        function flip(coords) { 
            return coords.map(c => Array.isArray(c[0]) ? flip(c) : [c[1], c[0]]); 
        }
        
        var geometry = data.features[0].geometry;
        
        // Handle different geometry types
        var hole;
        if (geometry.type === "MultiPolygon") {
            hole = flip(geometry.coordinates[0][0]);
        } else if (geometry.type === "Polygon") {
            hole = flip(geometry.coordinates[0]);
        } else {
            console.warn('Unexpected geometry type:', geometry.type);
            return;
        }

        maskLayer = L.polygon([world, hole], {
            color: 'none', 
            fillColor: '#e2e8f0',  // Match the background color
            fillOpacity: 1, 
            zIndex: 500, 
            interactive: false
        }).addTo(map);

        // Center the map on the panchayat boundary
        setTimeout(() => {
            map.invalidateSize();
            
            var geoJsonLayer = L.geoJSON(data);
            var bounds = geoJsonLayer.getBounds();
            
            // Check if bounds are valid
            if (bounds.isValid()) {
                // Center the view on the panchayat
                map.fitBounds(bounds, { 
                    paddingTopLeft: [40, 40],
                    paddingBottomRight: [40, 40],
                    animate: true,
                    duration: 0.8
                });

                // Set max bounds to allow some panning but prevent going too far
                map.setMaxBounds(bounds.pad(0.5));
            } else {
                console.warn('Invalid bounds calculated from ward boundary');
            }
        }, 300);
    })
    .catch(err => {
        console.error("Ward Boundary Load Error:", err);
        console.log("Map will remain at default center. Check if GeoServer is running.");
    });

// 5. Toggle Function
function toggleLayer(layerID, checkbox) {
    var selectedLayer = layers[layerID];
    if (selectedLayer) {
        if (checkbox.checked) {
            map.addLayer(selectedLayer);
            if (layerID !== 'world_map' && layerID !== 'panchayat_basemap') {
                selectedLayer.bringToFront();
            }
        } else {
            map.removeLayer(selectedLayer);
        }
    }
}

// 6. Identify Feature (Popups)
map.on('click', function (e) {
    let activeLayer = Object.values(layers).find(l => 
        map.hasLayer(l) && l !== osm && l !== panchayatBasemap
    );
    
    if (!activeLayer) return;
    
    var url = getFeatureInfoUrl(e.latlng, activeLayer);
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                let props = data.features[0].properties;
                let content = "<h3>Details</h3><ul>";
                for (let key in props) { 
                    content += `<li><b>${key}:</b> ${props[key]}</li>`; 
                }
                content += "</ul>";
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(content)
                    .openOn(map);
            }
        })
        .catch(err => console.error("Feature info error:", err));
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

// 7. Trigger search function (called from query.js)
function triggerSearch() {
    if (typeof executeSmartQuery === 'function') {
        executeSmartQuery(layers);
    } else {
        console.error('executeSmartQuery function not found. Make sure query.js is loaded.');
    }
}

// 8. Close info panel function
function closeInfoPanel() {
    const panel = document.getElementById('info-panel');
    if (panel) {
        panel.classList.remove('visible');
        panel.style.display = 'none';
    }
}

// Initialize map size on load
setTimeout(() => {
    map.invalidateSize();
}, 500);

console.log('Map initialized successfully');
