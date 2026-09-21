import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectPanelMode } from "../store/authSlice.js";
import { EcomDashboardSection } from "./ecom/EcomDashboardSection.jsx";
import { CombinedDashboard } from "./CombinedDashboard.jsx";
import { vendorGetDashboard } from "../api/vendorBookings.js";
import {
  venueVendorGetShopStatus,
  venueVendorUpdateShopStatus,
} from "../api/venueVendorAuth.js";
import { setUser } from "../store/authSlice.js";
import { formatInr } from "../utils/venueListMapper.js";
import { VendorBannerCarousel } from "../components/VendorBannerCarousel.jsx";
import { PhoneVisibilityToggle } from "../components/PhoneVisibilityToggle.jsx";
import { ProfileCompletionCard } from "../components/ProfileCompletionCard.jsx";
import { AppImage } from "../components/AppImage.jsx";
import { getVenueVendorProfileCompletion } from "../utils/profileCompletion.js";
import { vendorListVenues } from "../api/vendorVenues.js";
import { venueVendorListCategories } from "../api/venueVendorCatalog.js";

const STAT_CARDS = [
  { key: "total", label: "Total Bookings", tone: "blue", icon: "calendar", to: "/vendor/bookings" },
  { key: "pending", label: "Pending Bookings", tone: "yellow", icon: "clock", to: "/vendor/bookings?status=pending" },
  {
    key: "completed",
    label: "Completed Bookings",
    tone: "green",
    icon: "check",
    to: "/vendor/bookings?status=confirmed",
  },
  { key: "cancelled", label: "Cancelled Bookings", tone: "red", icon: "cancel", to: "/vendor/bookings?status=cancelled" },
];

function StatIcon({ name }) {
  const icons = {
    calendar: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    clock: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    check: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
    ),
    cancel: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    ),
  };
  return icons[name] ?? icons.calendar;
}

function StatusBadge({ status }) {
  const labels = {
    confirmed: "Confirmed",
    pending: "Pending",
    cancelled: "Cancelled",
  };
  return (
    <span className={`vendor-dash-badge vendor-dash-badge--${status}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ServiceDashboard({ profileVariant = "service" }) {
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);
  const user = useSelector((s) => s.auth.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, cancelled: 0 });
  const [recentBookings, setRecentBookings] = useState([]);
  const [isOpen, setIsOpen] = useState(user?.isOpen !== false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState("");
  const [venueCount, setVenueCount] = useState(0);
  const [serviceCategories, setServiceCategories] = useState([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, shop, venues, categories] = await Promise.all([
        vendorGetDashboard({ recentLimit: 5 }),
        token ? venueVendorGetShopStatus(token) : Promise.resolve(null),
        vendorListVenues({ page: 1, limit: 1 }).catch(() => null),
        venueVendorListCategories({ limit: 100 }).catch(() => []),
      ]);
      setStats(data?.stats ?? { total: 0, pending: 0, completed: 0, cancelled: 0 });
      setRecentBookings(Array.isArray(data?.recentBookings) ? data.recentBookings : []);
      setVenueCount(Number(venues?.pagination?.total ?? venues?.venues?.length ?? 0) || 0);
      setServiceCategories(Array.isArray(categories) ? categories : []);
      if (shop && typeof shop.isOpen === "boolean") {
        setIsOpen(shop.isOpen);
      }
    } catch (err) {
      setStats({ total: 0, pending: 0, completed: 0, cancelled: 0 });
      setRecentBookings([]);
      setVenueCount(0);
      setServiceCategories([]);
      setError(err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onToggleShop = async () => {
    if (!token || togglingOpen) return;
    const next = !isOpen;
    setTogglingOpen(true);
    setShopMessage("");
    try {
      const result = await venueVendorUpdateShopStatus(token, next);
      const opened = result?.isOpen !== false;
      setIsOpen(opened);
      if (result?.user) {
        dispatch(setUser(result.user));
      } else if (user) {
        dispatch(setUser({ ...user, isOpen: opened }));
      }
      setShopMessage(
        opened
          ? "Business is open. Your services are visible to users."
          : "Business is closed. Your services are hidden from users."
      );
    } catch (err) {
      setShopMessage(err?.message || "Could not update business status.");
    } finally {
      setTogglingOpen(false);
    }
  };

  const profileCompletion = useMemo(
    () => getVenueVendorProfileCompletion(user, { venueCount }),
    [user, venueCount],
  );

  const statCards = useMemo(
    () =>
      STAT_CARDS.map((card) => ({
        ...card,
        value: stats[card.key] ?? 0,
      })),
    [stats],
  );

  return (
    <div className="vendor-dashboard">
      <header className="vendor-dashboard__head">
        <div>
          <h1 className="vendor-dashboard__title">Dashboard Overview</h1>
          <p className="vendor-dashboard__subtitle">Welcome back! Here&apos;s your business summary</p>
        </div>
        <div className={`vendor-shop-toggle${isOpen ? " is-open" : " is-closed"}`}>
          <div className="vendor-shop-toggle__copy">
            <strong>{isOpen ? "Business Open" : "Business Closed"}</strong>
            <span>
              {isOpen
                ? "Users can see and book your services."
                : "Your services are hidden from users."}
            </span>
          </div>
          <button
            type="button"
            className={`vendor-shop-switch${isOpen ? " is-on" : ""}`}
            role="switch"
            aria-checked={isOpen}
            aria-label={isOpen ? "Close business" : "Open business"}
            disabled={togglingOpen || loading}
            onClick={onToggleShop}
          >
            <span className="vendor-shop-switch__knob" aria-hidden />
          </button>
        </div>
      </header>

      {shopMessage ? (
        <p className={`vendor-shop-toggle__msg${isOpen ? "" : " is-closed"}`}>{shopMessage}</p>
      ) : null}

      <PhoneVisibilityToggle />

      {error ? <p className="vendor-venues-empty vendor-venues-empty--error">{error}</p> : null}

      <VendorBannerCarousel />

      <section className="vendor-dash-stats" aria-label="Summary statistics">
        {statCards.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            className={`vendor-dash-stat vendor-dash-stat--${s.tone}`}
            aria-label={`${s.label}: ${loading ? "loading" : s.value}`}
          >
            <div className="vendor-dash-stat__icon">
              <StatIcon name={s.icon} />
            </div>
            <div className="vendor-dash-stat__body">
              <div className="vendor-dash-stat__value">{loading ? "—" : s.value}</div>
              <div className="vendor-dash-stat__label">{s.label}</div>
            </div>
          </Link>
        ))}
      </section>

      <ProfileCompletionCard completion={profileCompletion} variant={profileVariant} />

      <section className="vendor-dash-panel">
        <h2 className="vendor-dash-panel__title">Recent Bookings</h2>
        <div className="vendor-dash-table-wrap">
          <table className="vendor-dash-table">
            <thead>
              <tr>
                <th>BOOKING ID</th>
                <th>CUSTOMER</th>
                <th>SERVICE</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="vendor-bookings-empty">
                    Loading recent bookings…
                  </td>
                </tr>
              ) : recentBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="vendor-bookings-empty">
                    No bookings yet.
                  </td>
                </tr>
              ) : (
                recentBookings.map((row) => (
                  <tr key={row.orderId ?? row.id}>
                    <td className="vendor-dash-table__id">
                      <Link
                        to={`/vendor/bookings/${encodeURIComponent(row.orderId ?? row.id)}`}
                        className="vendor-bookings-view-link"
                      >
                        {row.id}
                      </Link>
                    </td>
                    <td>{row.customer}</td>
                    <td>{row.venue}</td>
                    <td>{row.date}</td>
                    <td>{formatInr(row.amount)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="vendor-dash-panel vendor-service-categories vendor-service-categories--compact">
        <div className="vendor-service-categories__head">
          <div>
            <h2 className="vendor-dash-panel__title">Add a Service</h2>
            <p>Pick a category to add a service quickly.</p>
          </div>
          <Link to="/vendor/venues/new" className="vendor-ecom-panel-head__link">
            Browse all
          </Link>
        </div>

        {loading ? (
          <p className="vendor-service-categories__empty">Loading service categories…</p>
        ) : serviceCategories.length === 0 ? (
          <p className="vendor-service-categories__empty">No service categories are available yet.</p>
        ) : (
          <div className="vendor-service-category-grid vendor-service-category-grid--compact">
            {serviceCategories.map((category) => (
              <Link
                key={category._id}
                to={`/vendor/venues/new?category=${encodeURIComponent(category._id)}`}
                className="vendor-service-category-card vendor-service-category-card--compact"
                title={category.name}
              >
                <span className="vendor-service-category-card__image">
                  <AppImage src={category.image} alt="" />
                </span>
                <strong>{category.name}</strong>
                <span>Add service</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function DashboardPage() {
  const panelMode = useSelector(selectPanelMode);
  if (panelMode === "ecom") return <EcomDashboardSection />;
  if (panelMode === "both") return <CombinedDashboard />;
  return <ServiceDashboard />;
}
