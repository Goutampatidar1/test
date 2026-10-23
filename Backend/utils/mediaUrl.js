const config = require("../config");

const LOOPBACK_HOST = /^(127\.\d+\.\d+\.\d+|localhost|0\.0\.0\.0|\[::1\])(:\d+)?$/i;
// Apache proxies /api with Host 127.0.0.1:5017; URLs built from that host are unreachable from browsers.
const PRODUCTION_FALLBACK_BASE_URL = "https://ohoebazar.com";

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function getPublicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (req) {
    const forwardedHost = firstHeaderValue(req.get("x-forwarded-host"));
    const forwardedProto = firstHeaderValue(req.get("x-forwarded-proto"));
    const host = forwardedHost || req.get("host") || "";
    const proto = forwardedProto || (forwardedHost ? "https" : req.protocol || "http");
    if (host && !LOOPBACK_HOST.test(host)) {
      return `${proto}://${host}`;
    }
    if (config.isProduction) {
      return PRODUCTION_FALLBACK_BASE_URL;
    }
    if (host) {
      return `${req.protocol}://${host}`;
    }
  }
  return config.isProduction ? PRODUCTION_FALLBACK_BASE_URL : `http://localhost:${config.port}`;
}

function isLoopbackUrl(url) {
  return LOOPBACK_HOST.test(url.host);
}

function toPublicUploadPath(rel) {
  const value = rel.startsWith("/") ? rel : `/${rel}`;
  if (value.startsWith("/api/uploads/")) return value.slice(4);
  return value;
}

function toAbsoluteUploadUrl(path, baseUrl) {
  if (path === undefined || path === null || path === "") {
    return path;
  }

  const value = String(path).trim();
  if (!value) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      if (u.pathname.startsWith("/api/uploads/")) {
        u.pathname = u.pathname.slice(4);
      }
      if (isLoopbackUrl(u) && u.pathname.startsWith("/uploads/")) {
        const base = String(baseUrl || getPublicBaseUrl()).replace(/\/$/, "");
        return `${base}${u.pathname}${u.search}`;
      }
      return u.toString();
    } catch {
      return value;
    }
  }

  const base = String(baseUrl || getPublicBaseUrl()).replace(/\/$/, "");
  return `${base}${toPublicUploadPath(value)}`;
}

/**
 * Normalizes a stored `/uploads/...` path or full URL back to `/uploads/...` for DB storage.
 */
function toUploadStoragePath(value, baseUrl) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw.startsWith("/uploads/") || raw.startsWith("/api/uploads/")) {
    return raw.startsWith("/api/uploads/") ? raw.slice(4) : raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = new URL(raw).pathname;
      if (pathname.startsWith("/api/uploads/")) return pathname.slice(4);
      if (pathname.startsWith("/uploads/")) return pathname;
    } catch {
      return "";
    }
    return "";
  }

  const base = String(baseUrl || getPublicBaseUrl()).replace(/\/$/, "");
  if (base && raw.startsWith(base)) {
    const stripped = raw.slice(base.length);
    if (stripped.startsWith("/api/uploads/")) return stripped.slice(4);
    if (stripped.startsWith("/uploads/")) return stripped;
    return "";
  }

  return raw.startsWith("/") ? raw : "";
}

module.exports = { getPublicBaseUrl, toAbsoluteUploadUrl, toUploadStoragePath };
