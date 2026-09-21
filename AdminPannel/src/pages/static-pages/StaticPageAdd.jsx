import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import { Bold, ClassicEditor, Essentials, Heading, Italic, Link as LinkPlugin, List, Paragraph, Undo } from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import { createPage } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";

const APP_OPTIONS = [
  { value: "user", label: "User App" },
  { value: "vendor", label: "Vendor App" },
  { value: "venue_vendor", label: "Service Vendor App" },
  { value: "delivery", label: "Delivery Partner App" },
];

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyTitle(title) {
  return String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function StaticPageAdd() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState({
    app: "user",
    title: "",
    slug: "",
    content: "",
    status: "active",
  });

  const contentTextLen = useMemo(() => stripHtml(form.content).length, [form.content]);

  const onTitleChange = (title) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugTouched ? prev.slug : slugifyTitle(title),
    }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const title = String(form.title ?? "").trim();
    const slug = String(form.slug ?? "").trim() || slugifyTitle(title);
    const content = String(form.content ?? "").trim();
    const status = form.status === "inactive" ? "inactive" : "active";

    if (title.length < 3) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Title must be at least 3 characters." });
      return;
    }
    if (!slug) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Slug is required." });
      return;
    }
    if (!stripHtml(content)) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Content is required." });
      return;
    }

    setSaving(true);
    try {
      await createPage(adminToken, { app: form.app, title, slug, content, status });
      await Swal.fire({ icon: "success", title: "Page created", timer: 1500 });
      navigate("/admin/static-pages");
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Create failed",
        text: error?.message || "Could not create the page.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Add Static Page</h2>
        </div>
        <form onSubmit={onSave}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">App</span>
              <select
                className="user-field__input"
                value={form.app}
                onChange={(e) => setForm((p) => ({ ...p, app: e.target.value }))}
              >
                {APP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="user-field col-12 col-md-8">
              <span className="user-field__label">Title</span>
              <input
                className="user-field__input"
                value={form.title}
                onChange={(e) => onTitleChange(e.target.value)}
                required
                minLength={3}
              />
            </label>

            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Slug</span>
              <input
                className="user-field__input"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((p) => ({ ...p, slug: slugifyTitle(e.target.value) }));
                }}
                required
              />
            </label>

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

            <div className="user-field col-12 page-form__content-field">
              <span className="user-field__label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  Content <span className="required-dot">*</span>
                </span>
                <small>{contentTextLen} chars</small>
              </span>
              <div className="static-page-form__editor-wrap">
                <div className={`static-page-ckeditor${saving ? " static-page-ckeditor--disabled" : ""}`}>
                  <CKEditor
                    editor={ClassicEditor}
                    config={{
                      licenseKey: "GPL",
                      plugins: [Essentials, Paragraph, Heading, Bold, Italic, LinkPlugin, List, Undo],
                      toolbar: [
                        "undo",
                        "redo",
                        "|",
                        "heading",
                        "|",
                        "bold",
                        "italic",
                        "link",
                        "|",
                        "bulletedList",
                        "numberedList",
                      ],
                    }}
                    data={form.content}
                    disabled={saving}
                    onChange={(_, editor) => {
                      setForm((p) => ({ ...p, content: editor.getData() }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="user-form__actions">
            <Link to="/admin/static-pages" className="btn btn--ghost">
              Cancel
            </Link>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Creating..." : "Create Page"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
