import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { adminGetDriverCodDetail } from "../../api/adminDeliveryCod.js";
import { DriverCodSection } from "../../components/DriverCodSection.jsx";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { NotFoundPage } from "../NotFoundPage.jsx";

export function DeliveryCodSettle() {
  const { driverId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [summary, setSummary] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = async () => {
    if (!adminToken || !driverId) return;
    setError("");
    try {
      const data = await adminGetDriverCodDetail(adminToken, driverId);
      if (!data?.driver) {
        setNotFound(true);
        return;
      }
      setSummary(data);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      if (e?.status === 404) return setNotFound(true);
      setError(e.message || "Failed to load driver COD details.");
    }
  };

  useEffect(() => {
    loadSummary();
  }, [adminToken, driverId, dispatch]);

  if (notFound) return <NotFoundPage />;
  if (error) {
    return (
      <div className="user-page">
        <p className="user-list-error">{error}</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading COD settlement…</p>
      </div>
    );
  }

  const driver = summary.driver;
  const avatar = mediaUrl(driver.profileImage);

  return (
    <div className="driver-cod-page">
      <div className="driver-cod-page__toolbar page-card">
        <button
          type="button"
          className="user-back-btn"
          aria-label="Back"
          onClick={() => navigate("/admin/delivery-cod")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>

        <div className="driver-cod-page__driver">
          <span className="driver-cod-page__avatar" aria-hidden="true">
            {avatar ? (
              <img src={avatar} alt="" className="driver-cod-page__avatar-img" width={48} height={48} />
            ) : (
              <ProfileImagePlaceholder size={24} />
            )}
          </span>
          <div>
            <p className="driver-cod-page__eyebrow">Driver COD Collection</p>
            <h2 className="driver-cod-page__title">{driver.name || "Driver"}</h2>
            <p className="driver-cod-page__meta">
              {driver.phone || "—"} · {driver.email || "—"}
            </p>
          </div>
        </div>

        <div className="driver-cod-page__actions">
          <Link to={`/admin/delivery/${driver._id}`} className="btn btn--ghost">
            Open driver profile
          </Link>
        </div>
      </div>

      <DriverCodSection adminToken={adminToken} driverId={driver._id} onSettled={loadSummary} />
    </div>
  );
}
