import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FreeMode, Navigation, Thumbs } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import Swal from "sweetalert2";
import { adminGetVenueById, adminUpdateVenue } from "../../api/adminVenues.js";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { formatVenuePrice, formatVenueToken, resolveVenuePrice } from "../../utils/venuePricing.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

function normalizeVenuePayload(data) {
  if (!data || typeof data !== "object") return null;
  if (data.venue && typeof data.venue === "object") return data.venue;
  return data;
}

function titleCase(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function ViewRow({ label, value }) {
  return (
    <div className="row g-2 venue-view__detail-row align-items-start">
      <div className="col-sm-4 text-muted small fw-semibold text-uppercase">{label}</div>
      <div className="col-sm-8 fw-medium text-break">{value ?? "—"}</div>
    </div>
  );
}

function AmenitiesList({ amenities }) {
  const list = Array.isArray(amenities) ? amenities : [];
  if (list.length === 0) {
    return <p className="text-muted small mb-0">No amenities listed for this service.</p>;
  }
  return (
    <ul className="list-group list-group-flush rounded-3 border venue-view__amenities">
      {list.map((a, index) => {
        const name = typeof a === "string" ? a : a?.name || "—";
        const id = typeof a === "object" && a?._id ? a._id : `amenity-${index}`;
        const icon = typeof a === "object" && a?.icon ? mediaUrl(a.icon) : null;
        const st = typeof a === "object" && a?.status ? titleCase(a.status) : null;
        return (
          <li key={id} className="list-group-item d-flex align-items-center gap-3 py-3 px-3">
            {icon ? (
              <img
                src={icon}
                alt=""
                className="flex-shrink-0 rounded-2 border"
                width={44}
                height={44}
                style={{ objectFit: "cover" }}
              />
            ) : (
              <span
                className="flex-shrink-0 d-inline-flex align-items-center justify-content-center rounded-2 bg-primary bg-opacity-10 text-primary fw-semibold small"
                style={{ width: 44, height: 44 }}
                aria-hidden
              >
                {String(name).charAt(0).toUpperCase() || "·"}
              </span>
            )}
            <div className="flex-grow-1 min-w-0">
              <div className="fw-medium text-body">{name}</div>
            </div>
            {st ? (
              <span
                className={`badge flex-shrink-0 ${a?.status === "active" ? "text-bg-success" : "text-bg-secondary"}`}
              >
                {st}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function VenueView() {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [venue, setVenue] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [approvalUpdating, setApprovalUpdating] = useState(false);
  const [thumbsSwiper, setThumbsSwiper] = useState(null);

  async function handleAdminApproval(adminApproved) {
    if (!adminToken || !venueId || approvalUpdating) return;
    setApprovalUpdating(true);
    try {
      const updated = await adminUpdateVenue(adminToken, venueId, { adminApproved });
      const payload = normalizeVenuePayload(updated) || updated;
      if (payload) {
        setVenue((prev) => ({ ...prev, ...payload }));
      }
      await Swal.fire({
        icon: "success",
        title: adminApproved ? "Service approved" : "Service rejected",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      await Swal.fire({
        icon: "error",
        title: "Update failed",
        text: e.message || "Could not update service approval.",
      });
    } finally {
      setApprovalUpdating(false);
    }
  }

  useEffect(() => {
    if (!adminToken || !venueId) return;
    let cancelled = false;

    (async () => {
      setError("");
      setNotFound(false);
      try {
        const raw = await adminGetVenueById(adminToken, venueId);
        if (cancelled) return;
        const payload = normalizeVenuePayload(raw);
        if (!payload?._id) {
          setNotFound(true);
          return;
        }
        setVenue(payload);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) {
          dispatch(logout());
          return;
        }
        if (e?.status === 404) {
          setNotFound(true);
          return;
        }
        setError(e.message || "Failed to load service.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, venueId]);

  const thumbnailImage = useMemo(() => {
    return venue?.thumbnail || null;
  }, [venue]);

  const mediaImages = useMemo(() => {
    const thumb = venue?.thumbnail || null;
    const items = Array.isArray(venue?.images) ? venue.images : [];
    return items.filter((item, index, arr) => item && item !== thumb && arr.indexOf(item) === index);
  }, [venue]);

  if (notFound) return <NotFoundPage />;

  if (error) {
    return (
      <div className="user-page">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="user-page">
        <div className="d-flex align-items-center gap-2 text-muted py-4">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading service…
        </div>
      </div>
    );
  }

  const locationValue = [venue.city, venue.state].filter(Boolean).join(", ");
  const resolvedPrice = resolveVenuePrice(venue);
  const priceDisplay = formatVenuePrice(resolvedPrice.amount, resolvedPrice.unit);
  const tokenDisplay = formatVenueToken(venue);
  const serviceVendorApproved =
    venue.role !== "VenueVendor" ||
    venue.addedById?.approvalStatus === "approved";

  return (
    <div className="user-page venue-view-page">
      <div className="venue-view__hero card border-0 shadow-sm overflow-hidden">
        <div className="card-body p-3 p-lg-4">
          <div className="user-page__toolbar d-flex flex-wrap align-items-center gap-2 mb-3 mb-lg-4">
            <button
              type="button"
              className="btn btn-light btn-sm d-inline-flex align-items-center justify-content-center rounded-circle p-2 venue-view__back-btn"
              aria-label="Back"
              onClick={() => navigate(-1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 18 9 12l6-6" />
              </svg>
            </button>
            <div className="user-page__toolbar-text flex-grow-1 min-w-0">
              <h1 className="user-page__title h4 mb-1">Service details</h1>
              <p className="user-page__subtitle text-muted small mb-0">
                {venue.name ? <span className="fw-semibold text-body">{venue.name}</span> : null}
              </p>
            </div>
            <div className="vendor-detail-page__actions">
              <button
                type="button"
                className="btn btn--reject"
                disabled={approvalUpdating}
                onClick={() => handleAdminApproval(false)}
              >
                Reject
              </button>
              <button
                type="button"
                className="btn btn--approve"
                disabled={
                  approvalUpdating ||
                  venue.adminApproved === true ||
                  !serviceVendorApproved
                }
                title={
                  !serviceVendorApproved
                    ? "Approve the Service Vendor account first"
                    : "Approve service"
                }
                onClick={() => handleAdminApproval(true)}
              >
                Approve
              </button>
              <Link to={`/admin/venues/${venueId}/edit`} className="btn btn--accent btn--sm text-nowrap">
                Edit service
              </Link>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <span className={`badge ${venue.status === "active" ? "text-bg-success" : "text-bg-secondary"}`}>
              {titleCase(venue.status)}
            </span>
            <span className={`badge ${venue.adminApproved ? "text-bg-info" : "text-bg-warning"}`}>
              {venue.adminApproved ? "Approved by admin" : "Pending admin review"}
            </span>
          </div>
          <div className="row g-3">
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Category</span>
                <strong>{venue.category?.name || "—"}</strong>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">{resolvedPrice.label}</span>
                <strong>{priceDisplay}</strong>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Token amount</span>
                <strong>{tokenDisplay}</strong>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Location</span>
                <strong>{locationValue || "—"}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <div className="row g-4">
                <div className="col-12">
                  <div className="rounded-3 border p-3 h-100 bg-white">
                    <h3 className="h6 text-secondary text-uppercase small mb-3 pb-2 border-bottom">Core details</h3>
                    <ViewRow label="Category" value={venue.category?.name || "—"} />
                    <ViewRow label="Sub-category" value={venue.subCategory?.name || "—"} />
                    <ViewRow label="Added by" value={venue.addedById?.name || venue.addedById?.businessName || "—"} />
                    <ViewRow label={resolvedPrice.label} value={priceDisplay} />
                    <ViewRow label="Token amount" value={tokenDisplay} />
                    <ViewRow label="Address" value={venue.address || "—"} />
                    <ViewRow label="City / Sub-district" value={locationValue || "—"} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h3 className="h6 text-secondary text-uppercase small mb-3">Media gallery</h3>
              <div className="row g-4">
                <div className="col-lg-4">
                  <h4 className="small text-muted text-uppercase mb-2">Thumbnail</h4>
                  {thumbnailImage ? (
                    <a href={mediaUrl(thumbnailImage)} target="_blank" rel="noreferrer" className="d-block venue-view__thumbnail-box">
                      <img
                        src={mediaUrl(thumbnailImage)}
                        alt={`${venue.name || "service"} thumbnail`}
                        className="img-fluid rounded-3 border w-100"
                        style={{ height: 220, objectFit: "cover" }}
                      />
                    </a>
                  ) : (
                    <div className="rounded-3 border p-4 text-center text-muted small venue-view__empty">No thumbnail uploaded.</div>
                  )}
                </div>
                <div className="col-lg-8">
                  <h4 className="small text-muted text-uppercase mb-2">Media images</h4>
                  {mediaImages.length > 0 ? (
                    <div className="venue-view__gallery-wrap">
                      <Swiper
                        style={{ "--swiper-navigation-color": "#fff" }}
                        spaceBetween={10}
                        navigation
                        thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                        modules={[FreeMode, Navigation, Thumbs]}
                        className="mb-2 venue-view__gallery-main"
                      >
                        {mediaImages.map((src, i) => (
                          <SwiperSlide key={`gallery-main-${src}-${i}`}>
                            <a href={mediaUrl(src)} target="_blank" rel="noreferrer" className="d-block">
                              <img
                                src={mediaUrl(src)}
                                alt={`${venue.name || "service"} media image ${i + 1}`}
                                className="img-fluid rounded-3 border w-100"
                                style={{ height: 320, objectFit: "cover" }}
                              />
                            </a>
                          </SwiperSlide>
                        ))}
                      </Swiper>

                      <Swiper
                        onSwiper={setThumbsSwiper}
                        spaceBetween={8}
                        slidesPerView={4}
                        breakpoints={{
                          576: { slidesPerView: 5 },
                          768: { slidesPerView: 6 },
                          1200: { slidesPerView: 5 },
                        }}
                        freeMode
                        watchSlidesProgress
                        watchOverflow
                        modules={[FreeMode, Thumbs]}
                        className="venue-view__gallery-thumbs"
                      >
                        {mediaImages.map((src, i) => (
                          <SwiperSlide key={`gallery-thumb-${src}-${i}`}>
                            <img
                              src={mediaUrl(src)}
                              alt={`media thumbnail ${i + 1}`}
                              className="rounded-2 border w-100 venue-view__thumb"
                              style={{ height: 68, objectFit: "cover", cursor: "pointer" }}
                            />
                          </SwiperSlide>
                        ))}
                      </Swiper>
                    </div>
                  ) : (
                    <div className="rounded-3 border p-4 text-center text-muted small venue-view__empty">No media images uploaded.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h3 className="h6 text-secondary text-uppercase small mb-3">Amenities</h3>
              <AmenitiesList amenities={venue.amenities} />
            </div>
          </div>

          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h3 className="h6 text-secondary text-uppercase small border-bottom pb-2 mb-3">Description</h3>
              {venue.description ? (
                <p className="mb-0 text-body-secondary venue-view__description">
                  {venue.description}
                </p>
              ) : (
                <p className="text-muted small mb-0">No description provided.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="col-xl-4">
          <div className="venue-view__sticky">
            <div className="card border-0 shadow-sm mb-3 venue-view__card">
              <div className="card-body">
                <h4 className="h6 mb-2">Admin quick info</h4>
                <p className="text-muted small mb-3">Only key fields needed for moderation and operations.</p>
                <div className="d-grid gap-2">
                  <div className="venue-view__info-chip">
                    <span>Status</span>
                    <strong>{titleCase(venue.status)}</strong>
                  </div>
                  <div className="venue-view__info-chip">
                    <span>Approval</span>
                    <strong>{venue.adminApproved ? "Approved" : "Pending review"}</strong>
                  </div>
                  <div className="venue-view__info-chip">
                    <span>{resolvedPrice.label}</span>
                    <strong>{priceDisplay}</strong>
                  </div>
                  <div className="venue-view__info-chip">
                    <span>Token amount</span>
                    <strong>{tokenDisplay}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm venue-view__card">
              <div className="card-body">
                <h4 className="h6 mb-3">Important notes</h4>
                <ul className="small text-muted mb-0 ps-3">
                  <li>Verify gallery quality and image relevance.</li>
                  <li>Ensure day price and token percentage are realistic.</li>
                </ul>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
