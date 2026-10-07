import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { AiFillDelete } from "react-icons/ai";
import { getFeatureSettings, patchFeatureSettings } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";

const PROFILE_MODULES = [
  { id: "personal", label: "Personal details" },
  { id: "business", label: "Business details" },
  { id: "shopMedia", label: "Shop photos / media" },
  { id: "bank", label: "Bank details" },
  { id: "documents", label: "Documents" },
  { id: "services", label: "Services / venues" },
  { id: "products", label: "Products" },
];

const PERK_OPTIONS = [
  { value: "", label: "None (info only)" },
  { value: "ranking_boost", label: "Ranking boost" },
  { value: "get_verified_eligible", label: "Eligible for Get Verified" },
  { value: "free_phone_trial", label: "Free Show Number trial" },
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

const NUMBER_LIMITS = {
  enquiryBookingWindowHours: [1, 336, "Booking window"],
  enquiryResponseHours: [1, 720, "Vendor reply time"],
  phoneTrialDaysOnFullProfile: [0, 365, "Free trial days"],
  hotDealsLimit: [1, 50, "Hot deals shown"],
  discountAlertMinPercent: [0, 100, "Discount alert minimum"],
  discountAlertCooldownHours: [0, 720, "Discount alert cooldown"],
};

function toForm(fs) {
  const s = fs || {};
  const modules = {};
  PROFILE_MODULES.forEach(({ id }) => {
    const row = s.profileModules?.[id] || {};
    modules[id] = { icon: row.icon || "", color: row.color || "", image: row.image || "" };
  });
  return {
    venueBookingMode: s.venueBookingMode === "direct" ? "direct" : "enquiry",
    enquiryBookingWindowHours: String(s.enquiryBookingWindowHours ?? 24),
    enquiryResponseHours: String(s.enquiryResponseHours ?? 48),
    enquiryHoldDatesEnabled: s.enquiryHoldDatesEnabled !== false,
    phonePlanRequired: s.phonePlanRequired !== false,
    phoneTrialDaysOnFullProfile: String(s.phoneTrialDaysOnFullProfile ?? 7),
    videoEnabledUser: s.videoEnabledUser !== false,
    videoEnabledVendor: s.videoEnabledVendor !== false,
    hotDealsEnabled: s.hotDealsEnabled !== false,
    hotDealsLimit: String(s.hotDealsLimit ?? 12),
    discountAlertMinPercent: String(s.discountAlertMinPercent ?? 5),
    discountAlertCooldownHours: String(s.discountAlertCooldownHours ?? 24),
    autoApproveTrustedVendors: s.autoApproveTrustedVendors !== false,
    homeSections: Array.isArray(s.homeSections) ? s.homeSections.map((r) => ({ ...r })) : [],
    profileBenefits: Array.isArray(s.profileBenefits)
      ? s.profileBenefits.map((r) => ({
          minPercent: String(r.minPercent ?? 0),
          title: r.title || "",
          description: r.description || "",
          icon: r.icon || "",
          perk: r.perk || "",
          image: r.image || "",
        }))
      : [],
    profileModules: modules,
  };
}

function validate(form) {
  for (const [key, [min, max, label]] of Object.entries(NUMBER_LIMITS)) {
    const n = Number(form[key]);
    if (form[key] === "" || !Number.isFinite(n) || n < min || n > max) {
      return `${label} must be between ${min} and ${max}.`;
    }
  }
  for (const [idx, row] of form.profileBenefits.entries()) {
    if (!row.title.trim()) return `Profile benefit #${idx + 1} needs a title.`;
    const pct = Number(row.minPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return `Profile benefit "${row.title}" needs a percent between 0 and 100.`;
  }
  for (const { id, label } of PROFILE_MODULES) {
    const color = form.profileModules[id].color.trim();
    if (color && !HEX_COLOR_RE.test(color)) return `${label} colour must be a hex colour like #2563EB.`;
  }
  for (const row of form.homeSections) {
    if (!String(row.title || "").trim()) return "Every home section needs a title.";
  }
  return "";
}

function toPayload(form) {
  const modules = {};
  PROFILE_MODULES.forEach(({ id }) => {
    const row = form.profileModules[id];
    const entry = {};
    if (row.icon.trim()) entry.icon = row.icon.trim();
    if (row.color.trim()) entry.color = row.color.trim();
    if (row.image.trim()) entry.image = row.image.trim();
    if (Object.keys(entry).length) modules[id] = entry;
  });
  return {
    venueBookingMode: form.venueBookingMode,
    enquiryBookingWindowHours: Number(form.enquiryBookingWindowHours),
    enquiryResponseHours: Number(form.enquiryResponseHours),
    enquiryHoldDatesEnabled: form.enquiryHoldDatesEnabled,
    phonePlanRequired: form.phonePlanRequired,
    phoneTrialDaysOnFullProfile: Number(form.phoneTrialDaysOnFullProfile),
    videoEnabledUser: form.videoEnabledUser,
    videoEnabledVendor: form.videoEnabledVendor,
    hotDealsEnabled: form.hotDealsEnabled,
    hotDealsLimit: Number(form.hotDealsLimit),
    discountAlertMinPercent: Number(form.discountAlertMinPercent),
    discountAlertCooldownHours: Number(form.discountAlertCooldownHours),
    autoApproveTrustedVendors: form.autoApproveTrustedVendors,
    homeSections: form.homeSections.map((r) => ({ key: r.key, title: String(r.title).trim(), enabled: Boolean(r.enabled) })),
    profileBenefits: form.profileBenefits.map((r) => ({
      minPercent: Number(r.minPercent),
      title: r.title.trim(),
      description: r.description.trim(),
      icon: r.icon.trim() || "star",
      perk: r.perk,
      ...(r.image.trim() ? { image: r.image.trim() } : {}),
    })),
    profileModules: modules,
  };
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-switch${checked ? " settings-switch--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch__knob" aria-hidden />
    </button>
  );
}

function ToggleField({ label, hint, checked, onChange }) {
  return (
    <div className="user-field col-12 col-md-6">
      <span className="user-field__label">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
      {hint ? <small className="data-table__muted">{hint}</small> : null}
    </div>
  );
}

function NumberField({ label, hint, value, onChange, min, max }) {
  return (
    <label className="user-field col-12 col-md-6">
      <span className="user-field__label">{label}</span>
      <input type="number" min={min} max={max} className="user-field__input" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <small className="data-table__muted">{hint}</small> : null}
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <div className="page-card">
      <div className="page-card__head">
        <h2 className="page-card__title">{title}</h2>
      </div>
      {description ? (
        <p className="data-table__muted" style={{ marginBottom: 12 }}>
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function FeatureSettingsPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(() => toForm(null));

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const fs = await getFeatureSettings(adminToken);
      setMissing(fs === null);
      setForm(toForm(fs));
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e?.message || "Could not load settings." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (value) => setForm((p) => ({ ...p, [key]: value }));

  const moveSection = (idx, delta) =>
    setForm((p) => {
      const next = [...p.homeSections];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return p;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...p, homeSections: next };
    });

  const updateSection = (idx, patch) =>
    setForm((p) => ({ ...p, homeSections: p.homeSections.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  const updateBenefit = (idx, patch) =>
    setForm((p) => ({ ...p, profileBenefits: p.profileBenefits.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  const addBenefit = () =>
    setForm((p) => ({
      ...p,
      profileBenefits: [...p.profileBenefits, { minPercent: "50", title: "", description: "", icon: "star", perk: "", image: "" }],
    }));

  const removeBenefit = (idx) => setForm((p) => ({ ...p, profileBenefits: p.profileBenefits.filter((_, i) => i !== idx) }));

  const updateModule = (id, patch) =>
    setForm((p) => ({ ...p, profileModules: { ...p.profileModules, [id]: { ...p.profileModules[id], ...patch } } }));

  const onSave = async () => {
    if (!adminToken || missing) return;
    const error = validate(form);
    if (error) {
      await Swal.fire({ icon: "error", title: "Validation error", text: error });
      return;
    }
    setSaving(true);
    try {
      const next = await patchFeatureSettings(adminToken, toPayload(form));
      if (next) setForm(toForm(next));
      await Swal.fire({ icon: "success", title: "Feature settings saved", text: "Apps pick up changes within a minute.", timer: 1800 });
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Save failed", text: e?.message || "Could not save settings." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="user-page">
        <div className="page-card">Loading…</div>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="user-page">
        <div className="page-card">
          <h2 className="page-card__title">App feature settings</h2>
          <p className="data-table__muted">Save the application settings (Settings page) once before changing feature settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-page">
      <Section
        title="Venue booking & enquiries"
        description="Enquiry mode: the customer sends an enquiry, the vendor accepts, then the customer books within the booking window."
      >
        <div className="row g-3">
          <label className="user-field col-12 col-md-6">
            <span className="user-field__label">Booking mode</span>
            <select className="user-field__input" value={form.venueBookingMode} onChange={(e) => set("venueBookingMode")(e.target.value)}>
              <option value="enquiry">Enquiry first (vendor accepts, then booking)</option>
              <option value="direct">Direct booking</option>
            </select>
          </label>
          <ToggleField
            label="Hold dates for accepted enquiries"
            hint="Blocks the dates for other customers while the accepted customer pays."
            checked={form.enquiryHoldDatesEnabled}
            onChange={set("enquiryHoldDatesEnabled")}
          />
          <NumberField
            label="Booking window after accept (hours)"
            hint="How long the customer has to book once the vendor accepts."
            value={form.enquiryBookingWindowHours}
            onChange={set("enquiryBookingWindowHours")}
            min={1}
            max={336}
          />
          <NumberField
            label="Vendor reply time (hours)"
            hint="Unanswered enquiries expire after this."
            value={form.enquiryResponseHours}
            onChange={set("enquiryResponseHours")}
            min={1}
            max={720}
          />
        </div>
      </Section>

      <Section title="Vendor phone number" description="Controls when vendor phone numbers are visible to customers.">
        <div className="row g-3">
          <ToggleField
            label="Require Show Number plan"
            hint="On: numbers stay hidden until the vendor buys a Show Number plan. Off: numbers are always visible."
            checked={form.phonePlanRequired}
            onChange={set("phonePlanRequired")}
          />
          <NumberField
            label="Free trial at 100% profile (days)"
            hint="0 disables the free trial."
            value={form.phoneTrialDaysOnFullProfile}
            onChange={set("phoneTrialDaysOnFullProfile")}
            min={0}
            max={365}
          />
        </div>
      </Section>

      <Section title="Videos, hot deals & alerts">
        <div className="row g-3">
          <ToggleField label="Videos in the user app" checked={form.videoEnabledUser} onChange={set("videoEnabledUser")} />
          <ToggleField label="Video uploads for vendors" checked={form.videoEnabledVendor} onChange={set("videoEnabledVendor")} />
          <ToggleField label="Hot deals section" checked={form.hotDealsEnabled} onChange={set("hotDealsEnabled")} />
          <NumberField label="Hot deals shown" value={form.hotDealsLimit} onChange={set("hotDealsLimit")} min={1} max={50} />
          <NumberField
            label="Discount alert minimum (%)"
            hint="Wishlist/cart users are alerted when a discount is at least this much."
            value={form.discountAlertMinPercent}
            onChange={set("discountAlertMinPercent")}
            min={0}
            max={100}
          />
          <NumberField
            label="Discount alert cooldown (hours)"
            hint="Minimum gap between alerts for the same item."
            value={form.discountAlertCooldownHours}
            onChange={set("discountAlertCooldownHours")}
            min={0}
            max={720}
          />
          <ToggleField
            label="Auto-approve listings from approved vendors"
            hint="When product approval is on, approved vendors' new listings go live immediately."
            checked={form.autoApproveTrustedVendors}
            onChange={set("autoApproveTrustedVendors")}
          />
        </div>
      </Section>

      <Section title="User app home screen" description="Order and visibility of the home sections. Top of the list shows first.">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Section</th>
                <th>Title shown</th>
                <th>Visible</th>
              </tr>
            </thead>
            <tbody>
              {form.homeSections.map((row, idx) => (
                <tr key={row.key}>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="btn btn--ghost" style={{ padding: "2px 8px" }} disabled={idx === 0} onClick={() => moveSection(idx, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ padding: "2px 8px" }}
                        disabled={idx === form.homeSections.length - 1}
                        onClick={() => moveSection(idx, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="data-table__muted">{row.key}</td>
                  <td>
                    <input className="user-field__input" value={row.title} maxLength={60} onChange={(e) => updateSection(idx, { title: e.target.value })} />
                  </td>
                  <td>
                    <Toggle checked={row.enabled !== false} label={`Show ${row.key}`} onChange={(v) => updateSection(idx, { enabled: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Profile completion benefits"
        description="Milestones shown to vendors in the app. The perk decides what they unlock at that completion percentage."
      >
        {form.profileBenefits.map((row, idx) => (
          <div key={idx} className="row g-3" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 12 }}>
            <label className="user-field col-12 col-md-2">
              <span className="user-field__label">At %</span>
              <input type="number" min="0" max="100" className="user-field__input" value={row.minPercent} onChange={(e) => updateBenefit(idx, { minPercent: e.target.value })} />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Title</span>
              <input className="user-field__input" value={row.title} maxLength={60} onChange={(e) => updateBenefit(idx, { title: e.target.value })} />
            </label>
            <label className="user-field col-12 col-md-3">
              <span className="user-field__label">Perk</span>
              <select className="user-field__input" value={row.perk} onChange={(e) => updateBenefit(idx, { perk: e.target.value })}>
                {PERK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field col-10 col-md-2">
              <span className="user-field__label">Icon name</span>
              <input className="user-field__input" value={row.icon} maxLength={40} onChange={(e) => updateBenefit(idx, { icon: e.target.value })} placeholder="star" />
            </label>
            <div className="user-field col-2 col-md-1" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="icon-btn icon-btn--delete" title="Remove" onClick={() => removeBenefit(idx)} style={{ marginTop: 24 }}>
                <AiFillDelete size={18} />
              </button>
            </div>
            <label className="user-field col-12 col-md-8">
              <span className="user-field__label">Description</span>
              <input className="user-field__input" value={row.description} maxLength={200} onChange={(e) => updateBenefit(idx, { description: e.target.value })} />
            </label>
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">Image URL (optional)</span>
              <input className="user-field__input" value={row.image} onChange={(e) => updateBenefit(idx, { image: e.target.value })} />
            </label>
          </div>
        ))}
        <button type="button" className="btn btn--ghost" onClick={addBenefit}>
          Add benefit
        </button>
      </Section>

      <Section title="Profile module style" description="Optional icon, colour and image for each profile section card in the vendor app. Leave empty for the app default.">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Icon name</th>
                <th>Colour</th>
                <th>Image URL</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_MODULES.map(({ id, label }) => {
                const row = form.profileModules[id];
                return (
                  <tr key={id}>
                    <td>{label}</td>
                    <td>
                      <input className="user-field__input" value={row.icon} maxLength={40} onChange={(e) => updateModule(id, { icon: e.target.value })} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="color"
                          value={HEX_COLOR_RE.test(row.color) && row.color.length === 7 ? row.color : "#000000"}
                          onChange={(e) => updateModule(id, { color: e.target.value.toUpperCase() })}
                          style={{ width: 36, height: 34, padding: 0, border: "1px solid #e5e7eb", borderRadius: 6 }}
                          aria-label={`${label} colour picker`}
                        />
                        <input
                          className="user-field__input"
                          value={row.color}
                          maxLength={9}
                          placeholder="#2563EB"
                          onChange={(e) => updateModule(id, { color: e.target.value.trim() })}
                          style={{ maxWidth: 110 }}
                        />
                      </div>
                    </td>
                    <td>
                      <input className="user-field__input" value={row.image} onChange={(e) => updateModule(id, { image: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="page-card">
        <div className="user-form__actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn--ghost" onClick={load} disabled={saving}>
            Reset
          </button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save feature settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
