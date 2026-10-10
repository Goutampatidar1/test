import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { AiFillDelete } from "react-icons/ai";
import { getFeatureSettings, patchFeatureSettings } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";

const PERK_OPTIONS = [
  { value: "", label: "None (info only)" },
  { value: "ranking_boost", label: "Ranking boost" },
  { value: "get_verified_eligible", label: "Eligible for Get Verified" },
  { value: "free_phone_trial", label: "Free Show Number trial" },
];

const TABS = [
  { id: "media", label: "Videos & hot deals" },
  { id: "alerts", label: "Alerts & approval" },
  { id: "benefits", label: "Profile benefits" },
];

const NUMBER_LIMITS = {
  hotDealsLimit: [1, 50, "Hot deals shown", "media"],
  discountAlertMinPercent: [0, 100, "Discount alert minimum", "alerts"],
  discountAlertCooldownHours: [0, 720, "Discount alert cooldown", "alerts"],
};

function toForm(fs) {
  const s = fs || {};
  return {
    videoEnabledUser: s.videoEnabledUser !== false,
    videoEnabledVendor: s.videoEnabledVendor !== false,
    hotDealsEnabled: s.hotDealsEnabled !== false,
    hotDealsLimit: String(s.hotDealsLimit ?? 12),
    discountAlertMinPercent: String(s.discountAlertMinPercent ?? 5),
    discountAlertCooldownHours: String(s.discountAlertCooldownHours ?? 24),
    autoApproveTrustedVendors: s.autoApproveTrustedVendors !== false,
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
  };
}

/** Returns `{ tab, text }` for the first problem found, or null. */
function validate(form) {
  for (const [key, [min, max, label, tab]] of Object.entries(NUMBER_LIMITS)) {
    const n = Number(form[key]);
    if (form[key] === "" || !Number.isFinite(n) || n < min || n > max) {
      return { tab, text: `${label} must be between ${min} and ${max}.` };
    }
  }
  for (const [idx, row] of form.profileBenefits.entries()) {
    if (!row.title.trim()) return { tab: "benefits", text: `Profile benefit #${idx + 1} needs a title.` };
    const pct = Number(row.minPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { tab: "benefits", text: `Profile benefit "${row.title}" needs a percent between 0 and 100.` };
    }
  }
  return null;
}

function toPayload(form) {
  return {
    videoEnabledUser: form.videoEnabledUser,
    videoEnabledVendor: form.videoEnabledVendor,
    hotDealsEnabled: form.hotDealsEnabled,
    hotDealsLimit: Number(form.hotDealsLimit),
    discountAlertMinPercent: Number(form.discountAlertMinPercent),
    discountAlertCooldownHours: Number(form.discountAlertCooldownHours),
    autoApproveTrustedVendors: form.autoApproveTrustedVendors,
    profileBenefits: form.profileBenefits.map((r) => ({
      minPercent: Number(r.minPercent),
      title: r.title.trim(),
      description: r.description.trim(),
      icon: r.icon.trim() || "star",
      perk: r.perk,
      ...(r.image.trim() ? { image: r.image.trim() } : {}),
    })),
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

function TabIntro({ children }) {
  return (
    <p className="data-table__muted" style={{ margin: "4px 0 16px" }}>
      {children}
    </p>
  );
}

export function FeatureSettingsPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(() => toForm(null));
  const [tab, setTab] = useState(TABS[0].id);

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

  const updateBenefit = (idx, patch) =>
    setForm((p) => ({ ...p, profileBenefits: p.profileBenefits.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  const addBenefit = () =>
    setForm((p) => ({
      ...p,
      profileBenefits: [...p.profileBenefits, { minPercent: "50", title: "", description: "", icon: "star", perk: "", image: "" }],
    }));

  const removeBenefit = (idx) => setForm((p) => ({ ...p, profileBenefits: p.profileBenefits.filter((_, i) => i !== idx) }));

  const onSave = async () => {
    if (!adminToken || missing) return;
    const error = validate(form);
    if (error) {
      setTab(error.tab);
      await Swal.fire({ icon: "error", title: "Validation error", text: error.text });
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
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">App feature controls</h2>
        </div>
        <div className="settings-tabs" role="tablist" aria-label="Feature settings sections">
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

        {tab === "media" ? (
          <div className="settings-tab-panel" role="tabpanel">
            <TabIntro>Switch the video (reels) feature and the Hot Deals home section on or off.</TabIntro>
            <div className="row g-3">
              <ToggleField
                label="Videos in the user app"
                hint="On: the video section and reels show for every user. Off: all video sections, buttons and reels are hidden in the user app."
                checked={form.videoEnabledUser}
                onChange={set("videoEnabledUser")}
              />
              <ToggleField label="Video uploads for vendors" checked={form.videoEnabledVendor} onChange={set("videoEnabledVendor")} />
              <ToggleField label="Hot deals section" checked={form.hotDealsEnabled} onChange={set("hotDealsEnabled")} />
              <NumberField label="Hot deals shown" value={form.hotDealsLimit} onChange={set("hotDealsLimit")} min={1} max={50} />
            </div>
          </div>
        ) : null}

        {tab === "alerts" ? (
          <div className="settings-tab-panel" role="tabpanel">
            <TabIntro>Discount alerts for wishlist/cart users, and approval of vendor listings.</TabIntro>
            <div className="row g-3">
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
          </div>
        ) : null}

        {tab === "benefits" ? (
          <div className="settings-tab-panel" role="tabpanel">
            <TabIntro>
              Profile completion milestones shown to vendors. The perk decides what they unlock at that percentage.
            </TabIntro>
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
          </div>
        ) : null}

        <div className="user-form__actions">
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
