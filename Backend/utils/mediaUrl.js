const config = require("../config");

function isLoopbackHostname(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function isPublicHttpBase(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && !isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

/** Host the visitor actually used, when Apache proxies to 127.0.0.1. */
function originFromRequest(req) {
  if (!req || typeof req.get !== "function") return "";
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.get("host") || "").trim();
  if (!host) return "";
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "");
  if (isLoopbackHostname(hostname)) return "";
  const proto =
    String(req.headers?.["x-forwarded-proto"] || req.protocol || "https")
      .split(",")[0]
      .trim() || "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function getPublicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (isPublicHttpBase(fromEnv)) return fromEnv;
  const fromReq = originFromRequest(req);
  if (fromReq) return fromReq;
  if (fromEnv) return fromEnv;
  if (req) return `${req.protocol}://${req.get("host")}`;
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
      if (isLoopbackHostname(u.hostname) && isPublicHttpBase(base)) {
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
