import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import { Bold, ClassicEditor, Essentials, Heading, Italic, Link as LinkPlugin, List, Paragraph, Undo } from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import { getPageById, updatePage } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";

const APP_LABELS = {
  user: "User App",
  vendor: "Vendor App",
  venue_vendor: "Service Vendor App",
  delivery: "Delivery Partner App",
};

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function StaticPageUpdate() {
  const { pageId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [urls, setUrls] = useState({ viewUrl: "", apiUrl: "" });
  const [form, setForm] = useState({
    app: "user",
    title: "",
    slug: "",
    content: "",
    status: "active",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!adminToken || !pageId) return;
      setLoading(true);
      try {
        const page = await getPageById(adminToken, pageId);
        if (cancelled) return;
        setForm({
          app: page?.app || "user",
          title: page?.title || "",
          slug: page?.slug || "",
          content: page?.content || "",
          status: page?.status || "active",
        });
        setUrls({
          viewUrl: page?.viewUrl || "",
          apiUrl: page?.apiUrl || "",
        });
      } catch (error) {
        if (error?.status === 401) {
          dispatch(logout());
          return;
        }
        await Swal.fire({
          icon: "error",
          title: "Load failed",
          text: error?.message || "Could not load page details.",
        });
        navigate("/admin/static-pages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, navigate, pageId]);

  const contentTextLen = useMemo(() => stripHtml(form.content).length, [form.content]);

  const onSave = async (e) => {
    e.preventDefault();
    if (!adminToken || !pageId) return;

    const title = String(form.title ?? "").trim();
    const content = String(form.content ?? "").trim();
    const contentText = stripHtml(content);
    const status = form.status === "inactive" ? "inactive" : "active";

    if (title.length < 3) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Title must be at least 3 characters." });
      return;
    }
    if (!contentText) {
      await Swal.fire({ icon: "error", title: "Validation error", text: "Content is required." });
      return;
    }

    setSaving(true);
    try {
      const body = await updatePage(adminToken, pageId, { title, content, status });
      const page = body?.data;
      if (page?.viewUrl || page?.apiUrl) {
        setUrls({
          viewUrl: page.viewUrl || urls.viewUrl,
          apiUrl: page.apiUrl || urls.apiUrl,
        });
      }
      await Swal.fire({
        icon: "success",
        title: "Page updated",
        timer: 1500,
      });
      navigate("/admin/static-pages");
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Update failed",
        text: error?.message || "Could not update the page.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="user-page">
        <div className="page-card">
          <div className="static-cms-loading">Loading page...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Update Static Page</h2>
        </div>
        <form onSubmit={onSave}>
          <div className="row g-3">
            <label className="user-field col-12 col-md-4">
              <span className="user-field__label">App (read only)</span>
              <input className="user-field__input" value={APP_LABELS[form.app] || form.app} readOnly />
            </label>

            <label className="user-field col-12 col-md-8">
              <span className="user-field__label">Title</span>
              <input
                className="user-field__input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                required
                minLength={3}
              />
            </label>

            <label className="user-field col-12 col-md-6">
              <span className="user-field__label">Slug (read only)</span>
              <input className="user-field__input" value={form.slug} readOnly />
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

            <div className="col-12 static-page-urls">
              <div className="static-page-urls__item">
                <span className="user-field__label">App WebView URL</span>
                {urls.viewUrl ? (
                  <a href={urls.viewUrl} target="_blank" rel="noreferrer">
                    {urls.viewUrl}
                  </a>
                ) : (
                  <span className="data-table__muted">—</span>
                )}
              </div>
              <div className="static-page-urls__item">
                <span className="user-field__label">API URL</span>
                {urls.apiUrl ? (
                  <code className="static-page-urls__code">{urls.apiUrl}</code>
                ) : (
                  <span className="data-table__muted">—</span>
                )}
              </div>
            </div>

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
              {saving ? "Updating..." : "Update Page"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
