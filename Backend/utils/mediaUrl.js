const config = require("../config");

const LOOPBACK_HOST = /^(127\.\d+\.\d+\.\d+|localhost|0\.0\.0\.0|\[::1\])(:\d+)?$/i;
// Apache proxies /api with Host 127.0.0.1:5017; URLs built from that host are unreachable from browsers.
const PRODUCTION_FALLBACK_BASE_URL = "https://ohoebazar.com";

function firstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function isLoopbackHost(host) {
  return LOOPBACK_HOST.test(String(host || "").trim());
}

function isPublicHttpBase(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && !isLoopbackHost(url.host);
  } catch {
    return false;
  }
}

/** Host the visitor actually used, when Apache proxies to 127.0.0.1. */
function originFromRequest(req) {
  if (!req || typeof req.get !== "function") return "";
  const forwardedHost = firstHeaderValue(req.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(req.get("x-forwarded-proto"));
  const host = forwardedHost || String(req.get("host") || "").trim();
  if (!host || isLoopbackHost(host)) return "";
  const proto = forwardedProto || (forwardedHost ? "https" : req.protocol || "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

function getPublicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  // A loopback PUBLIC_BASE_URL would put 127.0.0.1 into every image link.
  if (isPublicHttpBase(fromEnv)) return fromEnv;
  const fromReq = originFromRequest(req);
  if (fromReq) return fromReq;
  if (config.isProduction) return PRODUCTION_FALLBACK_BASE_URL;
  if (fromEnv) return fromEnv;
  if (req && req.get("host")) return `${req.protocol}://${req.get("host")}`;
  return `http://localhost:${config.port}`;
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
      const base = String(baseUrl || getPublicBaseUrl()).replace(/\/$/, "");
      if (isLoopbackHost(u.host) && isPublicHttpBase(base) && u.pathname.startsWith("/uploads/")) {
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
