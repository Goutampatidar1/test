import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetVenueById } from "../../api/adminVenues.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { VenueForm } from "./VenueAdd.jsx";

export function VenueEdit() {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [venue, setVenue] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!adminToken || !venueId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminGetVenueById(adminToken, venueId);
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
  }, [adminToken, dispatch, venueId]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="user-page"><p className="user-list-error">{error}</p></div>;
  if (!venue) return <div className="user-page"><p className="static-cms-loading">Loading service...</p></div>;

  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <h2 className="user-page__title">Edit Service</h2>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card">
        <VenueForm
          mode="edit"
          venueId={venue._id}
          initialVenue={venue}
          onCancel={() => navigate("/admin/venues")}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Service updated", timer: 1500 });
            navigate("/admin/venues");
          }}
        />
      </div>
    </div>
  );
}
