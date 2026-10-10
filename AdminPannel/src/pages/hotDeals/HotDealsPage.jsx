import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminApproveHotDeal,
  adminCreateHotDealRule,
  adminDeleteHotDealRule,
  adminListHotDealQueue,
  adminListHotDealRules,
  adminPreviewHotDeals,
  adminRejectHotDeal,
  adminUpdateHotDealRule,
} from "../../api/adminHotDeals.js";
import { getFeatureSettings, patchFeatureSettings } from "../../api/adminMisc.js";
import { adminListCategories } from "../../api/adminCategories.js";
import { adminListVendors } from "../../api/adminVendors.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";

const TABS = [
  { id: "rules", label: "Rules" },
  { id: "queue", label: "Approval queue" },
  { id: "preview", label: "Live preview" },
];

const QUEUE_LIMIT = 10;

const QUEUE_STATUS_PILL = {
  pending: "pill pill--vendor-pending",
  approved: "pill pill--vendor-approved",
  rejected: "pill pill--blocked",
  none: "pill pill--inactive",
};

function emptyRule() {
  return {
    name: "",
    badge: "Hot deal",
    description: "",
    minDiscountPercent: "10",
    minPrice: "0",
    maxPrice: "0",
    minStock: "1",
    limit: "12",
    priority: "0",
    requireOptIn: true,
    autoApprove: false,
    startsAt: "",
    endsAt: "",
    dailyStartHour: "",
    dailyEndHour: "",
    categories: [],
    vendors: [],
    status: "active",
  };
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatInr(amount) {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

function idOf(value) {
  return value && typeof value === "object" ? String(value._id ?? "") : String(value ?? "");
}

function validateRule(form) {
  if (!form.name.trim()) return "Rule name is required.";
  const pct = Number(form.minDiscountPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return "Minimum discount must be between 0 and 100.";
  for (const [key, label] of [
    ["minPrice", "Minimum price"],
    ["maxPrice", "Maximum price"],
    ["minStock", "Minimum stock"],
  ]) {
    const n = Number(form[key]);
    if (form[key] !== "" && (!Number.isFinite(n) || n < 0)) return `${label} must be 0 or more.`;
  }
  if (Number(form.maxPrice) > 0 && Number(form.maxPrice) < Number(form.minPrice)) {
    return "Maximum price must be greater than minimum price (or 0 for no limit).";
  }
  const limit = Number(form.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return "Limit must be between 1 and 100.";
  if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
    return "End time must be after start time.";
  }
  const hasStart = form.dailyStartHour !== "";
  const hasEnd = form.dailyEndHour !== "";
  if (hasStart !== hasEnd) return "Set both daily start and end hours, or leave both empty.";
  if (hasStart) {
    const s = Number(form.dailyStartHour);
    const e = Number(form.dailyEndHour);
    if (!Number.isInteger(s) || s < 0 || s > 23) return "Daily start hour must be 0–23.";
    if (!Number.isInteger(e) || e < 1 || e > 24) return "Daily end hour must be 1–24.";
  }
  return "";
}

function ruleSummary(rule) {
  const parts = [];
  if (rule.minDiscountPercent) parts.push(`≥ ${rule.minDiscountPercent}% off`);
  if (rule.minPrice) parts.push(`price ≥ ${formatInr(rule.minPrice)}`);
  if (rule.maxPrice) parts.push(`price ≤ ${formatInr(rule.maxPrice)}`);
  if (rule.minStock) parts.push(`stock ≥ ${rule.minStock}`);
  if (rule.categories?.length) parts.push(`${rule.categories.length} categories`);
  if (rule.vendors?.length) parts.push(`${rule.vendors.length} vendors`);
  if (rule.dailyStartHour != null && rule.dailyEndHour != null) {
    parts.push(`daily ${rule.dailyStartHour}:00–${rule.dailyEndHour}:00`);
  }
  return parts.join(" · ") || "Any discounted product";
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`settings-switch${checked ? " settings-switch--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch__knob" aria-hidden />
    </button>
  );
}

function CheckList({ items, selected, onToggle, emptyText, getLabel }) {
  return (
    <div className="user-field__input" style={{ maxHeight: 200, overflowY: "auto", padding: "8px 10px" }}>
      {items.length === 0 ? (
        <div className="data-table__muted">{emptyText}</div>
      ) : (
        items.map((item) => (
          <label key={item._id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(String(item._id))} onChange={() => onToggle(String(item._id))} />
            <span>{getLabel(item)}</span>
          </label>
        ))
      )}
    </div>
  );
}

export function HotDealsPage({ initialTab = "rules" }) {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [tab, setTab] = useState(initialTab);

  const [settings, setSettings] = useState(null);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [form, setForm] = useState(emptyRule());
  const [editId, setEditId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState("");

  const [queue, setQueue] = useState([]);
  const [queueStatus, setQueueStatus] = useState("pending");
  const [queuePage, setQueuePage] = useState(1);
  const [queuePages, setQueuePages] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);
  const [busyId, setBusyId] = useState("");

  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleError = useCallback(
    async (e, title) => {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      await Swal.fire({ icon: "error", title, text: e?.message || "Something went wrong." });
    },
    [dispatch]
  );

  const loadSettings = useCallback(async () => {
    if (!adminToken) return;
    try {
      const fs = await getFeatureSettings(adminToken);
      setSettingsMissing(fs === null);
      setSettings(fs);
    } catch (e) {
      await handleError(e, "Could not load settings");
    }
  }, [adminToken, handleError]);

  const loadRules = useCallback(async () => {
    if (!adminToken) return;
    setRulesLoading(true);
    try {
      setRules((await adminListHotDealRules(adminToken)) ?? []);
    } catch (e) {
      await handleError(e, "Could not load rules");
    } finally {
      setRulesLoading(false);
    }
  }, [adminToken, handleError]);

  const loadQueue = useCallback(async () => {
    if (!adminToken) return;
    setQueueLoading(true);
    try {
      const { rows, pagination } = await adminListHotDealQueue(adminToken, {
        page: queuePage,
        limit: QUEUE_LIMIT,
        status: queueStatus,
      });
      setQueue(rows);
      setQueuePages(pagination?.pages ?? 1);
      setQueueTotal(pagination?.total ?? 0);
    } catch (e) {
      await handleError(e, "Could not load queue");
    } finally {
      setQueueLoading(false);
    }
  }, [adminToken, handleError, queuePage, queueStatus]);

  const loadPreview = useCallback(async () => {
    if (!adminToken) return;
    setPreviewLoading(true);
    try {
      setPreview((await adminPreviewHotDeals(adminToken, { limit: settings?.hotDealsLimit || 12 })) ?? []);
    } catch (e) {
      await handleError(e, "Could not load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [adminToken, handleError, settings?.hotDealsLimit]);

  useEffect(() => {
    loadSettings();
    loadRules();
  }, [loadSettings, loadRules]);

  useEffect(() => {
    if (tab === "queue") loadQueue();
  }, [tab, loadQueue]);

  useEffect(() => {
    if (tab === "preview") loadPreview();
  }, [tab, loadPreview]);

  useEffect(() => {
    if (!showForm || !adminToken) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ categories: cats }, { vendors: vs }] = await Promise.all([
          adminListCategories(adminToken, { page: 1, limit: 200, mode: "ecom", listed: true }),
          adminListVendors(adminToken, { page: 1, limit: 200, status: "active" }),
        ]);
        if (cancelled) return;
        setCategories(cats ?? []);
        setVendors(vs ?? []);
      } catch (e) {
        if (!cancelled) await handleError(e, "Could not load categories/vendors");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showForm, adminToken, handleError]);

  const updateSetting = async (partial) => {
    if (!adminToken || settingsMissing) return;
    setSavingSettings(true);
    try {
      const next = await patchFeatureSettings(adminToken, partial);
      if (next) setSettings(next);
    } catch (e) {
      await handleError(e, "Could not save setting");
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => String(v.businessName || v.name || "").toLowerCase().includes(q));
  }, [vendors, vendorSearch]);

  const toggleListValue = (key, id) =>
    setForm((p) => ({
      ...p,
      [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id],
    }));

  const openCreate = () => {
    setForm(emptyRule());
    setEditId("");
    setShowForm(true);
  };

  const openEdit = (rule) => {
    setEditId(rule._id);
    setForm({
      name: rule.name || "",
      badge: rule.badge || "",
      description: rule.description || "",
      minDiscountPercent: String(rule.minDiscountPercent ?? 0),
      minPrice: String(rule.minPrice ?? 0),
      maxPrice: String(rule.maxPrice ?? 0),
      minStock: String(rule.minStock ?? 0),
      limit: String(rule.limit ?? 12),
      priority: String(rule.priority ?? 0),
      requireOptIn: rule.requireOptIn !== false,
      autoApprove: Boolean(rule.autoApprove),
      startsAt: toDateTimeLocalValue(rule.startsAt),
      endsAt: toDateTimeLocalValue(rule.endsAt),
      dailyStartHour: rule.dailyStartHour == null ? "" : String(rule.dailyStartHour),
      dailyEndHour: rule.dailyEndHour == null ? "" : String(rule.dailyEndHour),
      categories: (rule.categories || []).map(idOf),
      vendors: (rule.vendors || []).map(idOf),
      status: rule.status || "active",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId("");
    setForm(emptyRule());
  };

  const onSubmitRule = async (e) => {
    e.preventDefault();
    const error = validateRule(form);
    if (error) {
      await Swal.fire({ icon: "error", title: "Validation error", text: error });
      return;
    }
    const payload = {
      name: form.name.trim(),
      badge: form.badge.trim(),
      description: form.description.trim(),
      minDiscountPercent: Number(form.minDiscountPercent) || 0,
      minPrice: Number(form.minPrice) || 0,
      maxPrice: Number(form.maxPrice) || 0,
      minStock: Number(form.minStock) || 0,
      limit: Number(form.limit) || 12,
      priority: Number(form.priority) || 0,
      requireOptIn: form.requireOptIn,
      autoApprove: form.autoApprove,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      dailyStartHour: form.dailyStartHour === "" ? null : Number(form.dailyStartHour),
      dailyEndHour: form.dailyEndHour === "" ? null : Number(form.dailyEndHour),
      categories: form.categories,
      vendors: form.vendors,
      status: form.status,
    };
    setSaving(true);
    try {
      if (editId) {
        await adminUpdateHotDealRule(adminToken, editId, payload);
        await Swal.fire({ icon: "success", title: "Rule updated", timer: 1400 });
      } else {
        await adminCreateHotDealRule(adminToken, payload);
        await Swal.fire({ icon: "success", title: "Rule created", timer: 1400 });
      }
      closeForm();
      await loadRules();
    } catch (err) {
      await handleError(err, "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onToggleRule = async (rule) => {
    setBusyId(rule._id);
    try {
      await adminUpdateHotDealRule(adminToken, rule._id, { status: rule.status === "active" ? "inactive" : "active" });
      await loadRules();
    } catch (e) {
      await handleError(e, "Status update failed");
    } finally {
      setBusyId("");
    }
  };

  const onDeleteRule = async (rule) => {
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete rule?",
      text: `This will delete "${rule.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed) return;
    try {
      await adminDeleteHotDealRule(adminToken, rule._id);
      if (editId === rule._id) closeForm();
      await loadRules();
    } catch (e) {
      await handleError(e, "Delete failed");
    }
  };

  const onApprove = async (row) => {
    setBusyId(row._id);
    try {
      await adminApproveHotDeal(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Added to Hot Deals", timer: 1300 });
      await loadQueue();
    } catch (e) {
      await handleError(e, "Approve failed");
    } finally {
      setBusyId("");
    }
  };

  const onReject = async (row) => {
    const { value: reason, isConfirmed } = await Swal.fire({
      title: "Reject hot deal request",
      input: "textarea",
      inputLabel: `Reason for "${row.name}" (sent to the vendor)`,
      inputValidator: (v) => (String(v || "").trim().length < 3 ? "Please write a short reason." : undefined),
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Reject",
    });
    if (!isConfirmed) return;
    setBusyId(row._id);
    try {
      await adminRejectHotDeal(adminToken, row._id, String(reason).trim());
      await loadQueue();
    } catch (e) {
      await handleError(e, "Reject failed");
    } finally {
      setBusyId("");
    }
  };

  const hotDealsOn = Boolean(settings?.hotDealsEnabled);

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head" style={{ flexWrap: "wrap", gap: 12 }}>
          <h2 className="page-card__title">Hot Deals</h2>
        </div>
        {settingsMissing ? (
          <p className="data-table__muted">
            Save the application settings once (Settings page) before switching Hot Deals on.
          </p>
        ) : (
          <div className="row g-3" style={{ alignItems: "flex-end" }}>
            <div className="user-field col-12 col-md-4">
              <span className="user-field__label">Show Hot Deals in the user app</span>
              <Toggle
                checked={hotDealsOn}
                label="Hot deals enabled"
                disabled={!settings || savingSettings}
                onChange={(v) => updateSetting({ hotDealsEnabled: v })}
              />
              <small className="data-table__muted">{hotDealsOn ? "Section is live on the home screen." : "Section is hidden."}</small>
            </div>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Products shown in the section</span>
              <input
                type="number"
                min="1"
                max="50"
                className="user-field__input"
                defaultValue={settings?.hotDealsLimit ?? 12}
                key={`limit-${settings?.hotDealsLimit ?? 12}`}
                disabled={!settings || savingSettings}
                onBlur={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  if (Number.isFinite(n) && n >= 1 && n !== settings?.hotDealsLimit) updateSetting({ hotDealsLimit: n });
                }}
              />
            </label>
          </div>
        )}
        <p className="data-table__muted" style={{ marginTop: 10 }}>
          A product appears in Hot Deals when it is active, in stock, matches at least one active rule, and (if the rule asks
          for it) the vendor opted in and the request was approved.
        </p>
      </div>

      <div className="page-card">
        <div className="settings-tabs" role="tablist" aria-label="Hot deals sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`settings-tabs__tab${tab === t.id ? " settings-tabs__tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "rules" ? (
          <div className="settings-tab-panel">
            <div className="page-card__head" style={{ marginTop: 12 }}>
              <h3 className="page-card__title" style={{ fontSize: "1rem" }}>Rules</h3>
              {!showForm ? (
                <button type="button" className="btn btn--primary" onClick={openCreate}>
                  Add rule
                </button>
              ) : null}
            </div>

            {showForm ? (
              <form onSubmit={onSubmitRule} style={{ marginBottom: 20 }}>
                <div className="row g-3">
                  <label className="user-field col-12 col-md-6">
                    <span className="user-field__label">
                      Rule name <span className="required-dot">*</span>
                    </span>
                    <input
                      className="user-field__input"
                      value={form.name}
                      maxLength={80}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="user-field col-12 col-md-3">
                    <span className="user-field__label">Badge text</span>
                    <input
                      className="user-field__input"
                      value={form.badge}
                      maxLength={30}
                      onChange={(e) => setForm((p) => ({ ...p, badge: e.target.value }))}
                    />
                  </label>
                  <label className="user-field col-12 col-md-3">
                    <span className="user-field__label">Status</span>
                    <select className="user-field__input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="user-field col-12">
                    <span className="user-field__label">Description (admin note)</span>
                    <input
                      className="user-field__input"
                      value={form.description}
                      maxLength={300}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    />
                  </label>
                  {[
                    ["minDiscountPercent", "Minimum discount %", "0", "100"],
                    ["minPrice", "Minimum price (₹)", "0"],
                    ["maxPrice", "Maximum price (₹, 0 = no limit)", "0"],
                    ["minStock", "Minimum stock", "0"],
                    ["limit", "Max products from this rule", "1", "100"],
                    ["priority", "Priority (higher first)"],
                  ].map(([key, label, min, max]) => (
                    <label key={key} className="user-field col-12 col-md-4">
                      <span className="user-field__label">{label}</span>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        className="user-field__input"
                        value={form[key]}
                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <div className="user-field col-12 col-md-6">
                    <span className="user-field__label">Only vendor opt-ins</span>
                    <Toggle checked={form.requireOptIn} label="Require opt-in" onChange={(v) => setForm((p) => ({ ...p, requireOptIn: v }))} />
                    <small className="data-table__muted">
                      On: only products the vendor asked to put in Hot Deals. Off: every matching product qualifies.
                    </small>
                  </div>
                  <div className="user-field col-12 col-md-6">
                    <span className="user-field__label">Auto-approve matching requests</span>
                    <Toggle checked={form.autoApprove} label="Auto approve" onChange={(v) => setForm((p) => ({ ...p, autoApprove: v }))} />
                    <small className="data-table__muted">Opt-ins that already meet this rule skip the approval queue.</small>
                  </div>
                  <label className="user-field col-12 col-md-6">
                    <span className="user-field__label">Starts at (optional)</span>
                    <input
                      type="datetime-local"
                      className="user-field__input"
                      value={form.startsAt}
                      onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                    />
                  </label>
                  <label className="user-field col-12 col-md-6">
                    <span className="user-field__label">Ends at (optional)</span>
                    <input
                      type="datetime-local"
                      className="user-field__input"
                      value={form.endsAt}
                      min={form.startsAt || undefined}
                      onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
                    />
                  </label>
                  <label className="user-field col-12 col-md-6">
                    <span className="user-field__label">Daily start hour (0–23, optional)</span>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      className="user-field__input"
                      value={form.dailyStartHour}
                      onChange={(e) => setForm((p) => ({ ...p, dailyStartHour: e.target.value }))}
                      placeholder="e.g. 10"
                    />
                  </label>
                  <label className="user-field col-12 col-md-6">
                    <span className="user-field__label">Daily end hour (1–24, optional)</span>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      className="user-field__input"
                      value={form.dailyEndHour}
                      onChange={(e) => setForm((p) => ({ ...p, dailyEndHour: e.target.value }))}
                      placeholder="e.g. 22"
                    />
                  </label>
                  <div className="user-field col-12 col-md-6">
                    <span className="user-field__label">
                      Categories ({form.categories.length ? `${form.categories.length} selected` : "all"})
                    </span>
                    <CheckList
                      items={categories}
                      selected={form.categories}
                      onToggle={(id) => toggleListValue("categories", id)}
                      emptyText="No categories found."
                      getLabel={(c) => c.name}
                    />
                  </div>
                  <div className="user-field col-12 col-md-6">
                    <span className="user-field__label">
                      Vendors ({form.vendors.length ? `${form.vendors.length} selected` : "all"})
                    </span>
                    <input
                      className="user-field__input"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      placeholder="Search vendor…"
                      style={{ marginBottom: 6 }}
                    />
                    <CheckList
                      items={filteredVendors}
                      selected={form.vendors}
                      onToggle={(id) => toggleListValue("vendors", id)}
                      emptyText="No vendors found."
                      getLabel={(v) => v.businessName || v.name || v._id}
                    />
                  </div>
                </div>
                <div className="user-form__actions">
                  <button type="button" className="btn btn--ghost" onClick={closeForm} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? "Saving…" : editId ? "Update rule" : "Create rule"}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Conditions</th>
                    <th>Opt-in</th>
                    <th>Auto-approve</th>
                    <th>Limit</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th className="data-table__actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesLoading ? (
                    <tr>
                      <td colSpan={8}>Loading…</td>
                    </tr>
                  ) : rules.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No rules yet. Without an active rule the Hot Deals section stays empty.</td>
                    </tr>
                  ) : (
                    rules.map((rule) => (
                      <tr key={rule._id}>
                        <td>
                          {rule.name}
                          {rule.badge ? <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>{rule.badge}</span> : null}
                        </td>
                        <td className="data-table__muted">{ruleSummary(rule)}</td>
                        <td>{rule.requireOptIn ? "Required" : "Not needed"}</td>
                        <td>{rule.autoApprove ? "Yes" : "No"}</td>
                        <td>{rule.limit}</td>
                        <td>{rule.priority}</td>
                        <td>
                          <Toggle
                            checked={rule.status === "active"}
                            label={`Toggle ${rule.name}`}
                            disabled={busyId === rule._id}
                            onChange={() => onToggleRule(rule)}
                          />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={() => openEdit(rule)}>
                              <MdEditSquare size={18} />
                            </button>
                            <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={() => onDeleteRule(rule)}>
                              <AiFillDelete size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "queue" ? (
          <div className="settings-tab-panel">
            <div className="page-card__head" style={{ marginTop: 12 }}>
              <h3 className="page-card__title" style={{ fontSize: "1rem" }}>Vendor requests</h3>
              <label className="user-field" style={{ margin: 0, width: 200 }}>
                <select
                  className="user-field__input"
                  value={queueStatus}
                  onChange={(e) => {
                    setQueueStatus(e.target.value);
                    setQueuePage(1);
                  }}
                  aria-label="Filter by request status"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
              </label>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Vendor</th>
                    <th>Price</th>
                    <th>Discount</th>
                    <th>Stock</th>
                    <th>Matching rules</th>
                    <th>Status</th>
                    <th className="data-table__actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueLoading ? (
                    <tr>
                      <td colSpan={8}>Loading…</td>
                    </tr>
                  ) : queue.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No requests.</td>
                    </tr>
                  ) : (
                    queue.map((row) => {
                      const status = row.hotDeal?.status || "none";
                      return (
                        <tr key={row._id}>
                          <td>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              {row.thumbnail ? (
                                <img src={mediaUrl(row.thumbnail)} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                              ) : null}
                              <span>
                                {row.name}
                                {row.category?.name ? (
                                  <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>{row.category.name}</span>
                                ) : null}
                              </span>
                            </div>
                          </td>
                          <td>{row.vendor?.businessName || "—"}</td>
                          <td>{formatInr(row.price)}</td>
                          <td>{row.discountPercent ? `${row.discountPercent}%` : "—"}</td>
                          <td>{row.stock ?? 0}</td>
                          <td>
                            {row.qualifies ? (
                              row.matchingRules.map((r) => r.name).join(", ")
                            ) : (
                              <span style={{ color: "#b45309" }}>No rule matches</span>
                            )}
                          </td>
                          <td>
                            <span className={QUEUE_STATUS_PILL[status] || "pill"}>{status}</span>
                            {status === "rejected" && row.hotDeal?.rejectionReason ? (
                              <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>{row.hotDeal.rejectionReason}</span>
                            ) : null}
                          </td>
                          <td>
                            <div className="row-actions" style={{ gap: 6 }}>
                              {status !== "approved" ? (
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  style={{ padding: "4px 10px" }}
                                  disabled={busyId === row._id}
                                  onClick={() => onApprove(row)}
                                >
                                  Approve
                                </button>
                              ) : null}
                              {status !== "rejected" ? (
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  style={{ padding: "4px 10px" }}
                                  disabled={busyId === row._id}
                                  onClick={() => onReject(row)}
                                >
                                  Reject
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <ListPagination page={queuePage} pages={queuePages} total={queueTotal} onPageChange={setQueuePage} />
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="settings-tab-panel">
            <div className="page-card__head" style={{ marginTop: 12 }}>
              <h3 className="page-card__title" style={{ fontSize: "1rem" }}>What users see right now</h3>
              <button type="button" className="btn btn--ghost" onClick={loadPreview} disabled={previewLoading}>
                Refresh
              </button>
            </div>
            {!hotDealsOn && !settingsMissing ? (
              <p style={{ color: "#b45309" }}>Hot Deals is switched off, so users currently see nothing. This is the list they would see.</p>
            ) : null}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Discount</th>
                    <th>Picked by rule</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLoading ? (
                    <tr>
                      <td colSpan={4}>Loading…</td>
                    </tr>
                  ) : preview.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No product qualifies right now.</td>
                    </tr>
                  ) : (
                    preview.map((row, idx) => (
                      <tr key={row._id}>
                        <td className="data-table__muted">{idx + 1}</td>
                        <td>{row.name}</td>
                        <td>{row.discountPercent ? `${row.discountPercent}%` : "—"}</td>
                        <td>{row.rule?.name || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
