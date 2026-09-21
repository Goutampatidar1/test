import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetAmenityById } from "../../api/adminAmenities.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { AmenitiesForm } from "./AmenitiesAdd.jsx";

export function AmenitiesEdit() {
  const { amenityId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [amenity, setAmenity] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!adminToken || !amenityId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminGetAmenityById(adminToken, amenityId);
        if (cancelled) return;
        if (!data) return setNotFound(true);
        setAmenity(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load amenity.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, amenityId]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="user-page"><p className="user-list-error">{error}</p></div>;
  if (!amenity) return <div className="user-page"><p className="static-cms-loading">Loading amenity...</p></div>;

  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <h2 className="user-page__title">Edit Amenity</h2>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card">
        <AmenitiesForm
          mode="edit"
          amenityId={amenity._id}
          initialAmenity={amenity}
          onCancel={() => navigate("/admin/amenities")}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Amenity updated", timer: 1500 });
            navigate("/admin/amenities");
          }}
        />
      </div>
    </div>
  );
}
