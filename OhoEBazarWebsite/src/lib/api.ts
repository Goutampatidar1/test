import type {
  ApiEnvelope,
  AppConfig,
  PublicCategory,
  PublicHotDeal,
  PublicProduct,
  PublicVendor,
  PublicVenue,
} from "./types";

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:5001/api";

export const VENDOR_PANEL_URL =
  (import.meta.env.VITE_VENDOR_PANEL_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:5174";

const TIMEOUT_MS = 5000;

async function get<T>(path: string, signal?: AbortSignal): Promise<ApiEnvelope<T> | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export const api = {
  appConfig: (s?: AbortSignal) => get<AppConfig>("/public/app-config", s),
  ecomCategories: (s?: AbortSignal) => get<PublicCategory>("/public/categories?mode=ecom&limit=24", s),
  venueCategories: (s?: AbortSignal) => get<PublicCategory>("/public/categories?mode=venue&limit=24", s),
  products: (s?: AbortSignal) => get<PublicProduct>("/public/products?limit=12&page=1", s),
  vendors: (s?: AbortSignal) => get<PublicVendor>("/public/vendors?limit=12", s),
  venues: (s?: AbortSignal) => get<PublicVenue>("/public/venues?limit=40", s),
  hotDeals: (s?: AbortSignal) => get<PublicHotDeal>("/public/hot-deals", s),
};

export function resolveMediaUrl(path?: string | null): string | undefined {
  if (!path?.trim()) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const origin = API_BASE.replace(/\/api\/?$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
