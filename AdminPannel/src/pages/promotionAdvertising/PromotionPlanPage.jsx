import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete, AiOutlineEye } from "react-icons/ai";
import {
  adminCreatePromotionPlan,
  adminDeletePromotionPlan,
  adminListPromotionPlans,
  adminUpdatePromotionPlan,
} from "../../api/promotionAdvertisingController.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const LIST_LIMIT = 10;
const NAME_MAX = 80;

const PLAN_TYPE_OPTIONS = [
  { value: "banner", label: "Banner Promotion" },
  { value: "get_verified", label: "Get Verified" },
  { value: "product_presence_first", label: "Product Presence First" },
];

const VENDOR_TYPE_OPTIONS = [
  { value: "ecom", label: "E-commerce vendor" },
  { value: "venue", label: "Service vendor" },
];

const DURATION_DEFAULTS = {
  daily: { type: "daily", durationDays: 1, price: "100" },
  weekly: { type: "weekly", durationDays: 7, price: "200" },
  monthly: { type: "monthly", durationDays: 30, price: "500" },
};

function emptyForm() {
  return {
    name: "",
    vendorType: "ecom",
    planType: "banner",
    presenceTopLimit: "50",
    status: "active",
    durationOptions: [
      { ...DURATION_DEFAULTS.daily },
      { ...DURATION_DEFAULTS.weekly },
      { ...DURATION_DEFAULTS.monthly },
    ],
  };
}

function formatInr(amount) {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

function planTypeLabel(value) {
  return PLAN_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || "—";
}

function vendorTypeLabel(value) {
  return VENDOR_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || "E-commerce vendor";
}

export function PromotionPlanPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const formSectionRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState("");
  const [filterPlanType, setFilterPlanType] = useState("");
  const [filterVendorType, setFilterVendorType] = useState("");
  const [viewRow, setViewRow] = useState(null);
  const [togglingId, setTogglingId] = useState("");

  const loadRows = useCallback(async () => {
    if (!adminToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await adminListPromotionPlans(adminToken, {
        page,
        limit: LIST_LIMIT,
        planType: filterPlanType || undefined,
        vendorType: filterVendorType || undefined,
      });
      setRows(result?.plans || []);
      setTotal(result?.pagination?.total || 0);
      setPages(result?.pagination?.pages || 1);
    } catch (err) {
      setRows([]);
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Load failed", text: err?.message || "Failed to load plans" });
    } finally {
      setLoading(false);
    }
  }, [adminToken, page, filterPlanType, filterVendorType, dispatch]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId("");
  };

  const onEdit = (plan) => {
    setEditId(plan._id);
    setForm({
      name: plan.name || "",
      vendorType: plan.vendorType || "ecom",
      planType: plan.planType || "banner",
      presenceTopLimit: String(plan.presenceTopLimit || 50),
      status: plan.status || "active",
      durationOptions: (plan.durationOptions?.length
        ? plan.durationOptions
        : Object.values(DURATION_DEFAULTS)
      ).map((d) => ({
        type: d.type,
        durationDays: d.durationDays,
        price: String(d.price ?? 0),
      })),
    });
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateDuration = (type, field, value) => {
    setForm((prev) => ({
      ...prev,
      durationOptions: prev.durationOptions.map((row) =>
        row.type === type ? { ...row, [field]: value } : row
      ),
    }));
  };

  const toggleDuration = (type, enabled) => {
    setForm((prev) => {
      const exists = prev.durationOptions.some((d) => d.type === type);
      if (enabled && !exists) {
        return {
          ...prev,
          durationOptions: [...prev.durationOptions, { ...DURATION_DEFAULTS[type] }],
        };
      }
      if (!enabled && exists) {
        return {
          ...prev,
          durationOptions: prev.durationOptions.filter((d) => d.type !== type),
        };
      }
      return prev;
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!adminToken || saving) return;

    const name = String(form.name || "").trim();
    if (!name) {
      await Swal.fire({ icon: "warning", title: "Validation", text: "Plan name is required" });
      return;
    }
    if (!form.durationOptions.length) {
      await Swal.fire({
        icon: "warning",
        title: "Validation",
        text: "Enable at least one duration (Daily / Weekly / Monthly)",
      });
      return;
    }

    const payload = {
      name,
      vendorType: form.vendorType,
      planType: form.vendorType === "venue" ? "banner" : form.planType,
      status: form.status,
      durationOptions: form.durationOptions.map((d) => ({
        type: d.type,
        durationDays: Number(d.durationDays) || DURATION_DEFAULTS[d.type].durationDays,
        price: Number(d.price) || 0,
      })),
      presenceTopLimit:
        form.planType === "product_presence_first" ? Number(form.presenceTopLimit) || 50 : null,
    };

    setSaving(true);
    try {
      if (editId) await adminUpdatePromotionPlan(adminToken, editId, payload);
      else await adminCreatePromotionPlan(adminToken, payload);
      await Swal.fire({
        icon: "success",
        title: editId ? "Plan updated" : "Plan created",
        timer: 1500,
      });
      resetForm();
      await loadRows();
    } catch (err) {
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Save failed", text: err?.message || "Could not save plan" });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (plan) => {
    if (editId) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete plan?",
      text: `This will delete "${plan.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeletePromotionPlan(adminToken, plan._id);
      await Swal.fire({ icon: "success", title: "Plan deleted", timer: 1500 });
      await loadRows();
    } catch (err) {
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Delete failed", text: err?.message || "Could not delete" });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdatePromotionPlan(adminToken, row._id, { status: nextStatus });
      await loadRows();
    } catch (err) {
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Status update failed", text: err?.message || "Failed" });
    } finally {
      setTogglingId("");
    }
  };

  const planTypeOptions =
    form.vendorType === "venue" ? PLAN_TYPE_OPTIONS.filter((o) => o.value === "banner") : PLAN_TYPE_OPTIONS;

  const hint = useMemo(() => {
    if (form.vendorType === "venue") {
      return "Service vendors can only buy Banner Promotion. After they pay and you approve, the banner shows on the user service home.";
    }
    if (form.planType === "banner") return "E-commerce vendors pay for a promotional banner in a city / sub-district.";
    if (form.planType === "get_verified") return "Vendors pay for a verified badge in a location.";
    return "Vendors promote one product into Top 50 or Top 100 listings.";
  }, [form.planType, form.vendorType]);

  const showPresence = form.vendorType !== "venue" && form.planType === "product_presence_first";

  return (
    <div className="user-page">
      <div className="page-card" ref={formSectionRef} style={{ scrollMarginTop: "80px" }}>
        <div className="page-card__head">
          <div>
            <h2 className="page-card__title">{editId ? "Edit Promotion Plan" : "Create Promotion Plan"}</h2>
            <p className="page-card__desc">
              Choose who this plan is for. Service vendors can only use Banner Promotion.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="promo-plan-form">
          <div className="promo-plan-form__grid">
            <label className="user-field">
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
            <label className="user-field">
              <span className="user-field__label">
                Vendor type <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.vendorType}
                onChange={(e) => {
                  const vendorType = e.target.value;
                  setForm((p) => ({
                    ...p,
                    vendorType,
                    planType: vendorType === "venue" ? "banner" : p.planType,
                  }));
                }}
                required
              >
                {VENDOR_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field">
              <span className="user-field__label">
                Plan type <span className="required-dot">*</span>
              </span>
              <select
                className="user-field__input"
                value={form.vendorType === "venue" ? "banner" : form.planType}
                onChange={(e) => setForm((p) => ({ ...p, planType: e.target.value }))}
                required
                disabled={form.vendorType === "venue"}
              >
                {planTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field">
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
            {showPresence ? (
              <label className="user-field">
                <span className="user-field__label">Top list size</span>
                <select
                  className="user-field__input"
                  value={form.presenceTopLimit}
                  onChange={(e) => setForm((p) => ({ ...p, presenceTopLimit: e.target.value }))}
                >
                  <option value="50">Top 50</option>
                  <option value="100">Top 100</option>
                </select>
              </label>
            ) : null}
          </div>
          <p className="promo-plan-form__hint">{hint}</p>

          <div className="promo-plan-form__durations">
            <strong>Duration pricing</strong>
            <p className="page-card__desc">Tick at least one duration. Price is used when the vendor selects that option.</p>
            <div className="promo-plan-form__duration-grid">
              {["daily", "weekly", "monthly"].map((type) => {
                const row = form.durationOptions.find((d) => d.type === type);
                const enabled = Boolean(row);
                return (
                  <div key={type} className={`promo-plan-form__duration${enabled ? " is-on" : ""}`}>
                    <label className="promo-plan-form__check">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => toggleDuration(type, e.target.checked)}
                      />
                      <span>{type}</span>
                    </label>
                    <label className="user-field">
                      <span className="user-field__label">Days</span>
                      <input
                        type="number"
                        min={1}
                        className="user-field__input"
                        disabled={!enabled}
                        value={row?.durationDays ?? DURATION_DEFAULTS[type].durationDays}
                        onChange={(e) => updateDuration(type, "durationDays", e.target.value)}
                      />
                    </label>
                    <label className="user-field">
                      <span className="user-field__label">Price (₹)</span>
                      <input
                        type="number"
                        min={0}
                        className="user-field__input"
                        disabled={!enabled}
                        value={row?.price ?? "0"}
                        onChange={(e) => updateDuration(type, "price", e.target.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
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
        <div className="page-card__head promo-requests__head">
          <h2 className="page-card__title">Promotion Plans</h2>
          <div className="promo-requests__filters">
            <select
              className="user-list-status-select"
              value={filterVendorType}
              onChange={(e) => {
                setFilterVendorType(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by vendor type"
            >
              <option value="">All vendor types</option>
              {VENDOR_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="user-list-status-select"
              value={filterPlanType}
              onChange={(e) => {
                setFilterPlanType(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by plan type"
            >
              <option value="">All plan types</option>
              {PLAN_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Name</th>
                <th>Vendor</th>
                <th>Type</th>
                <th>Pricing</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No promotion plans found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} onOpen={() => setViewRow(row)}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>
                      <div className="user-cell__name">{row.name || "—"}</div>
                      {row.presenceTopLimit ? (
                        <div className="data-table__muted">Top {row.presenceTopLimit}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`pill ${row.vendorType === "venue" ? "pill--pay-info" : "pill--pay-neutral"}`}>
                        {vendorTypeLabel(row.vendorType)}
                      </span>
                    </td>
                    <td>{planTypeLabel(row.planType)}</td>
                    <td className="data-table__muted">
                      {(row.durationOptions || []).map((d) => (
                        <div key={d.type}>
                          {d.type}: {formatInr(d.price)}
                        </div>
                      ))}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="promo-status-cell"
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                        title={row.status === "active" ? "Click to deactivate" : "Click to activate"}
                      >
                        <span className={`pill ${row.status === "active" ? "pill--active" : "pill--inactive"}`}>
                          {row.status === "active" ? "Active" : "Inactive"}
                        </span>
                        <span
                          className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                          aria-hidden
                        >
                          <span className="settings-switch__knob" />
                        </span>
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
        <div role="dialog" aria-modal="true" className="promo-requests__overlay" onClick={() => setViewRow(null)}>
          <div className="page-card promo-requests__dialog" onClick={(e) => e.stopPropagation()}>
            <div className="page-card__head">
              <h2 className="page-card__title">Plan details</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            <div className="promo-requests__details">
              <div>
                <strong>Name</strong>
                <span>{viewRow.name || "—"}</span>
              </div>
              <div>
                <strong>Vendor type</strong>
                <span>{vendorTypeLabel(viewRow.vendorType)}</span>
              </div>
              <div>
                <strong>Plan type</strong>
                <span>{planTypeLabel(viewRow.planType)}</span>
              </div>
              <div>
                <strong>Status</strong>
                <span>{viewRow.status || "—"}</span>
              </div>
              {viewRow.presenceTopLimit ? (
                <div>
                  <strong>Top limit</strong>
                  <span>{viewRow.presenceTopLimit}</span>
                </div>
              ) : null}
              <div>
                <strong>Duration options</strong>
                <span>
                  {(viewRow.durationOptions || [])
                    .map((d) => `${d.type} — ${d.durationDays} day(s) — ${formatInr(d.price)}`)
                    .join(" · ") || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
