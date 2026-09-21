import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete, AiOutlineEye } from "react-icons/ai";
import {
  adminCreatePlan,
  adminDeletePlan,
  adminListPlans,
  adminUpdatePlan,
} from "../../api/vendorPlanController.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import {
  applyPromotionStartDateChange,
  endDateMinForPromotion,
  startDateMinForEdit,
  todayDateInputValue,
  validatePromotionDates,
} from "../promotion/promotionFormUtils.js";

const LIST_LIMIT = 10;
const NAME_MAX = 80;

const PLAN_TYPE_OPTIONS = [
  { value: "banner", label: "Banner" },
  { value: "get_verified", label: "Get Verified" },
  {
    value: "product_presence_first",
    label: "Product Presence First (Top 100, random)",
  },
];

const VENDOR_TYPE_OPTIONS = [
  { value: "both", label: "Both (Ecom + Service)" },
  { value: "ecom", label: "E-commerce vendor" },
  { value: "venue", label: "Service vendor" },
];

function emptyForm() {
  return {
    name: "",
    planType: "banner",
    vendorType: "both",
    price: "0",
    startDate: "",
    endDate: "",
    presenceTopLimit: "100",
    presenceMode: "random",
    status: "active",
  };
}

function planTypeLabel(value) {
  return PLAN_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || "—";
}

function vendorTypeLabel(value) {
  return VENDOR_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || "—";
}

function formatInr(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function toDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function validatePlanForm(form, dateOptions = {}) {
  const name = String(form.name ?? "").trim();
  if (!name) return "Plan name is required.";
  if (name.length > NAME_MAX) return `Name cannot exceed ${NAME_MAX} characters.`;
  if (!PLAN_TYPE_OPTIONS.some((o) => o.value === form.planType)) return "Select a valid plan type.";
  if (!VENDOR_TYPE_OPTIONS.some((o) => o.value === form.vendorType)) return "Select a valid vendor type.";
  const price = Number(form.price);
  if (!Number.isFinite(price) || price < 0) return "Price must be 0 or more.";
  const dateError = validatePromotionDates(form, dateOptions);
  if (dateError) return dateError;
  if (form.planType === "product_presence_first") {
    const top = parseInt(String(form.presenceTopLimit), 10);
    if (!Number.isFinite(top) || top < 1) return "Top limit must be at least 1.";
  }
  return "";
}

export function VendorPlanPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [initialStartDate, setInitialStartDate] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [viewRow, setViewRow] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterPlanType, setFilterPlanType] = useState("");
  const [filterVendorType, setFilterVendorType] = useState("");
  const formSectionRef = useRef(null);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { plans, pagination } = await adminListPlans(adminToken, {
        page,
        limit: LIST_LIMIT,
        ...(filterPlanType ? { planType: filterPlanType } : {}),
        ...(filterVendorType ? { vendorType: filterVendorType } : {}),
      });
      setRows(plans);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load plans." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, page, filterPlanType, filterVendorType]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

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
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const validationError = validatePlanForm(form, {
      allowExistingPastStart: Boolean(editId),
      initialStartDate,
    });
    if (validationError) {
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError });
      return;
    }

    const payload = {
      name: form.name.trim(),
      planType: form.planType,
      vendorType: form.vendorType,
      price: Number(form.price) || 0,
      startDate: form.startDate,
      endDate: form.endDate,
      presenceTopLimit: parseInt(String(form.presenceTopLimit), 10) || 100,
      presenceMode: "random",
      status: form.status || "active",
    };

    setSaving(true);
    try {
      if (editId) {
        await adminUpdatePlan(adminToken, editId, payload);
        await Swal.fire({ icon: "success", title: "Plan updated", timer: 1500 });
      } else {
        await adminCreatePlan(adminToken, payload);
        await Swal.fire({ icon: "success", title: "Plan created", timer: 1500 });
      }
      resetForm();
      await loadRows();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: err.message || "Could not save plan." });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    const start = toDateInput(row.startDate);
    setEditId(row._id);
    setInitialStartDate(start);
    setForm({
      name: row.name || "",
      planType: row.planType || "banner",
      vendorType: row.vendorType || "both",
      price: String(row.price ?? 0),
      startDate: start,
      endDate: toDateInput(row.endDate),
      presenceTopLimit: String(row.presenceTopLimit ?? 100),
      presenceMode: row.presenceMode || "random",
      status: row.status || "active",
    });
  };

  const onDelete = async (row) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete plan?",
      text: `This will delete "${row.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeletePlan(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Plan deleted", timer: 1500 });
      await loadRows();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: err.message || "Could not delete plan." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdatePlan(adminToken, row._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "Plan activated" : "Plan deactivated",
        timer: 1500,
      });
      await loadRows();
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Status update failed", text: err.message || "Could not update status." });
    } finally {
      setTogglingId("");
    }
  };

  const showPresenceFields = form.planType === "product_presence_first";
  const startDateMin = editId ? startDateMinForEdit(initialStartDate) : todayDateInputValue();
  const endDateMin = endDateMinForPromotion(form.startDate, startDateMin);
  const hint = useMemo(() => {
    if (form.planType === "banner") return "Vendor can get a promotional banner slot within the plan dates.";
    if (form.planType === "get_verified") return "Vendor gets a verified badge / trust mark within the plan dates.";
    return "Vendor products/services get priority presence in the top list and are shown randomly among featured items.";
  }, [form.planType]);

  return (
    <div className="user-page">
      <div className="page-card" ref={formSectionRef} style={{ scrollMarginTop: "80px" }}>
        <div className="page-card__head">
          <h2 className="page-card__title">{editId ? "Edit Plan" : "Create Plan"}</h2>
        </div>
        <p className="data-table__muted" style={{ marginBottom: 12 }}>
          Create paid boost plans for e-commerce and service vendors: Banner, Get Verified, and Product Presence First.
        </p>
        <form onSubmit={onSubmit}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Plan name <span className="required-dot">*</span>
              </span>
              <input
                className="user-field__input"
                value={form.name}
                maxLength={NAME_MAX}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value.slice(0, NAME_MAX) }))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Plan type <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.planType}
                onChange={(e) => setForm((p) => ({ ...p, planType: e.target.value }))}
                required
              >
                {PLAN_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <small className="data-table__muted">{hint}</small>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                For vendors <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.vendorType}
                onChange={(e) => setForm((p) => ({ ...p, vendorType: e.target.value }))}
                required
              >
                {VENDOR_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Price (INR) <span className="required-dot">*</span>
              </span>
              <input
                type="number"
                min="0"
                step="1"
                className="user-field__input"
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                required
              />
            </label>
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">
                Start date <span className="required-dot">*</span>
              </span>
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
              <span className="user-field__label">
                End date <span className="required-dot">*</span>
              </span>
              <input
                type="date"
                className="user-field__input"
                value={form.endDate}
                min={endDateMin}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                required
              />
            </label>
            {showPresenceFields ? (
              <>
                <label className="user-field col-12 col-md-6">
                  <span className="user-field__label">Top list size</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="user-field__input"
                    value={form.presenceTopLimit}
                    onChange={(e) => setForm((p) => ({ ...p, presenceTopLimit: e.target.value }))}
                  />
                  <small className="data-table__muted">Default 100 — featured items stay in top N.</small>
                </label>
                <label className="user-field col-12 col-md-6">
                  <span className="user-field__label">Show mode</span>
                  <select className="user-field__input" value="random" disabled>
                    <option value="random">Random among featured</option>
                  </select>
                </label>
              </>
            ) : null}
            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Status</span>
              <select
                className="user-field__input"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="user-form__actions">
            <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : editId ? "Update Plan" : "Create Plan"}
            </button>
          </div>
        </form>
      </div>

      <div className="page-card">
        <div className="page-card__head" style={{ gap: 12, flexWrap: "wrap" }}>
          <h2 className="page-card__title">Plans</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              className="user-field__input"
              value={filterPlanType}
              onChange={(e) => {
                setFilterPlanType(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: 220 }}
              aria-label="Filter by plan type"
            >
              <option value="">All plan types</option>
              {PLAN_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="user-field__input"
              value={filterVendorType}
              onChange={(e) => {
                setFilterVendorType(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: 200 }}
              aria-label="Filter by vendor type"
            >
              <option value="">All vendors</option>
              {VENDOR_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Name</th>
                <th>Type</th>
                <th>Vendors</th>
                <th>Price</th>
                <th>Date Range</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No plans found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} onOpen={() => setViewRow(row)}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>{row.name || "—"}</td>
                    <td>{planTypeLabel(row.planType)}</td>
                    <td>{vendorTypeLabel(row.vendorType)}</td>
                    <td>{formatInr(row.price)}</td>
                    <td className="data-table__muted">
                      {formatDate(row.startDate)} - {formatDate(row.endDate)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                        title={row.status === "active" ? "Deactivate plan" : "Activate plan"}
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
              <h2 className="page-card__title">Plan Details</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            <div className="row g-2">
              <div className="col-12">
                <strong>Name:</strong> {viewRow.name || "—"}
              </div>
              <div className="col-12">
                <strong>Type:</strong> {planTypeLabel(viewRow.planType)}
              </div>
              <div className="col-12">
                <strong>Vendors:</strong> {vendorTypeLabel(viewRow.vendorType)}
              </div>
              <div className="col-6">
                <strong>Price:</strong> {formatInr(viewRow.price)}
              </div>
              <div className="col-6">
                <strong>Status:</strong> {viewRow.status || "—"}
              </div>
              <div className="col-6">
                <strong>Start date:</strong> {formatDate(viewRow.startDate)}
              </div>
              <div className="col-6">
                <strong>End date:</strong> {formatDate(viewRow.endDate)}
              </div>
              {viewRow.planType === "product_presence_first" ? (
                <>
                  <div className="col-6">
                    <strong>Top limit:</strong> {viewRow.presenceTopLimit ?? 100}
                  </div>
                  <div className="col-6">
                    <strong>Show mode:</strong> {viewRow.presenceMode || "random"}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
