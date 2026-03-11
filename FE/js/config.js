(function () {
    var explicit = window.GRAMA_API_BASE;
    if (typeof explicit === 'string' && explicit.trim()) {
        window.GRAMA_API_BASE = explicit.trim().replace(/\/$/, '');
        return;
    }

    // If frontend is not served by backend, fallback to local API server.
    var isBackendOrigin = window.location.port === '3000';
    window.GRAMA_API_BASE = isBackendOrigin ? '' : 'http://localhost:3000';

    if (!window.GRAMA_GEOSERVER_WMS) {
        window.GRAMA_GEOSERVER_WMS = 'http://127.0.0.1:8080/geoserver/wms';
    }

    if (!window.GRAMA_GEOSERVER_USER) {
        window.GRAMA_GEOSERVER_USER = 'admin';
    }

    if (!window.GRAMA_GEOSERVER_PASS) {
        window.GRAMA_GEOSERVER_PASS = 'geoserver';
    }
})();


