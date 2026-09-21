import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { vendorGetVenueById } from "../../api/vendorVenues.js";
import { mediaUrl } from "../../media.js";
import { AppImage } from "../../components/AppImage.jsx";
import { logout } from "../../store/authSlice.js";
import { formatVenuePrice, formatVenueToken, resolveVenuePrice } from "../../utils/venuePricing.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

function DetailRow({ label, value }) {
  return (
    <div className="row py-2 border-bottom">
      <div className="col-sm-4 text-secondary small">{label}</div>
      <div className="col-sm-8 fw-medium">{value || "—"}</div>
    </div>
  );
}

export function ViewVenuePage() {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [venue, setVenue] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await vendorGetVenueById(venueId);
        if (cancelled) return;
        if (!data) return setNotFound(true);
        setVenue(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load service.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, venueId]);

  if (notFound) return <NotFoundPage />;
  if (error) {
    return (
      <div className="vendor-venues-page">
        <p className="vendor-venues-empty vendor-venues-empty--error">{error}</p>
        <Link to="/vendor/venues" className="btn btn-outline-secondary btn-sm">
          Back to services
        </Link>
      </div>
    );
  }
  if (!venue) return <p className="vendor-venues-empty">Loading service…</p>;

  const resolvedPrice = resolveVenuePrice(venue);
  const location = [venue.city, venue.state].filter(Boolean).join(", ") || venue.address || "—";
  const gallery = [
    ...(venue.thumbnail ? [mediaUrl(venue.thumbnail)] : []),
    ...(Array.isArray(venue.images) ? venue.images.map((img) => mediaUrl(img)) : []),
  ].filter((url, idx, arr) => url && arr.indexOf(url) === idx);
  const amenityNames = (venue.amenities ?? [])
    .map((a) => (typeof a === "object" ? a.name : a))
    .filter(Boolean);

  const statusLabel = !venue.adminApproved
    ? "Pending approval"
    : venue.status === "inactive"
      ? "Inactive"
      : "Active";

  return (
    <div className="user-page vendor-editor-page">
      <div className="vendor-venues-page__head vendor-venues-page__head--form">
        <div className="vendor-venues-page__title-row">
          <Link to="/vendor/venues" className="vendor-venues-back" aria-label="Back to services">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18 9 12l6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="vendor-venues-page__title">{venue.name}</h1>
            <p className="vendor-venues-page__subtitle">{venue.category?.name || "—"} · {location}</p>
          </div>
        </div>
        <div className="vendor-venues-page__head-actions">
          <Link to={`/vendor/venues/${venueId}/edit`} className="vendor-venues-add-btn">
            Edit service
          </Link>
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card card shadow-sm border-0">
        <div className="card-body p-3 p-md-4">
          <div className="d-flex flex-wrap gap-2 mb-4">
            <span className="badge text-bg-secondary">{statusLabel}</span>
            {venue.adminApproved ? (
              <span className="badge text-bg-success">Admin approved</span>
            ) : (
              <span className="badge text-bg-warning">Awaiting review</span>
            )}
          </div>

          {gallery.length > 0 ? (
            <div className="row g-2 mb-4">
              {gallery.map((src) => (
                <div key={src} className="col-6 col-md-4 col-lg-3">
                  <AppImage src={src} alt="" className="img-fluid rounded border" style={{ height: 120, width: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4" style={{ maxWidth: 240 }}>
              <AppImage src="" alt="" className="img-fluid rounded border" style={{ height: 120, width: "100%", objectFit: "cover" }} />
            </div>
          )}

          <div className="row g-4">
            <div className="col-lg-6">
              <h2 className="h6 text-secondary text-uppercase border-bottom pb-2">Overview</h2>
              <DetailRow label="Description" value={venue.description} />
              <DetailRow label="Sub-category" value={venue.subCategory?.name} />
            </div>
            <div className="col-lg-6">
              <h2 className="h6 text-secondary text-uppercase border-bottom pb-2">Pricing</h2>
              <DetailRow
                label={resolvedPrice.label}
                value={formatVenuePrice(resolvedPrice.amount, resolvedPrice.unit)}
              />
              <DetailRow label="Token amount" value={formatVenueToken(venue)} />
              <h2 className="h6 text-secondary text-uppercase border-bottom pb-2 mt-4">Location</h2>
              <DetailRow label="Address" value={venue.address} />
              <DetailRow label="City / Sub-district" value={location} />
            </div>
            <div className="col-12">
              <h2 className="h6 text-secondary text-uppercase border-bottom pb-2">Facilities</h2>
              {amenityNames.length ? (
                <div className="d-flex flex-wrap gap-2">
                  {amenityNames.map((name) => (
                    <span key={name} className="badge text-bg-light border text-dark">
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted mb-0">No facilities listed.</p>
              )}
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 justify-content-end pt-4 mt-3 border-top">
            <button type="button" className="btn btn-outline-secondary" onClick={() => navigate("/vendor/venues")}>
              Back
            </button>
            <Link to={`/vendor/venues/${venueId}/edit`} className="btn btn-primary">
              Edit service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
