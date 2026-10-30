import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { getFeatureSettings, patchFeatureSettings } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";

const TABS = [
  { id: "media", label: "Videos & hot deals" },
  { id: "alerts", label: "Alerts & approval" },
];

function toForm(fs) {
  const s = fs || {};
  return {
    videoEnabledUser: s.videoEnabledUser !== false,
    videoEnabledVendor: s.videoEnabledVendor !== false,
    hotDealsEnabled: s.hotDealsEnabled !== false,
    // Kept in form/payload so Save does not wipe existing backend values (UI hidden).
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

function toPayload(form) {
  return {
    videoEnabledUser: form.videoEnabledUser,
    videoEnabledVendor: form.videoEnabledVendor,
    hotDealsEnabled: form.hotDealsEnabled,
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

  const onSave = async () => {
    if (!adminToken || missing) return;
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
            </div>
          </div>
        ) : null}

        {tab === "alerts" ? (
          <div className="settings-tab-panel" role="tabpanel">
            <TabIntro>Approval of vendor listings.</TabIntro>
            <div className="row g-3">
              <ToggleField
                label="Auto-approve listings from approved vendors"
                hint="When approval is on, approved vendors' new services go live immediately. Products never need approval."
                checked={form.autoApproveTrustedVendors}
                onChange={set("autoApproveTrustedVendors")}
              />
            </div>
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
