import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import Swal from "sweetalert2";
import { VenueForm } from "../../components/venues/VenueForm.jsx";
import { vendorGetVenueById } from "../../api/vendorVenues.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

export function EditVenuePage() {
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

  return (
    <div className="user-page vendor-editor-page vendor-venues-add-page">
      <div className="user-page__toolbar d-flex flex-wrap align-items-center gap-3">
        <Link to={`/vendor/venues/${venueId}`} className="user-back-btn btn btn-light border" aria-label="Back to service">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </Link>
        <div className="flex-grow-1">
          <p className="vendor-editor-page__eyebrow text-secondary small text-uppercase mb-1">Edit service</p>
          <h2 className="user-page__title h4 mb-0">{venue.name}</h2>
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card card shadow-sm border-0">
        <div className="card-body p-3 p-md-4">
          <VenueForm
            mode="edit"
            venueId={venue._id}
            initialVenue={venue}
            onCancel={() => navigate(`/vendor/venues/${venueId}`)}
            onSuccess={async (venue) => {
              const approved = Boolean(venue?.adminApproved);
              await Swal.fire({
                icon: "success",
                title: "Service updated",
                text: approved
                  ? "Your changes were saved."
                  : "Your changes were saved and will appear after admin approval.",
                confirmButtonColor: "#141414",
              });
              navigate(`/vendor/venues/${venueId}`, { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
}
