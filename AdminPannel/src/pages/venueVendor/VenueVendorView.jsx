import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminGetVenueVendor, adminUpdateVenueVendor } from "../../api/adminVenueVendors.js";
import { logout } from "../../store/authSlice.js";
import { mediaDocumentUrl, mediaUrl } from "../../media.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { promptRejectionReason } from "../../utils/promptRejectionReason.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { VendorOrdersSection } from "../../components/VendorOrdersSection.jsx";

function DetailRow({ label, value }) {
  return <div className="user-detail-row"><span className="user-detail-row__label">{label}</span><span className="user-detail-row__value">{value ?? "—"}</span></div>;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function approvalPillClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "pill pill--vendor-approved";
  if (s === "rejected" || s === "suspended") return "pill pill--vendor-suspended";
  return "pill pill--vendor-pending";
}

function formatStatusText(status) {
  const s = String(status || "").trim();
  if (!s) return "Pending";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function VenueVendorView() {
  const navigate = useNavigate();
  const { venueVendorId } = useParams();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [venueVendor, setVenueVendor] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken || !venueVendorId) return;
    let cancelled = false;
    (async () => {
      setError("");
      setNotFound(false);
      try {
        const data = await adminGetVenueVendor(adminToken, venueVendorId);
        if (cancelled) return;
        if (!data) return setNotFound(true);
        setVenueVendor(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load service vendor.");
      }
    })();
    return () => { cancelled = true; };
  }, [adminToken, dispatch, venueVendorId]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="user-page"><p className="user-list-error">{error}</p></div>;
  if (!venueVendor) return <div className="user-page"><p className="static-cms-loading">Loading service vendor...</p></div>;

  const handleReject = async () => {
    const rejectionReason = await promptRejectionReason({ title: "Reject service vendor" });
    if (!rejectionReason) return;
    try {
      await adminUpdateVenueVendor(adminToken, venueVendor._id, {
        approvalStatus: "rejected",
        rejectionReason,
        status: "inactive",
      });
      await Swal.fire({ icon: "success", title: "Service vendor rejected", timer: 1500 });
      setVenueVendor((prev) =>
        prev ? { ...prev, approvalStatus: "rejected", status: "inactive", rejectionReason } : prev
      );
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Rejection failed", text: e.message || "Could not reject service vendor." });
    }
  };

  const handleApprove = async () => {
    try {
      await adminUpdateVenueVendor(adminToken, venueVendor._id, { approvalStatus: "approved", status: "active" });
      await Swal.fire({ icon: "success", title: "Service vendor approved", timer: 1500 });
      setVenueVendor((prev) => (prev ? { ...prev, approvalStatus: "approved", status: "active" } : prev));
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approval failed", text: e.message || "Could not approve service vendor." });
    }
  };

  const docs = [
    { key: "aadhaarCardFront", label: "Aadhaar Front", url: mediaDocumentUrl(venueVendor.aadhaarCardFront || venueVendor.aadhaarCard) },
    { key: "aadhaarCardBack", label: "Aadhaar Back", url: mediaDocumentUrl(venueVendor.aadhaarCardBack) },
    { key: "panCard", label: "PAN Card", url: mediaDocumentUrl(venueVendor.panCard) },
  ];

  const approval = String(venueVendor.approvalStatus || "pending").toLowerCase();
  const isPendingApproval = approval === "pending" || !venueVendor.approvalStatus;
  const showApprove = isPendingApproval;
  const showReject = isPendingApproval;

  return (
    <div className="user-page vendor-detail-page">
      <div className="user-page__toolbar vendor-detail-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="vendor-detail-page__title-block">
          <h2 className="user-page__title">Service Vendor Details</h2>
          <p className="vendor-detail-page__meta">
            <span className="vendor-detail-page__approval-text">Admin Approval Status:</span>
            <span className={approvalPillClass(venueVendor.approvalStatus || venueVendor.status)}>
              {formatStatusText(venueVendor.approvalStatus || venueVendor.status)}
            </span>
          </p>
        </div>
        <div className="vendor-detail-page__actions">
          {showReject ? (
            <button type="button" className="btn btn--reject" onClick={handleReject}>
              Reject
            </button>
          ) : null}
          {showApprove ? (
            <button type="button" className="btn btn--approve" onClick={handleApprove}>
              Approve
            </button>
          ) : null}
          <Link to="edit" className="btn btn--accent vendor-detail-page__edit">
            Edit service vendor
          </Link>
        </div>
      </div>

      <div className="page-card user-view-card">
        <div className="user-view-head">
          <div className="user-view-avatar-wrap">
            {mediaUrl(venueVendor.profileImage) ? (
              <img src={mediaUrl(venueVendor.profileImage)} alt="" className="user-view-avatar" width={96} height={96} />
            ) : (
              <div className="user-view-avatar user-view-avatar--ph">
                <ProfileImagePlaceholder size={40} />
              </div>
            )}
          </div>
          <div className="user-view-grid">
            <DetailRow label="Full Name" value={venueVendor.name} />
            <DetailRow label="Email ID" value={venueVendor.email} />
            <DetailRow label="Mobile Number" value={venueVendor.phone} />
            <DetailRow label="Business Name" value={venueVendor.businessName} />
            <DetailRow label="Business Mobile Number" value={venueVendor.businessPhone} />
            <DetailRow label="Business Email ID" value={venueVendor.businessEmail} />
            <DetailRow label="Address" value={venueVendor.businessAddress} />
            <DetailRow label="Description" value={venueVendor.businessDescription} />
            <DetailRow label="PAN Number" value={venueVendor.panNumber} />
            <DetailRow label="GST Number" value={venueVendor.gstNumber} />
            <DetailRow label="Bank Name" value={venueVendor.bankName} />
            <DetailRow label="Branch Name" value={venueVendor.branchName} />
            <DetailRow label="Account Type" value={venueVendor.accountType} />
            <DetailRow label="Account Number" value={venueVendor.accountNumber} />
            <DetailRow label="IFSC Code" value={venueVendor.ifscCode} />
            <DetailRow label="Status" value={venueVendor.status} />
            <DetailRow label="Approval Status" value={venueVendor.approvalStatus} />
            {venueVendor.approvalStatus === "rejected" && venueVendor.rejectionReason ? (
              <DetailRow label="Rejection Reason" value={venueVendor.rejectionReason} />
            ) : null}
            <DetailRow label="Created At" value={formatDate(venueVendor.createdAt)} />
          </div>
        </div>

        <section className="vendor-read-section">
          <h3 className="vendor-read-section__title">Documents</h3>
          <div className="vendor-doc-thumbs">
            {docs.map((doc) => (
              <div key={doc.key} className="vendor-doc-thumb">
                {doc.url ? <img src={doc.url} alt={doc.label} className="vendor-doc-thumb__ph" /> : <div className="vendor-doc-thumb__ph" />}
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="vendor-doc-thumb__link">{doc.label}</a>
                ) : (
                  <span className="vendor-doc-thumb__link" style={{ textDecoration: "none", color: "#6b7280", cursor: "default" }}>{doc.label}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <VendorOrdersSection
          adminToken={adminToken}
          kind="venue"
          ownerId={venueVendor._id}
          onUnauthorized={() => dispatch(logout())}
        />
      </div>
    </div>
  );
}
