import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetVendor } from "../../api/adminVendors.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { VendorProfileForm } from "./VendorAdd.jsx";

export function VendorEdit() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [vendor, setVendor] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!adminToken || !vendorId) return;
    let cancelled = false;
    (async () => {
      setLoadError("");
      setNotFound(false);
      try {
        const v = await adminGetVendor(adminToken, vendorId);
        if (cancelled) return;
        if (!v) return setNotFound(true);
        setVendor(v);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) {
          dispatch(logout());
          return;
        }
        if (e?.status === 404) return setNotFound(true);
        setLoadError(e.message || "Failed to load vendor.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, vendorId]);

  if (notFound) return <NotFoundPage />;
  if (loadError) return <div className="user-page"><p className="user-list-error">{loadError}</p></div>;
  if (!vendor) return <div className="user-page"><p className="static-cms-loading">Loading vendor…</p></div>;

  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <h2 className="user-page__title">Edit Vendor</h2>
          {/* <p className="user-page__subtitle">Update details for {vendor.businessName || vendor.name}</p> */}
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card">
        <VendorProfileForm
          mode="edit"
          vendorId={vendor._id}
          initialVendor={vendor}
          onCancel={() => navigate(-1)}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Vendor updated", timer: 1500 });
            navigate(-1);
          }}
        />
      </div>
    </div>
  );
}
