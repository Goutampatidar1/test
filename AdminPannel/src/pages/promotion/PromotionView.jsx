import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { adminGetPromotionById } from "../../api/promotionController.js";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function DetailRow({ label, value }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-row__label">{label}</span>
      <span className="user-detail-row__value">{value ?? "—"}</span>
    </div>
  );
}

export function PromotionView() {
  const { promotionId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [promotion, setPromotion] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken || !promotionId) return;
    let cancelled = false;

    (async () => {
      setError("");
      setNotFound(false);
      try {
        const data = await adminGetPromotionById(adminToken, promotionId);
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
          return;
        }
        setPromotion(data);
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
        setError(e.message || "Failed to load promotion.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, promotionId]);

  if (!promotionId) {
    return (
      <div className="user-page">
        <p className="user-list-error" role="alert">
          Promotion id is missing.
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    );
  }

  if (notFound) return <NotFoundPage />;

  if (error) {
    return (
      <div className="user-page">
        <p className="user-list-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    );
  }

  if (!promotion) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading promotion…</p>
      </div>
    );
  }

  const discountLabel =
    promotion.discountType === "percentage"
      ? `${promotion.discountValue ?? 0}%`
      : `Rs ${promotion.discountValue ?? 0}`;

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="user-page__toolbar-text">
          <h2 className="user-page__title">Promotion details</h2>
        </div>
      </div>

      <div className="page-card user-view-card">
        {promotion.image ? (
          <div style={{ marginBottom: 14 }}>
            <img
              src={mediaUrl(promotion.image)}
              alt={promotion.promoCode || "Promotion banner"}
              style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10 }}
            />
          </div>
        ) : null}

        <div className="user-view-grid">
          <DetailRow label="Promo code" value={promotion.promoCode} />
          <DetailRow label="Display message" value={promotion.displayMessage} />
          <DetailRow label="Discount type" value={promotion.discountType} />
          <DetailRow label="Discount value" value={discountLabel} />
          <DetailRow label="Minimum order amount" value={`Rs ${promotion.minimumOrderAmount ?? 0}`} />
          <DetailRow label="Maximum discount amount" value={promotion.maximumDiscountAmount !== undefined && promotion.maximumDiscountAmount !== null ? `Rs ${promotion.maximumDiscountAmount}` : "—"} />
          <DetailRow label="Total usage limit" value={promotion.totalUsageLimit} />
          <DetailRow label="Used count" value={promotion.usedCount ?? 0} />
          <DetailRow label="Status" value={promotion.status} />
          <DetailRow label="Start date" value={formatDate(promotion.startDate)} />
          <DetailRow label="End date" value={formatDate(promotion.endDate)} />
          <DetailRow label="Created at" value={formatDateTime(promotion.createdAt)} />
       
        </div>
      </div>
    </div>
  );
}
