(function () {
    var explicit = window.GRAMA_API_BASE;
    if (typeof explicit === 'string' && explicit.trim()) {
        window.GRAMA_API_BASE = explicit.trim().replace(/\/$/, '');
    } else {
        var isBackendOrigin = window.location.port === '3000';
        window.GRAMA_API_BASE = isBackendOrigin ? '' : 'http://localhost:3000';
    }

    window.GRAMA_PROXY_WMS = window.GRAMA_API_BASE + '/api/proxy/wms';
})();
