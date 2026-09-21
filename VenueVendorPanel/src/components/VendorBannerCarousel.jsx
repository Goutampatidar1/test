import { useCallback, useEffect, useState } from "react";
import { publicListBanners } from "../api/publicCatalog.js";
import { AppImage } from "./AppImage.jsx";

/** Dashboard only shows Admin → Banner Management (Venue) ads — not paid promotions. */
function isAdminVenueBanner(banner) {
  const source = String(banner?.source || "").trim().toLowerCase();
  return !source;
}

export function VendorBannerCarousel() {
  const [banners, setBanners] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    try {
      const items = await publicListBanners({ type: "venue" });
      const adminOnly = (Array.isArray(items) ? items : []).filter(isAdminVenueBanner);
      setBanners(adminOnly);
      setIndex(0);
    } catch {
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  useEffect(() => {
    if (banners.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  if (loading || banners.length === 0) return null;

  const active = banners[index] ?? banners[0];

  return (
    <section className="vendor-banner-carousel" aria-label="Promotional banners">
      <div className="vendor-banner-carousel__frame">
        <AppImage
          src={active.image}
          alt={active.title || "Banner"}
          className="vendor-banner-carousel__image"
        />
      </div>
      {banners.length > 1 ? (
        <div className="vendor-banner-carousel__dots" role="tablist" aria-label="Banner slides">
          {banners.map((banner, dotIndex) => (
            <button
              key={banner._id ?? dotIndex}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={`Show banner ${dotIndex + 1}`}
              className={`vendor-banner-carousel__dot${dotIndex === index ? " is-active" : ""}`}
              onClick={() => setIndex(dotIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
