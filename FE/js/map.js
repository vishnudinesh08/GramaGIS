// 1. Initialize Map with restricted movement
var map = L.map('map', { 
    zoomControl: false,
    minZoom: 11, // Prevents zooming out too far
    maxZoom: 18,
    dragging: false, // Locked by default for the "Island" view
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: false,
    layers: [] 
}); // Removed .setView() because fitBounds() will handle initial positioning

document.getElementById('map').style.backgroundColor = "#d3d3d3"; 
L.control.zoom({ position: 'bottomright' }).addTo(map);

var geoServerUrl = "http://localhost:8080/geoserver/wms"; 
var layers = {};

// 2. BASEMAPS
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
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
window.allLayerNames = ['Banks', 'Colleges', 'Fire Stations', 'Government Offices', 'Hospitals', 'Hotels', 'Petrol Pumps', 'Police Stations', 'Post Offices', 'Restaurants', 'Schools', 'Toilets', 'Roads', 'Wards', 'Ward Boundary'];
allLayerNames.forEach(name => {
    let id = name.toLowerCase().replace(/\s+/g, '_');
    layers[id] = L.tileLayer.wms(geoServerUrl, {
        layers: `gramagis:${name}`, format: 'image/png', transparent: true, version: '1.1.1', zIndex: 1000 
    });
});

// 4. MASKING & STARTUP ALIGNMENT LOGIC
var maskLayer; 
var wfsUrl = "http://localhost:8080/geoserver/gramagis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gramagis:Ward Boundary&outputFormat=application/json";

fetch(wfsUrl)
    .then(res => res.json())
    .then(data => {
        var world = [[90, -180], [90, 180], [-90, 180], [-90, -180]];
        function flip(coords) { return coords.map(c => Array.isArray(c[0]) ? flip(c) : [c[1], c[0]]); }
        var geometry = data.features[0].geometry;
        var hole = (geometry.type === "MultiPolygon") ? flip(geometry.coordinates[0][0]) : flip(geometry.coordinates[0]);

        maskLayer = L.polygon([world, hole], {
            color: 'none', fillColor: '#d3d3d3', fillOpacity: 1, zIndex: 500, interactive: false
        }).addTo(map);

        // --- THE STARTUP ALIGNMENT FIX ---
        // We wait briefly for the sidebar and CSS to settle
        setTimeout(() => {
            map.invalidateSize(); // Forces Leaflet to recognize the 280px sidebar
            
            var bounds = L.geoJSON(data).getBounds();
            
            // fitBounds with specific padding to center in the visible grey area
            map.fitBounds(bounds, { 
                paddingTopLeft: [50, 50], // Buffers the sidebar and top monitor edge
                paddingBottomRight: [50, 50], 
                animate: false 
            });

            // Restricts the user from panning away from the Panchayat
            map.setMaxBounds(bounds.pad(0.2)); 
        }, 500);
    })
    .catch(err => console.error("Data Load Error:", err));

// 5. Toggle Function
function toggleLayer(layerID, checkbox) {
    var selectedLayer = layers[layerID];
    if (selectedLayer) {
        if (checkbox.checked) {
            map.addLayer(selectedLayer);
            if (layerID === 'world_map') {
                if (maskLayer) map.removeLayer(maskLayer);
                map.dragging.enable(); // Allow movement when viewing the whole world
            } else {
                selectedLayer.bringToFront();
            }
        } else {
            map.removeLayer(selectedLayer);
            if (layerID === 'world_map') {
                if (maskLayer) maskLayer.addTo(map);
                map.dragging.disable(); // Re-lock view for the Island basemap
            }
        }
    }
}

// 6. Identify Feature (Popups)
map.on('click', function (e) {
    let activeLayer = Object.values(layers).find(l => map.hasLayer(l) && l !== osm && l !== panchayatBasemap);
    if (!activeLayer) return;
    
    var url = getFeatureInfoUrl(e.latlng, activeLayer);
    fetch(url).then(res => res.json()).then(data => {
        if (data.features && data.features.length > 0) {
            let props = data.features[0].properties;
            let content = "<h3>Details</h3><ul>";
            for (let key in props) { content += `<li><b>${key}:</b> ${props[key]}</li>`; }
            content += "</ul>";
            L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
        }
    });
});

function getFeatureInfoUrl(latlng, layer) {
    var point = map.latLngToContainerPoint(latlng, map.getZoom()), size = map.getSize(),
        params = { request: 'GetFeatureInfo', service: 'WMS', srs: 'EPSG:4326', version: '1.1.1', format: 'image/png',
            bbox: map.getBounds().toBBoxString(), height: size.y, width: size.x,
            layers: layer.wmsParams.layers, query_layers: layer.wmsParams.layers,
            info_format: 'application/json', x: Math.round(point.x), y: Math.round(point.y)
        };
    return geoServerUrl + L.Util.getParamString(params, geoServerUrl, true);
}