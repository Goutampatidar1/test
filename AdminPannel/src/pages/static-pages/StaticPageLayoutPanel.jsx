import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import { Bold, ClassicEditor, Essentials, Heading, Italic, Link as LinkPlugin, List, Paragraph, Undo } from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import { getStaticPageLayout, updateStaticPageLayout } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";

const APP_OPTIONS = [
  { value: "user", label: "User App" },
  { value: "vendor", label: "Vendor App" },
  { value: "venue_vendor", label: "Service Vendor App" },
  { value: "delivery", label: "Delivery Partner App" },
];

const EDITOR_CONFIG = {
  licenseKey: "GPL",
  plugins: [Essentials, Paragraph, Heading, Bold, Italic, LinkPlugin, List, Undo],
  toolbar: ["undo", "redo", "|", "heading", "|", "bold", "italic", "link", "|", "bulletedList", "numberedList"],
};

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function StaticPageLayoutPanel() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [app, setApp] = useState("user");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    headerContent: "",
    footerContent: "",
    status: "active",
  });

  const loadLayout = useCallback(async () => {
    if (!adminToken || !app) return;
    setLoading(true);
    try {
      const layout = await getStaticPageLayout(adminToken, app);
      setForm({
        headerContent: layout?.headerContent || "",
        footerContent: layout?.footerContent || "",
        status: layout?.status === "inactive" ? "inactive" : "active",
      });
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: error?.message || "Could not load static page layout.",
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, app, dispatch]);

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);

  const headerLen = useMemo(() => stripHtml(form.headerContent).length, [form.headerContent]);
  const footerLen = useMemo(() => stripHtml(form.footerContent).length, [form.footerContent]);

  const onSave = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    setSaving(true);
    try {
      await updateStaticPageLayout(adminToken, app, {
        headerContent: form.headerContent,
        footerContent: form.footerContent,
        status: form.status,
      });
      await Swal.fire({
        icon: "success",
        title: "Layout saved",
        text: "Header and footer updated for this app.",
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Save failed",
        text: error?.message || "Could not save static page layout.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-card static-page-layout-card">
      <div className="page-card__head page-card__head--split">
        <div>
          <h2 className="page-card__title">Header &amp; Footer</h2>
          <p className="page-card__subtitle">
            Customize the header and footer shown on all static pages per app. Leave empty to use the default design.
          </p>
        </div>
      </div>

      <form onSubmit={onSave} className="static-page-layout-form">
        <div className="static-page-layout-form__toolbar row g-3">
          <label className="user-field col-12 col-md-4">
            <span className="user-field__label">App</span>
            <select
              className="user-field__input"
              value={app}
              onChange={(e) => setApp(e.target.value)}
              disabled={loading || saving}
            >
              {APP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="user-field col-12 col-md-4">
            <span className="user-field__label">Layout status</span>
            <select
              className="user-field__input"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              disabled={loading || saving}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive (use default)</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="static-cms-loading">Loading layout...</div>
        ) : (
          <div className="row g-3">
            <div className="user-field col-12 page-form__content-field">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Header content</span>
                <small>{headerLen} chars</small>
              </span>
              <div className="static-page-form__editor-wrap">
                <div className={`static-page-ckeditor${saving ? " static-page-ckeditor--disabled" : ""}`}>
                  <CKEditor
                    editor={ClassicEditor}
                    config={EDITOR_CONFIG}
                    data={form.headerContent}
                    disabled={saving}
                    onChange={(_, editor) => {
                      setForm((prev) => ({ ...prev, headerContent: editor.getData() }));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="user-field col-12 page-form__content-field">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Footer content</span>
                <small>{footerLen} chars</small>
              </span>
              <div className="static-page-form__editor-wrap">
                <div className={`static-page-ckeditor${saving ? " static-page-ckeditor--disabled" : ""}`}>
                  <CKEditor
                    editor={ClassicEditor}
                    config={EDITOR_CONFIG}
                    data={form.footerContent}
                    disabled={saving}
                    onChange={(_, editor) => {
                      setForm((prev) => ({ ...prev, footerContent: editor.getData() }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="user-form__actions">
          <button type="submit" className="btn btn--primary" disabled={loading || saving}>
            {saving ? "Saving..." : "Save Header & Footer"}
          </button>
        </div>
      </form>
    </div>
  );
}
