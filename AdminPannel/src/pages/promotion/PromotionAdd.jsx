import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { adminCreatePromotion } from "../../api/promotionController.js";
import { logout } from "../../store/authSlice.js";
import {
  applyPromotionStartDateChange,
  endDateMinForPromotion,
  todayDateInputValue,
  validatePromotionDates,
} from "./promotionFormUtils.js";

const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PROMO_CODE_MAX_LEN = 20;
const DISPLAY_MESSAGE_MAX_LEN = 120;
const USAGE_LIMIT_MAX_DIGITS = 6;

function sanitizePromoCodeInput(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, PROMO_CODE_MAX_LEN);
}

function sanitizeDisplayMessageInput(value) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, DISPLAY_MESSAGE_MAX_LEN);
}

function sanitizeMoneyInput(value) {
  return String(value ?? "")
    .replace(/[^\d.]/g, "")
    .replace(/^(\d*\.?\d*).*$/, "$1")
    .replace(/^(\d{0,8})(?:\.(\d{0,2}))?.*$/, (_, intPart, decPart = "") =>
      decPart ? `${intPart}.${decPart}` : intPart
    );
}

function sanitizeDiscountValueInput(value, discountType) {
  const normalized = sanitizeMoneyInput(value);
  if (discountType !== "percentage") return normalized;
  if (!normalized) return normalized;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.min(100, numeric));
}

function sanitizeIntegerInput(value, maxDigits = USAGE_LIMIT_MAX_DIGITS) {
  return String(value ?? "").replace(/\D/g, "").slice(0, maxDigits);
}

function generatePromoCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";
  for (let i = 0; i < 8; i += 1) {
    randomPart += chars[Math.floor(Math.random() * chars.length)];
  }
  return sanitizePromoCodeInput(`PROMO-${randomPart}`);
}

function emptyForm() {
  return {
    promoCode: generatePromoCode(),
    displayMessage: "",
    startDate: "",
    endDate: "",
    discountType: "percentage",
    discountValue: "",
    minimumOrderAmount: "",
    maximumDiscountAmount: "",
    totalUsageLimit: "",
    status: "active",
  };
}

function validatePromotionForm(form) {
  const promoCode = String(form.promoCode ?? "").trim();
  const displayMessage = String(form.displayMessage ?? "").trim();
  const discountValue = Number(form.discountValue);
  const totalUsageLimit = Number(form.totalUsageLimit);
  const minimumOrderAmount = form.minimumOrderAmount === "" ? undefined : Number(form.minimumOrderAmount);
  const maximumDiscountAmount = form.maximumDiscountAmount === "" ? undefined : Number(form.maximumDiscountAmount);

  if (!promoCode || !displayMessage) return "Promo code and display message are required.";
  if (!/^[A-Z0-9_-]+$/.test(promoCode)) return "Promo code can contain only uppercase letters, numbers, _ and -.";
  if (promoCode.length > PROMO_CODE_MAX_LEN) return `Promo code cannot exceed ${PROMO_CODE_MAX_LEN} characters.`;
  if (displayMessage.length > DISPLAY_MESSAGE_MAX_LEN) return `Display message cannot exceed ${DISPLAY_MESSAGE_MAX_LEN} characters.`;
  const dateError = validatePromotionDates(form);
  if (dateError) return dateError;
  if (!["percentage", "flat"].includes(form.discountType)) return "Please select a valid discount type.";
  if (!Number.isFinite(discountValue) || discountValue < 0) return "Discount value must be 0 or greater.";
  if (form.discountType === "percentage" && discountValue > 100) return "Percentage discount cannot exceed 100.";
  if (!Number.isInteger(totalUsageLimit) || totalUsageLimit < 1) return "Total usage limit must be an integer greater than 0.";
  if (minimumOrderAmount !== undefined && (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0)) {
    return "Minimum order amount must be 0 or greater.";
  }
  if (maximumDiscountAmount !== undefined && (!Number.isFinite(maximumDiscountAmount) || maximumDiscountAmount < 0)) {
    return "Maximum discount amount must be 0 or greater.";
  }
  if (form.discountType === "flat" && maximumDiscountAmount !== undefined) {
    return "Maximum discount amount is only applicable for percentage discount.";
  }
  return "";
}

export function PromotionAdd() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isManualPromoCode, setIsManualPromoCode] = useState(false);
  const fileInputRef = useRef(null);
  const today = todayDateInputValue();
  const startDateMin = today;
  const endDateMin = endDateMinForPromotion(form.startDate, startDateMin);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const validationError = validatePromotionForm(form);
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }
    if (!(imageFile instanceof File)) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Promo banner image is required." });
      return;
    }

    setSaving(true);
    try {
      const promotion = await adminCreatePromotion(adminToken, form, imageFile);
      await Swal.fire({ icon: "success", title: "Promotion created", timer: 1500 });
      navigate(`/admin/promo/${promotion?._id || ""}`);
    } catch (e2) {
      if (e2?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Create failed", text: e2.message || "Could not create promotion." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="user-page__toolbar-text">
          <h2 className="user-page__title">Create promotion</h2>
        </div>
        <Link to="/admin/promo" className="btn btn--ghost">Back to list</Link>
      </div>

      <div className="page-card">
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Promo code <span className="required-dot">*</span></span>
                <small>{form.promoCode.length}/{PROMO_CODE_MAX_LEN}</small>
              </span>
              <input
                className="user-field__input"
                value={form.promoCode}
                maxLength={PROMO_CODE_MAX_LEN}
                disabled={!isManualPromoCode}
                onChange={(e) => setForm((p) => ({ ...p, promoCode: sanitizePromoCodeInput(e.target.value) }))}
                required
              />
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setForm((p) => ({ ...p, promoCode: generatePromoCode() }))}
                >
                  Regenerate
                </button>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isManualPromoCode}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsManualPromoCode(next);
                      if (!next) {
                        setForm((p) => ({ ...p, promoCode: generatePromoCode() }));
                      }
                    }}
                  />
                  <span>Manual entry</span>
                </label>
              </div>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Display message <span className="required-dot">*</span></span>
                <small>{form.displayMessage.length}/{DISPLAY_MESSAGE_MAX_LEN}</small>
              </span>
              <input
                className="user-field__input"
                value={form.displayMessage}
                maxLength={DISPLAY_MESSAGE_MAX_LEN}
                onChange={(e) => setForm((p) => ({ ...p, displayMessage: sanitizeDisplayMessageInput(e.target.value) }))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Start date <span className="required-dot">*</span></span>
              <input
                type="date"
                className="user-field__input"
                value={form.startDate}
                min={startDateMin}
                onChange={(e) => setForm((p) => applyPromotionStartDateChange(p, e.target.value))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">End date <span className="required-dot">*</span></span>
              <input
                type="date"
                className="user-field__input"
                value={form.endDate}
                min={endDateMin}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Discount type <span className="required-dot">*</span></span>
              <select
                className="user-field__input"
                value={form.discountType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    discountType: e.target.value,
                    ...(e.target.value === "flat" ? { maximumDiscountAmount: "" } : {}),
                  }))
                }
                required
              >
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat amount (Rs)</option>
              </select>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Discount value <span className="required-dot">*</span></span>
              <input
                type="text"
                inputMode="decimal"
                className="user-field__input"
                value={form.discountValue}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    discountValue: sanitizeDiscountValueInput(e.target.value, p.discountType),
                  }))
                }
                required
              />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Minimum order amount</span>
              <input
                type="text"
                inputMode="decimal"
                className="user-field__input"
                value={form.minimumOrderAmount}
                onChange={(e) => setForm((p) => ({ ...p, minimumOrderAmount: sanitizeMoneyInput(e.target.value) }))}
              />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Maximum discount amount</span>
              <input
                type="text"
                inputMode="decimal"
                className="user-field__input"
                value={form.maximumDiscountAmount}
                disabled={form.discountType === "flat"}
                onChange={(e) => setForm((p) => ({ ...p, maximumDiscountAmount: sanitizeMoneyInput(e.target.value) }))}
                placeholder={form.discountType === "flat" ? "Not applicable for flat discount" : ""}
              />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Total usage limit <span className="required-dot">*</span></span>
              <input
                type="text"
                inputMode="numeric"
                className="user-field__input"
                value={form.totalUsageLimit}
                onChange={(e) => setForm((p) => ({ ...p, totalUsageLimit: sanitizeIntegerInput(e.target.value) }))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Status</span>
              <select className="user-field__input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Promo banner image <span className="required-dot">*</span></span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file && file.size > IMAGE_MAX_SIZE_BYTES) {
                    setImageFile(null);
                    setImagePreview("");
                    e.target.value = "";
                    void Swal.fire({ icon: "error", title: "Validation error", text: "Image size must be 5 MB or less." });
                    return;
                  }
                  setImageFile(file);
                  setImagePreview(file ? URL.createObjectURL(file) : "");
                }}
                required
              />
            </label>
          </div>
          {imagePreview ? (
            <div style={{ marginTop: 12 }}>
              <img src={imagePreview} alt="Promotion preview" style={{ width: 180, height: 100, objectFit: "cover", borderRadius: 8 }} />
            </div>
          ) : null}
          <div className="user-form__actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? "Saving…" : "Create Promotion"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
