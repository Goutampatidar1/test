import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { adminGetAmenityById } from "../../api/adminAmenities.js";
import { mediaUrl } from "../../media.js";
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

export function AmenitiesView() {
  const { amenityId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [amenity, setAmenity] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken || !amenityId) return;
    let cancelled = false;

    (async () => {
      setError("");
      setNotFound(false);
      try {
        const payload = await adminGetAmenityById(adminToken, amenityId);
        if (cancelled) return;
        if (!payload?._id) {
          setNotFound(true);
          return;
        }
        setAmenity(payload);
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
        setError(e.message || "Failed to load amenity.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, amenityId]);

  if (notFound) return <NotFoundPage />;

  if (error) {
    return (
      <div className="user-page">
        <p className="user-list-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!amenity) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading amenity...</p>
      </div>
    );
  }

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="user-page__toolbar-text">
          <h2 className="user-page__title">Amenity Details</h2>
          <p className="user-page__subtitle">View amenity information and listing metadata.</p>
        </div>
      </div>

      <div className="page-card user-view-card">
        <div className="page-card__head">
          <h3 className="page-card__title">General Information</h3>
        </div>
        <div className="user-view-grid">
          <DetailRow label="Name" value={amenity.name} />
          <DetailRow
            label="Icon"
            value={
              amenity.icon ? (
                <img src={mediaUrl(amenity.icon)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10 }} />
              ) : (
                "—"
              )
            }
          />
          <DetailRow label="Description" value={amenity.description || "—"} />
          <DetailRow label="Added By" value={amenity.addedById?.name || "—"} />
          <DetailRow label="Status" value={<span className={statusPillClass(amenity.status)}>{titleCase(amenity.status)}</span>} />
          <DetailRow label="Created At" value={formatDateTime(amenity.createdAt)} />
          <DetailRow label="Updated At" value={formatDateTime(amenity.updatedAt)} />
        </div>
      </div>
    </div>
  );
}
