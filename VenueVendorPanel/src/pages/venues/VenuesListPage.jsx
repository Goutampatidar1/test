import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Swal from "sweetalert2";
import { vendorDeleteVenue, vendorListVenues, vendorUpdateVenueStatus } from "../../api/vendorVenues.js";
import { VendorSearchField } from "../../components/VendorSearchField.jsx";
import { formatVenuePrice, mapVenuesForList } from "../../utils/venueListMapper.js";
import { AppImage } from "../../components/AppImage.jsx";

function VenueToggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`vendor-venue-toggle${disabled ? " vendor-venue-toggle--disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="vendor-venue-toggle__track" />
    </label>
  );
}

function VenueCard({ venue, onToggle, onDelete }) {
  const statusLabel =
    !venue.adminApproved ? "Pending approval" : venue.status === "inactive" ? "Inactive" : "Active";

  const statusClass = !venue.adminApproved
    ? "pending"
    : venue.status === "inactive"
      ? "inactive"
      : "available";

  return (
    <article className="vendor-venue-card">
      <div className="vendor-venue-card__top">
        <AppImage src={venue.image} alt="" className="vendor-venue-card__img" />
        <div className="vendor-venue-card__main">
          <div className="vendor-venue-card__head">
            <h3 className="vendor-venue-card__name">{venue.name}</h3>
            <VenueToggle
              checked={venue.enabled}
              disabled={!venue.adminApproved}
              onChange={(enabled) => onToggle(venue.id, enabled)}
              label={`Toggle ${venue.name}`}
            />
          </div>
          <p className="vendor-venue-card__category">{venue.category}</p>
          <p className="vendor-venue-card__location">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {venue.location}
          </p>
          <p className="vendor-venue-card__price">{formatVenuePrice(venue.pricePerDay)}</p>
          <div className="vendor-venue-card__badges">
            <span className={`vendor-venue-status vendor-venue-status--${statusClass}`}>{statusLabel}</span>
            {venue.adminApproved ? (
              <span className="vendor-venue-card__bookings">Total Bookings: {venue.totalBookings}</span>
            ) : (
              <span className="vendor-venue-card__bookings">Awaiting admin review</span>
            )}
          </div>
        </div>
      </div>
      <div className="vendor-venue-card__actions">
        <Link to={`/vendor/venues/${venue.id}`} className="vendor-venue-btn vendor-venue-btn--view">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View
        </Link>
        <Link to={`/vendor/venues/${venue.id}/edit`} className="vendor-venue-btn vendor-venue-btn--edit">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Edit
        </Link>
        <button
          type="button"
          className="vendor-venue-btn vendor-venue-btn--delete"
          aria-label={`Delete ${venue.name}`}
          onClick={() => onDelete(venue)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>
    </article>
  );
}

export function VenuesListPage() {
  const token = useSelector((s) => s.auth.token);
  const location = useLocation();
  const [venues, setVenues] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadVenues = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError("");
    try {
      const { venues: rows } = await vendorListVenues({ limit: 100 });
      setVenues(mapVenuesForList(rows));
    } catch (err) {
      setLoadError(err.message || "Could not load services.");
      setVenues([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!/^\/vendor\/venues\/?$/.test(location.pathname)) return;
    loadVenues();
  }, [loadVenues, location.pathname]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        v.location.toLowerCase().includes(q),
    );
  }, [venues, search]);

  const handleToggle = async (id, enabled) => {
    const nextStatus = enabled ? "active" : "inactive";
    const prev = venues;
    setVenues((list) => list.map((v) => (v.id === id ? { ...v, enabled, status: enabled ? "available" : "inactive" } : v)));
    try {
      await vendorUpdateVenueStatus(id, nextStatus);
    } catch (err) {
      setVenues(prev);
      await Swal.fire({
        icon: "error",
        title: "Could not update status",
        text: err.message || "Please try again.",
        confirmButtonColor: "#141414",
      });
    }
  };

  const handleDelete = async (venue) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete service?",
      text: `Remove "${venue.name}" from your listings?`,
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
    });
    if (!result.isConfirmed) return;
    try {
      await vendorDeleteVenue(venue.id);
      setVenues((list) => list.filter((v) => v.id !== venue.id));
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Could not delete service",
        text: err.message || "Please try again.",
        confirmButtonColor: "#141414",
      });
    }
  };

  return (
    <div className="vendor-venues-page">
      <header className="vendor-venues-page__head">
        <div>
          <h1 className="vendor-venues-page__title">Service Management</h1>
          <p className="vendor-venues-page__subtitle">
            Manage your service listings
            {!loading && !loadError && venues.length > 0 ? ` · ${venues.length} service${venues.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="vendor-venues-page__head-actions">
          <Link to="/vendor/venues/new" className="vendor-venues-add-btn">
            <span aria-hidden="true">+</span> Add Service
          </Link>
        </div>
      </header>

      <div className="vendor-list-toolbar">
        <VendorSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          aria-label="Search services"
        />
        <button type="button" className="vendor-toolbar-icon-btn" aria-label="Filter">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      </div>

      {loadError ? (
        <p className="vendor-venues-empty vendor-venues-empty--error">
          {loadError}{" "}
          <button type="button" className="vendor-venues-retry" onClick={loadVenues}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? <p className="vendor-venues-empty">Loading your services…</p> : null}

      {!loading && !loadError ? (
        <div className="vendor-venues-grid">
          {filtered.length === 0 ? (
            <p className="vendor-venues-empty">
              {venues.length === 0
                ? "No services yet. Click Add Service to create your first listing."
                : "No services match your search."}
            </p>
          ) : (
            filtered.map((venue, index) => (
              <VenueCard
                key={`${venue.id}-${index}`}
                venue={venue}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
