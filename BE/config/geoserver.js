// config/geoserver.js — GeoServer connection settings
// All values come from .env so nothing sensitive is hardcoded.

export const GEOSERVER_URL       = process.env.GEOSERVER_URL  || "http://localhost:8080/geoserver";
export const GEOSERVER_WORKSPACE = process.env.GEOSERVER_WORKSPACE || "gramagis";
export const GEOSERVER_USER      = process.env.GEOSERVER_USER || "admin";
export const GEOSERVER_PASS      = process.env.GEOSERVER_PASS || "geoserver";

/** Basic-auth header for GeoServer admin requests */
export function geoServerAuth() {
    return "Basic " + Buffer.from(`${GEOSERVER_USER}:${GEOSERVER_PASS}`).toString("base64");
}

/** Convert snake_case layer key → GeoServer display name
 *  e.g. "fire_stations" → "Fire Stations"
 */
export function toLayerName(key) {
    return key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Allowed layer keys — acts as a whitelist to prevent arbitrary proxying */
export const ALLOWED_LAYERS = new Set([
    "banks", "boundaries", "colleges", "fire_stations", "government_offices",
    "hospitals", "hotels", "petrol_pumps", "police_stations", "post_offices",
    "restaurants", "roads", "schools", "toilets", "ward_boundary"
]);
