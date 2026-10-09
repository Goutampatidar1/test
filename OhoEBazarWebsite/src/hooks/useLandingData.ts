import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  AppConfig,
  PublicCategory,
  PublicHotDeal,
  PublicProduct,
  PublicVendor,
  PublicVenue,
} from "@/lib/types";

export type LandingData = {
  status: "loading" | "ready";
  /** `live` = backend answered; `fixtures` = dev-only offline data; `offline` = no data at all. */
  source: "live" | "fixtures" | "offline";
  config: AppConfig | null;
  ecomCategories: PublicCategory[];
  venueCategories: PublicCategory[];
  products: PublicProduct[];
  vendors: PublicVendor[];
  venues: PublicVenue[];
  hotDeals: PublicHotDeal[];
};

const EMPTY: LandingData = {
  status: "loading",
  source: "offline",
  config: null,
  ecomCategories: [],
  venueCategories: [],
  products: [],
  vendors: [],
  venues: [],
  hotDeals: [],
};

export function useLandingData(): LandingData {
  const [data, setData] = useState<LandingData>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    const s = controller.signal;

    (async () => {
      const [config, ecom, venue, products, vendors, venues, hotDeals] = await Promise.all([
        api.appConfig(s),
        api.ecomCategories(s),
        api.venueCategories(s),
        api.products(s),
        api.vendors(s),
        api.venues(s),
        api.hotDeals(s),
      ]);
      if (s.aborted) return;

      const reachable = [config, ecom, venue, products].some(Boolean);

      if (!reachable && import.meta.env.DEV) {
        const f = await import("@/data/devFixtures");
        if (s.aborted) return;
        setData({
          ...EMPTY,
          status: "ready",
          source: "fixtures",
          ecomCategories: f.devEcomCategories,
          venueCategories: f.devVenueCategories,
          products: f.devProducts,
          vendors: f.devVendors,
          venues: f.devVenues,
        });
        return;
      }

      setData({
        status: "ready",
        source: reachable ? "live" : "offline",
        config: config?.data?.[0] ?? null,
        ecomCategories: ecom?.data ?? [],
        venueCategories: venue?.data ?? [],
        products: products?.data ?? [],
        vendors: vendors?.data ?? [],
        venues: venues?.data ?? [],
        hotDeals: hotDeals?.status && hotDeals.enabled !== false ? hotDeals.data : [],
      });
    })();

    return () => controller.abort();
  }, []);

  return data;
}
