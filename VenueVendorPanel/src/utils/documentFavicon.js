function iconTypeFromHref(href) {
  const ext = String(href || "")
    .split("?")[0]
    .split(".")
    .pop()
    ?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "ico") return "image/x-icon";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "";
}

function withCacheKey(href, cacheKey) {
  const nextHref = String(href || "").trim();
  if (!nextHref) return "";
  if (!cacheKey) return nextHref;
  return `${nextHref}${nextHref.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(cacheKey))}`;
}

function clearIconLinks() {
  document.querySelectorAll("link[rel*='icon']").forEach((node) => node.remove());
}

function appendIconLink({ rel, href, type, sizes }) {
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (type) link.type = type;
  if (sizes) link.sizes = sizes;
  document.head.appendChild(link);
}

/** Replace every icon link so Chrome actually uses the uploaded file. */
export function applyDocumentFavicon(href, { cacheKey } = {}) {
  const nextHref = String(href || "").trim();
  clearIconLinks();
  if (!nextHref) return;

  const url = withCacheKey(nextHref, cacheKey);
  const type = iconTypeFromHref(nextHref);

  appendIconLink({ rel: "icon", href: url, type });
  appendIconLink({ rel: "shortcut icon", href: url, type });
  appendIconLink({ rel: "apple-touch-icon", href: url });
}

function baseAsset(baseUrl, file) {
  const base = String(baseUrl || "/").endsWith("/") ? String(baseUrl || "/") : `${baseUrl}/`;
  return `${base}${file}`;
}

/** Built-in panel favicons from public/ (always available after deploy). */
export function applyDefaultDocumentFavicons(baseUrl = import.meta.env.BASE_URL || "/") {
  clearIconLinks();
  const ico = baseAsset(baseUrl, "favicon.ico");
  const svg = baseAsset(baseUrl, "favicon.svg");
  const png = baseAsset(baseUrl, "favicon-32.png");

  appendIconLink({ rel: "icon", href: ico, type: "image/x-icon", sizes: "any" });
  appendIconLink({ rel: "icon", href: svg, type: "image/svg+xml" });
  appendIconLink({ rel: "icon", href: png, type: "image/png", sizes: "32x32" });
  appendIconLink({ rel: "apple-touch-icon", href: png });
  appendIconLink({ rel: "shortcut icon", href: ico, type: "image/x-icon" });
}

function probeImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Prefer business-settings favicon when the file is reachable.
 * If /uploads is missing on Apache, try Node :5001, else keep panel defaults.
 */
export async function applyAppConfigFavicon(path, { cacheKey, mediaUrl, mediaUrlOnNodePort, baseUrl } = {}) {
  const trimmed = String(path || "").trim();
  if (!trimmed) {
    applyDefaultDocumentFavicons(baseUrl);
    return;
  }

  const candidates = [];
  if (typeof mediaUrl === "function") {
    const primary = mediaUrl(trimmed);
    if (primary) candidates.push(primary);
  } else if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    candidates.push(trimmed);
  }
  if (typeof mediaUrlOnNodePort === "function") {
    const retry = mediaUrlOnNodePort(trimmed);
    if (retry && !candidates.includes(retry)) candidates.push(retry);
  }

  for (const href of candidates) {
    const url = withCacheKey(href, cacheKey);
    // eslint-disable-next-line no-await-in-loop
    if (await probeImage(url)) {
      applyDocumentFavicon(href, { cacheKey });
      return;
    }
  }

  applyDefaultDocumentFavicons(baseUrl);
}
