import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminApproveProduct, adminGetProductById, adminRejectProduct } from "../../api/adminProducts.js";
import { mediaUrl } from "../../media.js";
import { AppImage } from "../../components/AppImage.jsx";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

function DetailRow({ label, value }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-row__label">{label}</span>
      <span className="user-detail-row__value">{value ?? "—"}</span>
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function normalizeProductPayload(data) {
  if (!data || typeof data !== "object") return null;
  const product =
    data.product && typeof data.product === "object" && !Array.isArray(data.product)
      ? { ...data.product }
      : { ...data };
  if (!product._id) return null;
  if (data.venue && typeof data.venue === "object") {
    product.venue = data.venue;
  }
  return product;
}

function formatTypedAmount(type, value) {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (type === "percentage") return `${n}%`;
  return String(n);
}

function attributeTitleLabels(product) {
  const titles = product.attributeTitles;
  if (!Array.isArray(titles) || titles.length === 0) return "—";
  const idToTitle = new Map();
  for (const c of product.combinations || []) {
    for (const a of c.attributes || []) {
      const id = a.attributeTitle?._id;
      const label = a.attributeTitle?.title;
      if (id != null && label) idToTitle.set(String(id), label);
    }
  }
  const resolved = titles.map((entry) => {
    if (typeof entry === "string") return idToTitle.get(entry) || entry;
    if (entry && typeof entry === "object") return entry.title || entry._id || "";
    return "";
  });
  return resolved.filter(Boolean).join(", ") || "—";
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function titleCase(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function statusPillClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "pill pill--active";
  if (normalized === "inactive") return "pill pill--inactive";
  return "pill pill--pay-neutral";
}

function approvedPillClass(isApproved) {
  return isApproved ? "pill pill--active" : "pill product-view-pill--no";
}

function isProductApproved(product) {
  return product?.role === "Admin" || Boolean(product?.adminApproved);
}

function formatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  if (n % 1 === 0) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Valid WGS84 coordinates for map embedding */
function venueLatLon(venue) {
  const lat = Number(venue?.latitude);
  const lon = Number(venue?.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** OpenStreetMap embed (no API key). bbox = minLon,minLat,maxLon,maxLat */
function openStreetMapEmbedUrl(lat, lon, span = 0.04) {
  const minLon = lon - span;
  const minLat = lat - span;
  const maxLon = lon + span;
  const maxLat = lat + span;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${minLon},${minLat},${maxLon},${maxLat}`)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
}

function ViewRow({ label, value }) {
  return (
    <div className="row g-2 venue-view__detail-row align-items-start">
      <div className="col-sm-4 text-muted small fw-semibold text-uppercase">{label}</div>
      <div className="col-sm-8 fw-medium text-break">{value ?? "—"}</div>
    </div>
  );
}

function VenueLinkedSection({ venue }) {
  if (!venue?._id) return null;
  const coords = venueLatLon(venue);
  const amenityList = Array.isArray(venue.amenities) ? venue.amenities : [];

  return (
    <div className="card border-0 shadow-sm mb-4 overflow-hidden">
      <div className="card-header bg-primary bg-opacity-10 border-0 py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h3 className="h6 mb-1 text-primary">Linked service</h3>
            <p className="mb-0 fw-semibold fs-6">{venue.name || "—"}</p>
            {venue.shortDescription ? (
              <p className="text-muted small mb-0 mt-2" style={{ maxWidth: "42rem" }}>
                {venue.shortDescription}
              </p>
            ) : null}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className={`badge ${venue.status === "active" ? "text-bg-success" : "text-bg-secondary"}`}>
              {titleCase(venue.status)}
            </span>
            {venue.adminApproved ? <span className="badge text-bg-info">Approved</span> : null}
            <Link to={`/admin/venues/${venue._id}`} className="btn btn-sm btn-outline-primary">
              Open service
            </Link>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="row g-4">
          <div className="col-lg-6">
            <div className="rounded-3 border bg-body-secondary bg-opacity-25 p-3 h-100">
              <h4 className="h6 text-secondary text-uppercase small mb-3 pb-2 border-bottom">Location &amp; details</h4>
              <ViewRow label="Address" value={venue.address || "—"} />
              <ViewRow
                label="City / state"
                value={[venue.city, venue.state].filter(Boolean).join(", ") || "—"}
              />
              <ViewRow label="Pincode" value={venue.pincode || "—"} />
              <ViewRow
                label="Coordinates"
                value={
                  coords
                    ? `${coords.lat}, ${coords.lon}`
                    : venue.latitude != null || venue.longitude != null
                      ? `${venue.latitude ?? "—"}, ${venue.longitude ?? "—"}`
                      : "—"
                }
              />
              <ViewRow label="Category" value={venue.category?.name || "—"} />
              <ViewRow label="Sub-category" value={venue.subCategory?.name || "—"} />
              <ViewRow label="Capacity" value={formatNumber(venue.capacity)} />
              <ViewRow label="Base price" value={formatNumber(venue.basePrice)} />
              <ViewRow label="Role" value={venue.role || "—"} />
              <ViewRow label="Added by" value={venue.addedById?.name || venue.addedById?.businessName || "—"} />
            </div>
          </div>
          <div className="col-lg-6">
            <h4 className="h6 text-secondary text-uppercase small mb-3">Map</h4>
            {coords ? (
              <>
                <div className="ratio ratio-4x3 rounded-3 overflow-hidden border shadow-sm bg-light">
                  <iframe
                    title={`Map: ${venue.name || "service"}`}
                    src={openStreetMapEmbedUrl(coords.lat, coords.lon)}
                    className="border-0 w-100 h-100"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
                <div className="d-flex flex-wrap align-items-center gap-2 mt-2 small">
                  <a
                    className="link-secondary"
                    href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=15/${coords.lat}/${coords.lon}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in OpenStreetMap
                  </a>
                  <span className="text-muted">·</span>
                  <a
                    className="link-secondary"
                    href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </>
            ) : (
              <div className="rounded-3 border border-dashed p-4 text-center text-muted small">
                Add valid latitude and longitude on the service to show a map.
              </div>
            )}
          </div>
        </div>

        <div className="row g-4 mt-1">
          <div className="col-lg-6">
            <h4 className="h6 text-secondary text-uppercase small mb-3">Service media</h4>
            {venue.thumbnail ? (
              <a href={mediaUrl(venue.thumbnail)} target="_blank" rel="noreferrer" className="d-block mb-3">
                <img
                  src={mediaUrl(venue.thumbnail)}
                  alt=""
                  className="img-fluid rounded-3 border shadow-sm w-100 object-fit-cover"
                  style={{ maxHeight: 240 }}
                />
              </a>
            ) : (
              <p className="text-muted small mb-0">No thumbnail</p>
            )}
            {Array.isArray(venue.images) && venue.images.length > 0 ? (
              <div>
                <span className="text-muted small d-block mb-2 fw-semibold">Gallery ({venue.images.length})</span>
                <div className="d-flex flex-wrap gap-2">
                  {venue.images.map((src, i) => (
                    <a key={`${src}-${i}`} href={mediaUrl(src)} target="_blank" rel="noreferrer" className="d-block">
                      <img
                        src={mediaUrl(src)}
                        alt=""
                        className="rounded-3 border shadow-sm"
                        style={{ width: 80, height: 80, objectFit: "cover" }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="col-lg-6">
            <h4 className="h6 text-secondary text-uppercase small mb-3">Amenities</h4>
            {amenityList.length === 0 ? (
              <p className="text-muted small mb-0">No amenities listed for this service.</p>
            ) : (
              <ul className="list-group list-group-flush rounded-3 border shadow-sm">
                {amenityList.map((a, index) => {
                  const name = typeof a === "string" ? a : a?.name || "—";
                  const id = typeof a === "object" && a?._id ? a._id : `amenity-${index}`;
                  const icon = typeof a === "object" && a?.icon ? mediaUrl(a.icon) : null;
                  const st = typeof a === "object" && a?.status ? titleCase(a.status) : null;
                  return (
                    <li
                      key={id}
                      className="list-group-item d-flex align-items-center gap-3 py-3 px-3"
                    >
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
                        <span className={`badge flex-shrink-0 ${a?.status === "active" ? "text-bg-success" : "text-bg-secondary"}`}>
                          {st}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {venue.description ? (
          <div className="mt-4 pt-4 border-top">
            <h4 className="h6 text-secondary text-uppercase small mb-3">Service description</h4>
            <p className="mb-0 text-body-secondary" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {venue.description}
            </p>
          </div>
        ) : null}

        <div className="mt-4 pt-3 border-top d-flex flex-wrap gap-3 text-muted small">
          <span>
            <span className="fw-semibold text-body-secondary">Created</span> {formatDateTime(venue.createdAt)}
          </span>
          <span>
            <span className="fw-semibold text-body-secondary">Updated</span> {formatDateTime(venue.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProductView() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [approvalUpdating, setApprovalUpdating] = useState(false);

  const onApprove = async () => {
    if (!adminToken || !productId || approvalUpdating) return;
    setApprovalUpdating(true);
    try {
      const updated = await adminApproveProduct(adminToken, productId);
      if (updated) setProduct((prev) => ({ ...prev, ...updated }));
      await Swal.fire({ icon: "success", title: "Product approved", timer: 1500, showConfirmButton: false });
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approve failed", text: e.message || "Could not approve product." });
    } finally {
      setApprovalUpdating(false);
    }
  };

  const onReject = async () => {
    if (!adminToken || !productId || approvalUpdating) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Reject product?",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Reject",
    });
    if (!isConfirmed) return;
    setApprovalUpdating(true);
    try {
      const updated = await adminRejectProduct(adminToken, productId);
      if (updated) setProduct((prev) => ({ ...prev, ...updated }));
      await Swal.fire({ icon: "success", title: "Product rejected", timer: 1500, showConfirmButton: false });
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Reject failed", text: e.message || "Could not reject product." });
    } finally {
      setApprovalUpdating(false);
    }
  };

  useEffect(() => {
    if (!adminToken || !productId) return;
    let cancelled = false;

    (async () => {
      setError("");
      setNotFound(false);
      try {
        const data = await adminGetProductById(adminToken, productId);
        if (cancelled) return;
        const payload = normalizeProductPayload(data);
        if (!payload?._id) {
          setNotFound(true);
          return;
        }
        setProduct(payload);
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
        setError(e.message || "Failed to load product.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, productId]);

  if (notFound) return <NotFoundPage />;

  if (error) {
    return (
      <div className="user-page product-view-page">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="user-page product-view-page">
        <div className="d-flex align-items-center gap-2 text-muted py-4">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading product…
        </div>
      </div>
    );
  }

  const comboCount = Array.isArray(product.combinations) ? product.combinations.length : 0;

  return (
    <div className="user-page product-view-page">
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
              <h1 className="user-page__title h4 mb-1">Product details</h1>
              <p className="user-page__subtitle text-muted small mb-0">
                {product.name ? <span className="fw-semibold text-body">{product.name}</span> : null}
                {product.sku ? <span className="ms-2">· SKU {product.sku}</span> : null}
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {product.role === "Vendor" && !isProductApproved(product) ? (
                <>
                  <button
                    type="button"
                    className="btn btn--approve btn-sm text-nowrap"
                    disabled={
                      approvalUpdating ||
                      product.addedById?.approvalStatus !== "approved"
                    }
                    title={
                      product.addedById?.approvalStatus !== "approved"
                        ? "Approve the vendor account first"
                        : "Approve product"
                    }
                    onClick={onApprove}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm text-nowrap"
                    disabled={approvalUpdating}
                    onClick={onReject}
                  >
                    Reject
                  </button>
                </>
              ) : null}
              <Link to={`/admin/products/${productId}/edit`} className="btn btn--accent btn--sm text-nowrap">
                Edit product
              </Link>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <span className={statusPillClass(product.status)}>{titleCase(product.status)}</span>
            <span className={approvedPillClass(isProductApproved(product))}>
              {isProductApproved(product) ? "Approved" : "Not approved"}
            </span>
            <span className="pill pill--pay-neutral">{titleCase(product.variantType)}</span>
          </div>
          <div className="row g-3">
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Category</span>
                <strong>{product.category?.name || "—"}</strong>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Base price</span>
                <strong>{formatNumber(product.price)}</strong>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Stock</span>
                <strong>{formatNumber(product.stock)}</strong>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="venue-view__metric">
                <span className="venue-view__metric-label">Combinations</span>
                <strong>{comboCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="product-view-layout">
        <div className="product-view-layout__main">
          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h2 className="h6 text-secondary text-uppercase small border-bottom pb-2 mb-3">General information</h2>
              <div className="rounded-3 border p-3 bg-white">
                <ViewRow label="Name" value={product.name} />
                <ViewRow label="SKU" value={product.sku} />
                <ViewRow label="Category" value={product.category?.name} />
                <ViewRow label="Sub-category" value={product.subCategory?.name} />
                <ViewRow label="Variant type" value={titleCase(product.variantType)} />
                <ViewRow label="MOQ" value={product.moq} />
                <ViewRow
                  label="Status"
                  value={<span className={statusPillClass(product.status)}>{titleCase(product.status)}</span>}
                />
                <ViewRow
                  label="Admin approved"
                  value={<span className={approvedPillClass(isProductApproved(product))}>{yesNo(isProductApproved(product))}</span>}
                />
                <ViewRow label="Added by" value={product.addedById?.name} />
                <ViewRow label="Base price" value={formatNumber(product.price)} />
                <ViewRow label="Base stock" value={formatNumber(product.stock)} />
                <ViewRow
                  label="Discount"
                  value={`${titleCase(product.discountType)} (${formatTypedAmount(product.discountType, product.discountValue)})`}
                />
                <ViewRow label="Combinations" value={comboCount} />
              </div>
            </div>
          </div>

          {product.venue ? <VenueLinkedSection venue={product.venue} /> : null}

          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h2 className="h6 text-secondary text-uppercase small border-bottom pb-2 mb-3">Product media</h2>
              <div className="product-view-media">
                <div className="product-view-media__block product-view-media__block--wide">
                  <span className="product-view-media__label">Thumbnail</span>
                  <div className="product-view-media__link product-view__thumbnail-frame">
                    <AppImage
                      src={product.thumbnail}
                      alt=""
                      className="product-view-media__img product-view-media__img--hero w-100"
                    />
                  </div>
                </div>
                {Array.isArray(product.images) && product.images.length > 0 ? (
                  <div className="product-view-media__block flex-grow-1" style={{ minWidth: "200px" }}>
                    <span className="product-view-media__label">Gallery ({product.images.length})</span>
                    <div className="product-view-media__gallery">
                      {product.images.map((src, i) => (
                        <AppImage
                          key={`${src}-${i}`}
                          src={src}
                          alt=""
                          className="product-view-media__img product-view-media__img--tiny rounded-2"
                          style={{ width: 72, height: 72, objectFit: "cover", maxWidth: "none", maxHeight: "none" }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {Array.isArray(product.videos) && product.videos.length > 0 ? (
                  <div className="product-view-media__block flex-grow-1" style={{ minWidth: "220px" }}>
                    <span className="product-view-media__label">Videos ({product.videos.length})</span>
                    <div className="product-view-media__gallery">
                      {product.videos.map((src, i) => (
                        <video
                          key={`${src}-${i}`}
                          src={mediaUrl(src)}
                          className="rounded-2"
                          style={{ width: 140, height: 88, objectFit: "cover", background: "#111" }}
                          muted
                          playsInline
                          controls
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h2 className="h6 text-secondary text-uppercase small border-bottom pb-2 mb-3">Descriptions</h2>
              <div className="mb-4">
                <h3 className="small text-muted text-uppercase mb-2">Description</h3>
                {product.description ? (
                  <p className="mb-0 text-body-secondary venue-view__description">{product.description}</p>
                ) : (
                  <p className="text-muted small mb-0">—</p>
                )}
              </div>
              <div className="mb-4">
                <h3 className="small text-muted text-uppercase mb-2">Short description</h3>
                {product.shortDescription ? (
                  <p className="mb-0 text-body-secondary">{product.shortDescription}</p>
                ) : (
                  <p className="text-muted small mb-0">—</p>
                )}
              </div>
              <div>
                <h3 className="small text-muted text-uppercase mb-2">Attribute titles</h3>
                <p className="mb-0 fw-medium">{attributeTitleLabels(product)}</p>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm venue-view__card">
            <div className="card-body">
              <h2 className="h6 text-secondary text-uppercase small border-bottom pb-2 mb-3">Product combinations</h2>
              {!Array.isArray(product.combinations) || product.combinations.length === 0 ? (
                <p className="text-muted small mb-0">No combinations available.</p>
              ) : (
                <div className="table-responsive rounded-2 border overflow-hidden">
                  <table className="data-table data-table--compact mb-0">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Price</th>
                        <th>Discount</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Attributes</th>
                        <th>Images</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.combinations.map((combination, index) => (
                        <tr key={`${combination.sku || "sku"}-${index}`}>
                          <td className="data-table__mono text-nowrap">{combination.sku || "—"}</td>
                          <td className="data-table__mono">{formatNumber(combination.price)}</td>
                          <td>{formatTypedAmount(product.discountType, combination.discountValue)}</td>
                          <td className="data-table__mono">{formatNumber(combination.stock)}</td>
                          <td>
                            <span className={statusPillClass(combination.status)}>{titleCase(combination.status)}</span>
                          </td>
                          <td className="data-table__muted" style={{ minWidth: "12rem" }}>
                            {Array.isArray(combination.attributes) && combination.attributes.length
                              ? combination.attributes
                                  .map((a) => `${a.attributeTitle?.title || "—"}: ${a.attributeValue?.value || "—"}`)
                                  .join(", ")
                              : "—"}
                          </td>
                          <td>
                            {Array.isArray(combination.images) && combination.images.length ? (
                              <div className="product-view-media__gallery product-view-media__gallery--compact">
                                {combination.images.map((src, imgIdx) => (
                                  <a
                                    key={`${src}-${imgIdx}`}
                                    href={mediaUrl(src)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="product-view-media__link"
                                  >
                                    <img
                                      src={mediaUrl(src)}
                                      alt={`Combination ${index + 1} image ${imgIdx + 1}`}
                                      className="product-view-media__img product-view-media__img--tiny rounded-1"
                                    />
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <span className="data-table__muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="product-view-layout__side venue-view__sticky">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h2 className="product-view-metric-card__title">Pricing &amp; inventory</h2>
              <div className="product-view-metric-list small">
                <DetailRow label="Base price" value={formatNumber(product.price)} />
                <DetailRow
                  label="Discount"
                  value={`${titleCase(product.discountType)} · ${formatTypedAmount(product.discountType, product.discountValue)}`}
                />
                <DetailRow label="Base stock" value={formatNumber(product.stock)} />
                <DetailRow label="Combinations" value={comboCount} />
                <DetailRow
                  label="Status"
                  value={<span className={statusPillClass(product.status)}>{titleCase(product.status)}</span>}
                />
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h2 className="product-view-metric-card__title">Metadata</h2>
              <div className="product-view-metric-list small">
                <DetailRow label="Created" value={formatDateTime(product.createdAt)} />
                <DetailRow label="Updated" value={formatDateTime(product.updatedAt)} />
                <DetailRow label="Added by" value={product.addedById?.name || "—"} />
                <DetailRow
                  label="Admin approved"
                  value={<span className={approvedPillClass(isProductApproved(product))}>{yesNo(isProductApproved(product))}</span>}
                />
                <DetailRow label="Role" value={product.role || "—"} />
                <DetailRow label="MOQ" value={product.moq ?? "—"} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
