import { getApiBase } from "./api.js";

function isDevHost(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function toAbsolute(urlLike) {
  try {
    return new URL(urlLike, typeof window !== "undefined" ? window.location.origin : getApiBase());
  } catch {
    return null;
  }
}

const BACKEND_DEV_PORT = "5001";

/** Port the Node backend is reached on (from VITE_API_URL, e.g. :5017 on live), or "" when proxied on 443. */
function backendPort() {
  return toAbsolute(getApiBase())?.port || "";
}

/** Same-origin on live (iPhone-safe). Keep :5001 only on local/LAN. */
export function mediaUrl(path) {
  if (!path) return "";
  const raw = String(path).trim();
  if (!raw) return "";
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;

  const absolute = /^https?:\/\//i.test(raw)
    ? toAbsolute(raw)
    : toAbsolute(`${getApiBase().replace(/\/$/, "")}${raw.startsWith("/") ? raw : `/${raw}`}`);

  if (!absolute) return raw;

  if (!isDevHost(absolute.hostname) && (absolute.port === "5001" || absolute.port === "5000")) {
    absolute.port = backendPort();
  }
  return absolute.toString();
}

/**
 * Direct document links must use the proxied Backend route. Otherwise Apache
 * sends /uploads navigations to the Admin Panel SPA and displays its 404 page.
 */
export function mediaDocumentUrl(path) {
  if (!path) return "";
  const raw = String(path).trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) {
    return mediaUrl(raw);
  }

  const nodeUrl = mediaUrlOnNodePort(raw);
  if (nodeUrl) return nodeUrl;

  if (/^https?:\/\//i.test(raw)) {
    const absolute = toAbsolute(raw);
    if (absolute?.pathname.startsWith("/uploads/")) {
      absolute.pathname = `/api${absolute.pathname}`;
      return mediaUrl(absolute.toString());
    }
    return mediaUrl(raw);
  }

  return mediaUrl(raw.startsWith("/uploads/") ? `/api${raw}` : raw);
}

/** Node static port — used when the public /uploads path is missing on Apache. */
export function mediaUrlOnNodePort(path) {
  const primary = mediaUrl(path);
  const parsed = toAbsolute(primary || path);
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) return "";
  const nodePort = backendPort() || BACKEND_DEV_PORT;
  if (parsed.port === nodePort) return "";
  parsed.port = nodePort;
  return parsed.toString();
}
