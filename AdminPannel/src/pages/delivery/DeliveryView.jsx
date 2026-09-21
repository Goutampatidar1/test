import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { adminUpdateDeliveryBoy } from "../../api/adminDeliveryBoys.js";
import { adminGetDeliveryBoy } from "../../api/adminDeliveryBoys.js";
import { logout } from "../../store/authSlice.js";
import { mediaDocumentUrl, mediaUrl } from "../../media.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { NotFoundPage } from "../NotFoundPage.jsx";

function DetailRow({ label, value }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-row__label">{label}</span>
      <span className="user-detail-row__value">{value ?? "—"}</span>
    </div>
  );
}

export function DeliveryView() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [delivery, setDelivery] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken || !deliveryId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminGetDeliveryBoy(adminToken, deliveryId);
        if (cancelled) return;
        if (!data) return setNotFound(true);
        setDelivery(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load delivery partner.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, deliveryId, dispatch]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="user-page"><p className="user-list-error">{error}</p></div>;
  if (!delivery) return <div className="user-page"><p className="static-cms-loading">Loading delivery partner...</p></div>;

  const avatar = mediaUrl(delivery.profileImage);
  const dlFront = mediaDocumentUrl(delivery.drivingLicenseFront);
  const dlBack = mediaDocumentUrl(delivery.drivingLicenseBack);
  const aadhaarFront = mediaDocumentUrl(delivery.aadhaarCardFront || delivery.aadhaarCard);
  const aadhaarBack = mediaDocumentUrl(delivery.aadhaarCardBack);
  const approval = String(delivery.approvalStatus || "pending").toLowerCase();
  const showApprove = approval !== "approved";
  const showReject = approval === "pending" || !delivery.approvalStatus;

  return (
    <div className="user-page vendor-detail-page">
      <div className="user-page__toolbar vendor-detail-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <div className="vendor-detail-page__title-block">
          <h2 className="user-page__title">Delivery Partner Details</h2>
          <p className="vendor-detail-page__meta">
            <span className="vendor-detail-page__approval-text">Admin Approval Status:</span>
            <span className={`pill pill--${delivery.approvalStatus === "approved" ? "vendor-approved" : delivery.approvalStatus === "pending" ? "vendor-pending" : "vendor-suspended"}`}>
              {delivery.approvalStatus || "pending"}
            </span>
          </p>
        </div>
        <div className="vendor-detail-page__actions">
          {showReject ? (
            <button
              type="button"
              className="btn btn--reject"
              onClick={async () => {
                await adminUpdateDeliveryBoy(adminToken, delivery._id, { approvalStatus: "rejected" });
                setDelivery((prev) => (prev ? { ...prev, approvalStatus: "rejected" } : prev));
                await Swal.fire({ icon: "success", title: "Delivery partner rejected", timer: 1500 });
              }}
            >
              Reject
            </button>
          ) : null}
          {showApprove ? (
            <button
              type="button"
              className="btn btn--approve"
              onClick={async () => {
                await adminUpdateDeliveryBoy(adminToken, delivery._id, { approvalStatus: "approved", status: "active" });
                setDelivery((prev) =>
                  prev ? { ...prev, approvalStatus: "approved", status: "active" } : prev
                );
                await Swal.fire({ icon: "success", title: "Delivery partner approved", timer: 1500 });
              }}
            >
              Approve
            </button>
          ) : null}
          <Link to="edit" className="btn btn--accent vendor-detail-page__edit">Edit</Link>
        </div>
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
            <DetailRow label="Name" value={delivery.name} />
            <DetailRow label="Email" value={delivery.email} />
            <DetailRow label="Phone" value={delivery.phone} />
            <DetailRow label="City" value={delivery.city} />
            <DetailRow label="Address" value={delivery.address} />
            <DetailRow label="Vehicle Registration No." value={delivery.vehicleRegistrationNumber} />
            <DetailRow label="License Number" value={delivery.licenseNumber} />
            <DetailRow label="Vehicle Type" value={delivery.vehicleType} />
            <DetailRow label="Bank Account Name" value={delivery.bankAccountName} />
            <DetailRow label="Account Number" value={delivery.accountNumber} />
            <DetailRow label="Bank Name" value={delivery.bankName} />
            <DetailRow label="Branch Name" value={delivery.branchName} />
            <DetailRow label="IFSC Code" value={delivery.ifscCode} />
            <DetailRow label="Status" value={delivery.status} />
            <DetailRow label="Approval Status" value={delivery.approvalStatus} />
          </div>
        </div>

        <section className="vendor-read-section">
          <h3 className="vendor-read-section__title">Documents</h3>
          <div className="vendor-doc-thumbs">
            {[
              { key: "dl-front", label: "Driving License Front", url: dlFront },
              { key: "dl-back", label: "Driving License Back", url: dlBack },
              { key: "aadhaar-front", label: "Aadhaar Card Front", url: aadhaarFront },
              { key: "aadhaar-back", label: "Aadhaar Card Back", url: aadhaarBack },
            ].map((doc) => (
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
      </div>
    </div>
  );
}
