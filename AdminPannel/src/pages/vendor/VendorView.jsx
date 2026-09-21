import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { A11y, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { adminGetVendor, adminUpdateVendor } from "../../api/adminVendors.js";
import { logout } from "../../store/authSlice.js";
import { mediaDocumentUrl, mediaUrl } from "../../media.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { promptRejectionReason } from "../../utils/promptRejectionReason.js";
import { NotFoundPage } from "../NotFoundPage.jsx";
import { VendorOrdersSection } from "../../components/VendorOrdersSection.jsx";
function DetailRow({ label, value }) {
  return <div className="user-detail-row"><span className="user-detail-row__label">{label}</span><span className="user-detail-row__value">{value ?? "—"}</span></div>;
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

function isVideoMediaUrl(url) {
  return /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i.test(String(url || ""));
}

/** Split URLs so video files wrongly stored under shopImages still show under videos. */
function buildShopImageAndVideoLists(vendor, mediaUrlFn) {
  const rawFromShopImages = Array.isArray(vendor?.shopImages)
    ? vendor.shopImages.map((p) => mediaUrlFn(p)).filter(Boolean)
    : vendor?.shopImage
      ? [mediaUrlFn(vendor.shopImage)].filter(Boolean)
      : [];

  const imageUrls = [];
  const strayVideoUrls = [];
  for (const url of rawFromShopImages) {
    (isVideoMediaUrl(url) ? strayVideoUrls : imageUrls).push(url);
  }

  const fromShopVideos = Array.isArray(vendor?.shopVideos)
    ? vendor.shopVideos.map((p) => mediaUrlFn(p)).filter(Boolean)
    : [];

  const videoSeen = new Set();
  const shopVideoUrls = [];
  for (const u of [...strayVideoUrls, ...fromShopVideos]) {
    if (!u || videoSeen.has(u)) continue;
    videoSeen.add(u);
    shopVideoUrls.push(u);
  }

  return { shopImageUrls: imageUrls, shopVideoUrls };
}

function ShopImageSwiper({ urls }) {
  if (!urls?.length) return null;
  const multi = urls.length > 1;
  return (
    <Swiper
      modules={[Navigation, Pagination, A11y]}
      spaceBetween={16}
      slidesPerView={1}
      navigation={multi}
      pagination={multi ? { type: "fraction" } : false}
      className="vendor-media-swiper vendor-media-swiper--images w-100"
      aria-label="Shop photo gallery"
    >
      {urls.map((url, i) => (
        <SwiperSlide key={`${url}-${i}`}>
          <figure className="vendor-media-swiper__figure">
            <img src={url} alt={`Shop photo ${i + 1}`} className="vendor-media-swiper__img" loading="lazy" />
            <figcaption className="vendor-media-swiper__caption">
              <a href={url} target="_blank" rel="noreferrer" className="vendor-media-swiper__open">
                Photo {i + 1} — open full size
              </a>
            </figcaption>
          </figure>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

function ShopVideoSwiper({ urls }) {
  if (!urls?.length) return null;
  const multi = urls.length > 1;
  return (
    <Swiper
      modules={[Navigation, Pagination, A11y]}
      spaceBetween={16}
      slidesPerView={1}
      navigation={multi}
      pagination={multi ? { type: "fraction" } : false}
      className="vendor-media-swiper vendor-media-swiper--videos w-100"
      aria-label="Shop video gallery"
    >
      {urls.map((url, i) => (
        <SwiperSlide key={`${url}-${i}`}>
          <div className="vendor-media-swiper__video-slide">
            <video src={url} className="vendor-media-swiper__video" controls playsInline preload="metadata" />
            <a href={url} target="_blank" rel="noreferrer" className="vendor-media-swiper__open">
              Video {i + 1} — open in new tab
            </a>
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}

export function VendorView() {
  const navigate = useNavigate();
  const { vendorId } = useParams();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [vendor, setVendor] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken || !vendorId) return;
    let cancelled = false;
    (async () => {
      setError("");
      setNotFound(false);
      try {
        const data = await adminGetVendor(adminToken, vendorId);
        if (cancelled) return;
        if (!data) return setNotFound(true);
        setVendor(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load vendor.");
      }
    })();
    return () => { cancelled = true; };
  }, [adminToken, dispatch, vendorId]);

  if (notFound) return <NotFoundPage />;
  if (error) return <div className="user-page"><p className="user-list-error">{error}</p></div>;
  if (!vendor) return <div className="user-page"><p className="static-cms-loading">Loading vendor…</p></div>;

  const handleReject = async () => {
    const rejectionReason = await promptRejectionReason({ title: "Reject vendor" });
    if (!rejectionReason) return;
    try {
      await adminUpdateVendor(adminToken, vendor._id, {
        approvalStatus: "rejected",
        rejectionReason,
        status: "inactive",
      });
      await Swal.fire({ icon: "success", title: "Vendor rejected", timer: 1500 });
      setVendor((prev) =>
        prev ? { ...prev, approvalStatus: "rejected", status: "inactive", rejectionReason } : prev
      );
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Rejection failed", text: e.message || "Could not reject vendor." });
    }
  };

  const handleApprove = async () => {
    try {
      await adminUpdateVendor(adminToken, vendor._id, { approvalStatus: "approved", status: "active" });
      await Swal.fire({ icon: "success", title: "Vendor approved", timer: 1500 });
      setVendor((prev) => (prev ? { ...prev, approvalStatus: "approved", status: "active" } : prev));
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approval failed", text: e.message || "Could not approve vendor." });
    }
  };

  const { shopImageUrls, shopVideoUrls } = buildShopImageAndVideoLists(vendor, mediaUrl);
  const approval = String(vendor.approvalStatus || "pending").toLowerCase();
  const showApprove = approval !== "approved";
  const showReject = approval === "pending" || !vendor.approvalStatus;

  const docs = [
    { key: "aadhaarCardFront", label: "Aadhaar Front", url: mediaDocumentUrl(vendor.aadhaarCardFront) },
    { key: "aadhaarCardBack", label: "Aadhaar Back", url: mediaDocumentUrl(vendor.aadhaarCardBack) },
    { key: "panCardFront", label: "PAN Card", url: mediaDocumentUrl(vendor.panCardFront || vendor.panCard) },
    { key: "shopLogo", label: "Shop Logo", url: mediaDocumentUrl(vendor.shopLogo) },
    { key: "shopBanner", label: "Shop Banner", url: mediaDocumentUrl(vendor.shopBanner) },
  ];

  return (
    <div className="user-page vendor-detail-page container-fluid px-2 px-sm-3 px-lg-4 pb-3 pb-md-4">
      <div className="user-page__toolbar vendor-detail-page__toolbar d-flex flex-column flex-lg-row align-items-stretch align-items-lg-start gap-3 gap-lg-2">
        <div className="d-flex align-items-start gap-2 gap-sm-3 w-100 min-w-0">
          <button type="button" className="user-back-btn flex-shrink-0" aria-label="Back" onClick={() => navigate(-1)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18 9 12l6-6" />
            </svg>
          </button>
          <div className="vendor-detail-page__title-block flex-grow-1 min-w-0">
            <h2 className="user-page__title vendor-detail-page__main-title mb-0 text-break">Vendor Details</h2>
            <p className="vendor-detail-page__meta mb-0">
              <span className="vendor-detail-page__approval-text">Admin Approval Status:</span>{" "}
              <span className={approvalPillClass(vendor.approvalStatus || vendor.status)}>
                {formatStatusText(vendor.approvalStatus || vendor.status)}
              </span>
            </p>
          </div>
        </div>
        <div className="vendor-detail-page__actions d-flex flex-wrap gap-2 w-100 justify-content-stretch justify-content-lg-end">
          {showReject ? (
            <button type="button" className="btn btn--reject flex-grow-1 flex-lg-grow-0" onClick={handleReject}>
              Reject
            </button>
          ) : null}
          {showApprove ? (
            <button type="button" className="btn btn--approve flex-grow-1 flex-lg-grow-0" onClick={handleApprove}>
              Approve
            </button>
          ) : null}
          
          <Link to="edit" className="btn btn--accent vendor-detail-page__edit flex-grow-1 flex-lg-grow-0 text-center">
            Edit vendor
          </Link>
        </div>
      </div>

      <div className="page-card user-view-card shadow-sm">
        <div className="user-view-head vendor-detail-page__profile-head d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-3 gap-sm-4">
          <div className="user-view-avatar-wrap flex-shrink-0">
            {mediaUrl(vendor.profileImage) ? (
              <img src={mediaUrl(vendor.profileImage)} alt="" className="user-view-avatar" width={96} height={96} />
            ) : (
              <div className="user-view-avatar user-view-avatar--ph">
                <ProfileImagePlaceholder size={40} />
              </div>
            )}
          </div>
          <div className="user-view-grid w-100 min-w-0 vendor-detail-page__detail-grid">
            <DetailRow label="Vendor Name" value={vendor.name} />
            <DetailRow label="Email ID" value={vendor.email} />
            <DetailRow label="Mobile Number" value={vendor.phone} />
            <DetailRow label="Shop Name" value={vendor.businessName} />
            <DetailRow label="Business Mobile Number" value={vendor.businessPhone} />
            <DetailRow label="GSTIN" value={vendor.gstin} />
            <DetailRow label="Address" value={vendor.businessAddress} />
            <DetailRow label="Shop Description" value={vendor.shopDescription || "—"} />
            <DetailRow label="City" value={vendor.city} />
            <DetailRow label="Sub-district" value={vendor.subDistrict} />
            <DetailRow label="PAN Number" value={vendor.panCardNumber || "—"} />
            <DetailRow label="Bank Name" value={vendor.bankName} />
            <DetailRow label="Branch Name" value={vendor.branchName} />
            <DetailRow label="Account Number" value={vendor.accountNo} />
            <DetailRow label="IFSC Code" value={vendor.ifsc} />
            <DetailRow label="Account Type" value={vendor.accountType} />
            <DetailRow label="Status" value={vendor.status} />
            <DetailRow label="Approval Status" value={vendor.approvalStatus} />
            {vendor.approvalStatus === "rejected" && vendor.rejectionReason ? (
              <DetailRow label="Rejection Reason" value={vendor.rejectionReason} />
            ) : null}
          </div>
        </div>

        <section className="vendor-read-section vendor-detail-page__documents">
          <h3 className="vendor-read-section__title">Documents</h3>
          <p className="vendor-read-section__sub">Identity, PAN, shop logo, and banner</p>
          <div className="vendor-doc-thumbs vendor-doc-thumbs--detail">
            {docs.map((doc) => (
              <div key={doc.key} className="vendor-doc-thumb">
                {doc.url ? (
                  <img src={doc.url} alt={doc.label} className="vendor-doc-thumb__ph" />
                ) : (
                  <div className="vendor-doc-thumb__ph" />
                )}
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="vendor-doc-thumb__link">
                    {doc.label}
                  </a>
                ) : (
                  <span className="vendor-doc-thumb__link" style={{ textDecoration: "none", color: "#6b7280", cursor: "default" }}>
                    {doc.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="vendor-read-section vendor-shop-media-bootstrap border-0 pt-3 pt-md-4">
          <h3 className="vendor-read-section__title mb-2">Shop media</h3>
          <p className="vendor-read-section__sub small d-none d-sm-block mb-3">Images and videos side by side from tablet size up; one column on phones.</p>
          <div className="px-0">
            <div className="row g-3 g-md-4">
              <div className="col-12 col-md-6 d-flex">
                <div className="card shadow-sm border w-100 h-100 overflow-hidden">
                  <div className="card-header bg-light py-2 py-md-3 px-3 border-bottom">
                    <h4 className="h6 mb-0 text-dark fw-bold">Shop images</h4>
                  </div>
                  <div className="card-body p-2 p-md-3 pt-3 pb-3 pb-md-4">
                    {shopImageUrls.length > 0 ? (
                      <ShopImageSwiper urls={shopImageUrls} />
                    ) : (
                      <p className="text-muted fst-italic small mb-0">No shop images uploaded.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-6 d-flex">
                <div className="card shadow-sm border w-100 h-100 overflow-hidden">
                  <div className="card-header bg-light py-2 py-md-3 px-3 border-bottom">
                    <h4 className="h6 mb-0 text-dark fw-bold">Shop videos</h4>
                  </div>
                  <div className="card-body p-2 p-md-3 pt-3 pb-3 pb-md-4">
                    {shopVideoUrls.length > 0 ? (
                      <ShopVideoSwiper urls={shopVideoUrls} />
                    ) : (
                      <p className="text-muted fst-italic small mb-0">No shop videos uploaded.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <VendorOrdersSection
          adminToken={adminToken}
          kind="ecom"
          ownerId={vendor._id}
          onUnauthorized={() => dispatch(logout())}
        />
      </div>
    </div>
  );
}
