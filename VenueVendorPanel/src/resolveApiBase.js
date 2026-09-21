const BACKEND_DEV_PORT = "5001";

function isLocalDevHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isPrivateLanHost(hostname) {
  if (isLocalDevHost(hostname)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Backend origin for API + /uploads media.
 * - VITE_API_URL: explicit override (recommended in production builds)
 * - localhost: http://localhost:5001
 * - LAN IP: http(s)://<ip>:5001
 * - public HTTPS domain: same host on port 443 (Apache proxies /api — mobile-safe)
 */
export function resolveApiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const { hostname, protocol, port } = window.location;
    if (isLocalDevHost(hostname)) {
      return `http://localhost:${BACKEND_DEV_PORT}`;
    }
    if (isPrivateLanHost(hostname)) {
      const scheme = protocol === "https:" ? "https" : "http";
      return `${scheme}://${hostname}:${BACKEND_DEV_PORT}`;
    }
    const scheme = protocol === "https:" ? "https" : "http";
    const onStandardPort =
      !port || port === "80" || port === "443";
    if (onStandardPort) {
      return `${scheme}://${hostname}`;
    }
    return `${scheme}://${hostname}:${port}`;
  }

  return `http://localhost:${BACKEND_DEV_PORT}`;
}
