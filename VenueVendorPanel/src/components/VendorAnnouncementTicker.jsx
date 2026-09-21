import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { venueVendorListAnnouncements } from "../api/vendorAnnouncements.js";

/** Keep a constant pixels-per-second speed so long copy does not race. */
const TICKER_PX_PER_SEC = 60;
const TICKER_MIN_DURATION_SEC = 12;

export function VendorAnnouncementTicker() {
  const token = useSelector((s) => s.auth.token);
  const [messages, setMessages] = useState([]);
  const [durationSec, setDurationSec] = useState(22);
  const trackRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await venueVendorListAnnouncements();
        if (cancelled) return;
        setMessages(
          (Array.isArray(rows) ? rows : [])
            .map((row) => String(row?.message || "").trim())
            .filter(Boolean)
        );
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tickerText = useMemo(() => messages.join("   •   "), [messages]);
  const loopItems = tickerText ? [tickerText, tickerText] : [];

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !tickerText) return undefined;

    const measure = () => {
      const firstItem = track.firstElementChild;
      const loopWidth = firstItem?.offsetWidth || track.scrollWidth / 2;
      if (!loopWidth) return;
      const nextDuration = Math.max(TICKER_MIN_DURATION_SEC, loopWidth / TICKER_PX_PER_SEC);
      setDurationSec(Number(nextDuration.toFixed(2)));
    };

    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(track);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tickerText]);

  if (!tickerText) return null;

  return (
    <div className="vendor-announcement-ticker" role="marquee" aria-label="Vendor announcements">
      <div
        ref={trackRef}
        className="vendor-announcement-ticker__track"
        style={{ "--ticker-duration": `${durationSec}s` }}
      >
        {loopItems.map((text, idx) => (
          <span key={`${idx}-${text.slice(0, 24)}`} className="vendor-announcement-ticker__item">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
