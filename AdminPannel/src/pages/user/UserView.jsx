import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { adminGetUser } from "../../api/adminUsers.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { NotFoundPage } from "../NotFoundPage.jsx";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function DetailRow({ label, value }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-row__label">{label}</span>
      <span className="user-detail-row__value">{value ?? "—"}</span>
    </div>
  );
}

export function UserView() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [user, setUser] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken || !userId) return;
    let cancelled = false;
    (async () => {
      setError("");
      setNotFound(false);
      try {
        const u = await adminGetUser(adminToken, userId);
        if (cancelled) return;
        if (!u) {
          setNotFound(true);
          return;
        }
        setUser(u);
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
        setError(e.message || "Failed to load user.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, userId]);

  if (notFound) {
    return <NotFoundPage />;
  }

  if (error) {
    return (
      <div className="user-page">
        <p className="user-list-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Back to users
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading user…</p>
      </div>
    );
  }

  const avatar = mediaUrl(user?.profileImage);

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="user-page__toolbar-text">
          <h2 className="user-page__title">User details</h2>
        </div>
        <Link to="edit" className="btn btn--accent user-page__edit-link">
          Edit user
        </Link>
      </div>

      <div className="page-card user-view-card">
        <div className="user-view-head">
          <div className="user-view-avatar-wrap">
            {avatar ? (
              <img src={avatar} alt="" className="user-view-avatar" width={96} height={96} />
            ) : (
              <div className="user-view-avatar user-view-avatar--ph">
                <ProfileImagePlaceholder size={40} />
              </div>
            )}
          </div>
          <div className="user-view-grid">
            <DetailRow label="Full name" value={user.name} />
            <DetailRow label="Email ID" value={user.email} />
            <DetailRow label="Mobile Number" value={user.phone} />
            <DetailRow label="Sub-district" value={user.subDistrict} />
            <DetailRow label="City" value={user.city} />
            <DetailRow label="Status" value={user.status} />
            <DetailRow label="Created At" value={formatDate(user.createdAt)} />
          </div>
        </div>
      </div>
    </div>
  );
}
