import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete, AiOutlineEye } from "react-icons/ai";
import {
  adminCreateBanner,
  adminDeleteBanner,
  adminListBanners,
  adminUpdateBanner,
} from "../../api/bannerController.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import {City } from 'country-state-city'
import {
  applyPromotionStartDateChange,
  endDateMinForPromotion,
  startDateMinForEdit,
  todayDateInputValue,
  validateOptionalDateRange,
} from "../promotion/promotionFormUtils.js";
import { adminListProducts } from "../../api/adminProducts.js";
import { adminListVendors } from "../../api/adminVendors.js";
import {
  BANNER_RELATED_OPTIONS,
  BANNER_SPECS,
  bannerImageHint,
  bannerRelatedLabel,
  bannerTargetLabel,
  readImageDimensions,
  validateBannerImageDimensions,
} from "../../utils/bannerSpecs.js";

function emptyForm() {
  return {
    targetType: "ecom",
    mode: "global",
    title: "",
    related: "none",
    relatedId: "",
    category: "",
    startDate: "",
    endDate: "",
    cities: "",
    status: "active",
  };
}

const TITLE_MAX_LEN = 60;
const CITY_SEARCH_MAX_LEN = 40;
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const LIST_LIMIT = 10;

function sanitizeTitleInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, TITLE_MAX_LEN);
}

function sanitizeCitySearchInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z ]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, CITY_SEARCH_MAX_LEN);
}

function normalizeCitiesInput(value) {
  return String(value ?? "")
    .split(",")
    .map((city) => city.trim())
    .filter(Boolean);
}

function bannerPanelVisibility(row) {
  if (String(row?.status || "").toLowerCase() !== "active") {
    return { key: "off", label: "Off — not shown on panel" };
  }

  const now = new Date();
  const start = row.startDate ? new Date(row.startDate) : null;
  const end = row.endDate ? new Date(row.endDate) : null;

  if (start && !Number.isNaN(start.getTime()) && start > now) {
    return { key: "scheduled", label: "Scheduled — not live yet" };
  }

  if (end && !Number.isNaN(end.getTime())) {
    const endOfDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999));
    if (endOfDay < now) {
      return { key: "expired", label: "Expired — date range ended" };
    }
  }

  return { key: "live", label: "Live on panel" };
}

function validateBannerForm(form, dateOptions = {}) {
  const mode = form.mode.trim();
  const title = form.title.trim();
  const cities = normalizeCitiesInput(form.cities);

  if (!mode || !title) {
    return "Mode and title are required.";
  }
  if (!["global", "city"].includes(mode)) {
    return "Please select a valid mode.";
  }
  if (!/^[A-Za-z0-9 ]+$/.test(title)) {
    return "Title can contain only letters, numbers, and spaces.";
  }
  if (title.length > TITLE_MAX_LEN) {
    return `Title cannot exceed ${TITLE_MAX_LEN} characters.`;
  }
  const dateError = validateOptionalDateRange(form, dateOptions);
  if (dateError) return dateError;
  if (mode === "city" && cities.length === 0) {
    return "At least one city is required for city mode.";
  }
  return "";
}

export function BannerPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [initialStartDate, setInitialStartDate] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [citySearch, setCitySearch] = useState("");
  const [viewRow, setViewRow] = useState(null);
  const [listTargetType, setListTargetType] = useState("");
  const fileInputRef = useRef(null);
  const formSectionRef = useRef(null);
  const indianCities = useMemo(() => {
    const seen = new Set();
    return City.getCitiesOfCountry("IN")
      .map((city) => city.name?.trim())
      .filter(Boolean)
      .filter((cityName) => {
        const key = cityName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, []);

  const loadCategories = useCallback(async (targetType = "ecom") => {
    if (!adminToken) {
      setCategories([]);
      return;
    }
    try {
      const { categories: cats } = await adminListCategories(adminToken, {
        page: 1,
        limit: 200,
        mode: targetType === "venue" ? "venue" : "ecom",
        listed: true,
      });
      setCategories(cats ?? []);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
    }
  }, [adminToken, dispatch]);

  const loadRelatedOptions = useCallback(async (related) => {
    if (!adminToken) {
      setProducts([]);
      setVendors([]);
      return;
    }
    try {
      if (related === "product") {
        const { products: list } = await adminListProducts(adminToken, { page: 1, limit: 200, status: "active" });
        setProducts(list ?? []);
      } else if (related === "vendor") {
        const { vendors: list } = await adminListVendors(adminToken, { page: 1, limit: 200, status: "active" });
        setVendors(list ?? []);
      }
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
    }
  }, [adminToken, dispatch]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { banners, pagination } = await adminListBanners(adminToken, {
        page,
        limit: LIST_LIMIT,
        ...(listTargetType ? { targetType: listTargetType } : {}),
      });
      setRows(banners);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load banners." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, page, listTargetType]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadCategories(form.targetType || "ecom");
  }, [loadCategories, form.targetType]);

  useEffect(() => {
    if (
      (form.targetType === "user" || form.targetType === "ecom") &&
      (form.related === "product" || form.related === "vendor")
    ) {
      loadRelatedOptions(form.related);
    }
  }, [form.targetType, form.related, loadRelatedOptions]);

  useEffect(() => {
    if (!editId) return;
    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [editId]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId("");
    setInitialStartDate("");
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const validationError = validateBannerForm(form, {
      allowExistingPastStart: Boolean(editId),
      initialStartDate,
    });
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }
    if (!editId && !(imageFile instanceof File)) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Banner image is required." });
      return;
    }

    const supportsRelated = form.targetType === "user" || form.targetType === "ecom";
    const related = supportsRelated ? form.related || "none" : "none";
    if (supportsRelated && related === "category" && !form.category) {
      await Swal.fire({
        icon: "error",
        title: "Validation error",
        text: "Please select a category for this banner.",
      });
      return;
    }
    if (supportsRelated && (related === "product" || related === "vendor") && !form.relatedId) {
      await Swal.fire({
        icon: "error",
        title: "Validation error",
        text: `Please select a ${related} for this banner.`,
      });
      return;
    }

    const payload = {
      targetType: form.targetType || "ecom",
      mode: form.mode.trim(),
      title: form.title.trim(),
      related,
      relatedId: related === "product" || related === "vendor" ? form.relatedId || "" : "",
      category: related === "category" || !supportsRelated ? form.category || "" : "",
      ...(form.startDate ? { startDate: form.startDate } : {}),
      ...(form.endDate ? { endDate: form.endDate } : {}),
      cities: form.mode === "city" ? normalizeCitiesInput(form.cities) : [],
      status: form.status || "active",
    };

    setSaving(true);
    try {
      if (editId) {
        await adminUpdateBanner(adminToken, editId, payload, imageFile);
        await Swal.fire({ icon: "success", title: "Banner updated", timer: 1500 });
      } else {
        await adminCreateBanner(adminToken, payload, imageFile);
        await Swal.fire({ icon: "success", title: "Banner created", timer: 1500 });
      }
      resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e.message || "Could not save banner." });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditId(row._id);
    setForm({
      targetType: row.targetType || "ecom",
      mode: row.mode || "",
      title: row.title || "",
      related: row.related || "none",
      relatedId: row.relatedId ? String(row.relatedId) : "",
      category: row.category?._id || row.category || "",
      startDate: row.startDate ? String(row.startDate).slice(0, 10) : "",
      endDate: row.endDate ? String(row.endDate).slice(0, 10) : "",
      cities: Array.isArray(row.cities) ? row.cities.join(", ") : "",
      status: row.status || "active",
    });
    setInitialStartDate(row.startDate ? String(row.startDate).slice(0, 10) : "");
    setImageFile(null);
    setImagePreview(mediaUrl(row.image));
  };

  const onDelete = async (row) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete banner?",
      text: `This will delete "${row.title}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteBanner(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Banner deleted", timer: 1500 });
      if (editId === row._id) resetForm();
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete banner." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateBanner(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Banner activated" : "Banner deactivated",
        timer: 1500,
      });
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Status update failed", text: e.message || "Could not update status." });
    } finally {
      setTogglingId("");
    }
  };

  const selectedCities = useMemo(() => normalizeCitiesInput(form.cities), [form.cities]);
  const filteredIndianCities = useMemo(() => {
    const query = citySearch.trim().toLowerCase();
    if (!query) return indianCities;
    return indianCities.filter((cityName) => cityName.toLowerCase().includes(query));
  }, [citySearch, indianCities]);

  const toggleCitySelection = (cityName) => {
    const current = normalizeCitiesInput(form.cities);
    const exists = current.some((city) => city.toLowerCase() === cityName.toLowerCase());
    const next = exists ? current.filter((city) => city.toLowerCase() !== cityName.toLowerCase()) : [...current, cityName];
    setForm((p) => ({ ...p, cities: next.join(", ") }));
  };

  const clearCitySelection = () => {
    setForm((p) => ({ ...p, cities: "" }));
  };

  const startDateMin = editId ? startDateMinForEdit(initialStartDate) : todayDateInputValue();
  const endDateMin = endDateMinForPromotion(form.startDate, startDateMin);
  const activeSpec = BANNER_SPECS[form.targetType] ?? BANNER_SPECS.ecom;

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    if (file.size > IMAGE_MAX_SIZE_BYTES) {
      setImageFile(null);
      setImagePreview("");
      e.target.value = "";
      await Swal.fire({
        icon: "error",
        title: "Validation error",
        text: "Image size must be 5 MB or less.",
      });
      return;
    }
    try {
      const { width, height } = await readImageDimensions(file);
      const dimensionError = validateBannerImageDimensions(form.targetType, width, height);
      if (dimensionError) {
        setImageFile(null);
        setImagePreview("");
        e.target.value = "";
        await Swal.fire({
          icon: "error",
          title: "Invalid banner size",
          text: dimensionError,
        });
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setImageFile(null);
      setImagePreview("");
      e.target.value = "";
      await Swal.fire({
        icon: "error",
        title: "Validation error",
        text: err?.message || "Could not read image.",
      });
    }
  };

  return (
    <div className="user-page">
      <div className="page-card" ref={formSectionRef} style={{ scrollMarginTop: "80px" }}>
        <div className="page-card__head">
          <h2 className="page-card__title">{editId ? "Edit Banner" : "Create Banner"}</h2>
        </div>
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Banner for <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.targetType}
                onChange={(e) => {
                  const nextTargetType = e.target.value;
                  const supportsRelated = nextTargetType === "user" || nextTargetType === "ecom";
                  setForm((p) => ({
                    ...p,
                    targetType: nextTargetType,
                    category: "",
                    related: supportsRelated ? p.related || "none" : "none",
                    relatedId: "",
                  }));
                  setImageFile(null);
                  setImagePreview("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                required
              >
                <option value="ecom">E-commerce vendor</option>
                <option value="venue">Service vendor web panel</option>
                <option value="user">User</option>
              </select>
              <small className="data-table__muted">
                Recommended size: {activeSpec.recommendedWidth}×{activeSpec.recommendedHeight}px ({activeSpec.aspectRatio}:1 ratio)
              </small>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Mode <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.mode}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setForm((p) => ({ ...p, mode: nextMode, cities: nextMode === "city" ? p.cities : "" }));
                }}
                required
              >
                {/* <option value="">Select Mode</option> */}
                <option value="global">Global</option>
                <option value="city">City</option>
              </select>
            </label>
            {form.targetType === "user" || form.targetType === "ecom" ? (
              <label className="user-field col-12 col-md-6">
                <span className="user-field__label">
                  Related <span className="required-dot">*</span>
                </span>
                <select
                  className="user-field__input"
                  value={form.related || "none"}
                  onChange={(e) => {
                    const nextRelated = e.target.value;
                    setForm((p) => ({
                      ...p,
                      related: nextRelated,
                      category: "",
                      relatedId: "",
                    }));
                  }}
                  required
                >
                  {BANNER_RELATED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {(form.targetType === "user" || form.targetType === "ecom") && form.related === "product" ? (
              <label className="user-field col-12 col-md-6">
                <span className="user-field__label">
                  Product <span className="required-dot">*</span>
                </span>
                <select
                  className="user-field__input"
                  value={form.relatedId}
                  onChange={(e) => setForm((p) => ({ ...p, relatedId: e.target.value }))}
                  required
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name || product.title || product._id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {(form.targetType === "user" || form.targetType === "ecom") && form.related === "vendor" ? (
              <label className="user-field col-12 col-md-6">
                <span className="user-field__label">
                  Vendor <span className="required-dot">*</span>
                </span>
                <select
                  className="user-field__input"
                  value={form.relatedId}
                  onChange={(e) => setForm((p) => ({ ...p, relatedId: e.target.value }))}
                  required
                >
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor._id} value={vendor._id}>
                      {vendor.businessName || vendor.name || vendor._id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Title <span className="required-dot">*</span>
                </span>
                <small>{form.title.length}/{TITLE_MAX_LEN}</small>
              </span>
              <input
                className="user-field__input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: sanitizeTitleInput(e.target.value) }))}
                maxLength={TITLE_MAX_LEN}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Start date (optional)</span>
              <small className="data-table__muted">Vendor panel only shows banners whose dates include today.</small>
              <input
                type="date"
                className="user-field__input"
                value={form.startDate}
                min={startDateMin}
                onChange={(e) => setForm((p) => applyPromotionStartDateChange(p, e.target.value))}
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">End date (optional)</span>
              <input
                type="date"
                className="user-field__input"
                value={form.endDate}
                min={endDateMin}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              />
            </label>
            {form.mode === "city" ? (
              <div className="user-field col-12" style={{ position: "relative" }}>
                <span className="user-field__label">
                  Cities (India) <span className="required-dot">*</span>
                </span>
                <AdminSearchField
                  value={citySearch}
                  onChange={(e) => setCitySearch(sanitizeCitySearchInput(e.target.value))}
                  placeholder="Search city..."
                  aria-label="Search cities"
                  style={{ width: "100%", minWidth: 0, marginTop: 2 }}
                />
                <small className="data-table__muted">{citySearch.length}/{CITY_SEARCH_MAX_LEN}</small>
                <div
                  className="user-field__input"
                  style={{ maxHeight: 220, overflowY: "auto", padding: "8px 10px", marginTop: 8 }}
                >
                  {filteredIndianCities.length === 0 ? (
                    <div className="data-table__muted">No city found.</div>
                  ) : (
                    filteredIndianCities.map((cityName) => {
                      const checked = selectedCities.some((city) => city.toLowerCase() === cityName.toLowerCase());
                      return (
                        <label key={cityName} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleCitySelection(cityName)} />
                          <span>{cityName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <input required value={form.cities} onChange={() => {}} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }} />
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="data-table__muted">{selectedCities.length} selected</span>
                  {selectedCities.length > 0 ? (
                    <button type="button" className="btn btn--ghost" onClick={clearCitySelection}>
                      Clear cities
                    </button>
                  ) : null}
                </div>
                {selectedCities.length > 0 ? (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedCities.map((cityName) => (
                      <span
                        key={cityName}
                        style={{
                          fontSize: 12,
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "#eef2ff",
                          color: "#3730a3",
                          border: "1px solid #c7d2fe",
                        }}
                      >
                        {cityName}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {form.targetType === "venue" || form.related === "category" ? (
              <label className="user-field col-12 col-md-6">
                <span className="user-field__label">
                  {form.related === "category" ? "Related category" : "Category (optional)"}
                  {form.related === "category" ? <span className="required-dot"> *</span> : null}
                </span>
                <select
                  className="user-field__input"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  required={form.related === "category"}
                >
                  <option value="">{form.related === "category" ? "Select category" : "No category"}</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Status</span>
              <select className="user-field__input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Image (max 5 MB) {editId ? "" : <span className="required-dot">*</span>}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              <small className="data-table__muted">{bannerImageHint(form.targetType)}</small>
            </label>
          </div>
          {imagePreview ? (
            <div style={{ marginTop: 10 }}>
              <img
                src={imagePreview}
                alt="Banner preview"
                style={{
                  ...(activeSpec.previewStyle || { width: 339, height: 128 }),
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
              />
            </div>
          ) : null}
          <div className="user-form__actions">
            <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8M7 3v5h8" />
              </svg>
              {saving ? "Saving…" : editId ? "Update Banner" : "Create Banner"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Banners</h2>
          <select
            className="user-field__input"
            value={listTargetType}
            onChange={(e) => {
              setListTargetType(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 220 }}
            aria-label="Filter by banner type"
          >
            <option value="">All types</option>
            <option value="ecom">E-commerce</option>
            <option value="venue">Service vendor</option>
            <option value="user">User</option>
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Image</th>
                <th>Title</th>
                <th>Type</th>
                <th>Category</th>
                <th>Mode</th>
                <th>Date Range</th>
                {/* <th>Cities</th> */}
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>No banners found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} onOpen={() => setViewRow(row)}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>
                      {row.image ? (
                        <img
                          src={mediaUrl(row.image)}
                          alt=""
                          style={{
                            width: row.targetType === "venue" ? 84 : 56,
                            height: row.targetType === "venue" ? 28 : 22,
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.title || "—"}</td>
                    <td>{bannerTargetLabel(row.targetType)}</td>
                    <td>{row.category?.name || "—"}</td>
                    <td>{row.mode || "—"}</td>
                    <td className="data-table__muted">
                      {row.startDate ? new Date(row.startDate).toLocaleDateString() : "—"} - {row.endDate ? new Date(row.endDate).toLocaleDateString() : "—"}
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          marginTop: 4,
                          color: bannerPanelVisibility(row).key === "live" ? "#15803d" : "#b45309",
                        }}
                      >
                        {bannerPanelVisibility(row).label}
                      </span>
                    </td>
                    {/* <td className="data-table__muted">{Array.isArray(row.cities) && row.cities.length > 0 ? row.cities.join(", ") : "—"}</td> */}
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        aria-label={`Toggle status for ${row.title}`}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                        title={row.status === "active" ? "Deactivate banner" : "Activate banner"}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--view" title="View" onClick={() => setViewRow(row)}>
                          <AiOutlineEye size={18} />
                        </button>
                        <button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={() => onEdit(row)}>
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className={`icon-btn icon-btn--delete${editId ? " is-disabled" : ""}`}
                          title={editId ? "Finish/cancel edit to enable delete" : "Delete"}
                          onClick={() => onDelete(row)}
                          disabled={Boolean(editId)}
                          style={editId ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                        >
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </ClickableTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
      </div>
      {viewRow ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewRow(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="page-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="page-card__head" style={{ marginBottom: 12 }}>
              <h2 className="page-card__title">Banner Details</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            {viewRow.image ? (
              <div style={{ marginBottom: 12 }}>
                <img
                  src={mediaUrl(viewRow.image)}
                  alt={viewRow.title || "Banner"}
                  style={{ width: "100%", maxHeight: 250, objectFit: "cover", borderRadius: 8 }}
                />
              </div>
            ) : null}
            <div className="row g-2">
              <div className="col-12"><strong>Title:</strong> {viewRow.title || "—"}</div>
              <div className="col-12"><strong>Type:</strong> {bannerTargetLabel(viewRow.targetType)}</div>
              {viewRow.targetType === "user" || viewRow.targetType === "ecom" ? (
                <div className="col-12"><strong>Related:</strong> {bannerRelatedLabel(viewRow.related)}</div>
              ) : null}
              <div className="col-12"><strong>Category:</strong> {viewRow.category?.name || "—"}</div>
              <div className="col-6"><strong>Mode:</strong> {viewRow.mode || "—"}</div>
              <div className="col-6"><strong>Status:</strong> {viewRow.status || "—"}</div>
              <div className="col-6"><strong>Start Date:</strong> {viewRow.startDate ? new Date(viewRow.startDate).toLocaleDateString() : "—"}</div>
              <div className="col-6"><strong>End Date:</strong> {viewRow.endDate ? new Date(viewRow.endDate).toLocaleDateString() : "—"}</div>
              <div className="col-12"><strong>Cities:</strong> {Array.isArray(viewRow.cities) && viewRow.cities.length > 0 ? viewRow.cities.join(", ") : "—"}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
