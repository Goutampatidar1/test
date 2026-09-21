import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetVenueVendor } from "../../api/adminVenueVendors.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { VenueVendorProfileForm } from "./VenueVendorAdd.jsx";

export function VenueVendorEdit() {
  const { venueVendorId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [venueVendor, setVenueVendor] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!adminToken || !venueVendorId) return;
    let cancelled = false;
    (async () => {
      setLoadError("");
      setNotFound(false);
      try {
        const v = await adminGetVenueVendor(adminToken, venueVendorId);
        if (cancelled) return;
        if (!v) return setNotFound(true);
        setVenueVendor(v);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setLoadError(e.message || "Failed to load service vendor.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, venueVendorId]);

  if (notFound) return <NotFoundPage />;
  if (loadError) return <div className="user-page"><p className="user-list-error">{loadError}</p></div>;
  if (!venueVendor) return <div className="user-page"><p className="static-cms-loading">Loading service vendor...</p></div>;

  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <h2 className="user-page__title">Edit Service Vendor</h2>
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card">
        <VenueVendorProfileForm
          mode="edit"
          venueVendorId={venueVendor._id}
          initialVenueVendor={venueVendor}
          onCancel={() => navigate(-1)}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Service vendor updated", timer: 1500 });
            navigate(-1);
          }}
        />
      </div>
    </div>
  );
}
