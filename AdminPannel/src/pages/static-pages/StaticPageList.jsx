import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete, AiOutlineLink } from "react-icons/ai";
import { deletePage, listPages } from "../../api/adminMisc.js";
import { logout } from "../../store/authSlice.js";
import { StaticPageLayoutPanel } from "./StaticPageLayoutPanel.jsx";

const APP_OPTIONS = [
  { value: "", label: "All apps" },
  { value: "user", label: "User App" },
  { value: "vendor", label: "Vendor App" },
  { value: "venue_vendor", label: "Service Vendor App" },
  { value: "delivery", label: "Delivery Partner App" },
];

const APP_LABELS = {
  user: "User App",
  vendor: "Vendor App",
  venue_vendor: "Service Vendor App",
  delivery: "Delivery Partner App",
};

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function StaticPageList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [appFilter, setAppFilter] = useState("");

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const pages = await listPages(adminToken, appFilter ? { app: appFilter } : {});
      setRows(Array.isArray(pages) ? pages : []);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: error?.message || "Could not load static pages.",
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, appFilter, dispatch]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const groupedCounts = useMemo(() => {
    const counts = { user: 0, vendor: 0, venue_vendor: 0, delivery: 0 };
    for (const row of rows) {
      if (counts[row.app] !== undefined) counts[row.app] += 1;
    }
    return counts;
  }, [rows]);

  const onDelete = async (row) => {
    const confirm = await Swal.fire({
      icon: "warning",
      title: "Delete page?",
      text: `"${row.title}" will be removed permanently.`,
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirm.isConfirmed) return;

    try {
      await deletePage(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Deleted", timer: 1200, showConfirmButton: false });
      loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Delete failed",
        text: error?.message || "Could not delete page.",
      });
    }
  };

  const onCopyUrl = async (url) => {
    if (!url) return;
    const ok = await copyText(url);
    await Swal.fire({
      icon: ok ? "success" : "info",
      title: ok ? "URL copied" : "Copy URL",
      text: ok ? "App page URL copied to clipboard." : url,
      timer: ok ? 1400 : undefined,
      showConfirmButton: !ok,
    });
  };

  return (
    <div className="user-page">
      <StaticPageLayoutPanel />

      <div className="page-card">
        <div className="page-card__head page-card__head--split">
          <div>
            <h2 className="page-card__title">Static Pages</h2>
            <p className="page-card__subtitle">
              CMS pages for User, Vendor, Service Vendor, and Delivery Partner apps. Use the App URL in mobile WebView.
            </p>
          </div>
          <Link to="/admin/static-pages/new" className="btn btn--accent">
            Add Page
          </Link>
        </div>

        <div className="static-page-filters">
          <select
            className="user-list-status-select static-page-filters__select"
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            aria-label="Filter by app"
          >
            {APP_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="static-page-filters__counts">
            <span>User: {groupedCounts.user}</span>
            <span>Vendor: {groupedCounts.vendor}</span>
            <span>Service Vendor: {groupedCounts.venue_vendor}</span>
            <span>Delivery Partner: {groupedCounts.delivery}</span>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>App</th>
                <th>Title</th>
                <th>Slug</th>
                <th>App URL</th>
                <th>Status</th>
                <th>Updated</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No static pages found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{idx + 1}</td>
                    <td>{APP_LABELS[row.app] || row.app || "—"}</td>
                    <td>{row.title || "—"}</td>
                    <td>{row.slug || "—"}</td>
                    <td>
                      {row.viewUrl ? (
                        <div className="static-page-url-cell">
                          <a href={row.viewUrl} target="_blank" rel="noreferrer" className="static-page-url-cell__link">
                            Open
                          </a>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Copy app URL"
                            onClick={() => onCopyUrl(row.viewUrl)}
                          >
                            <AiOutlineLink size={18} />
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.status || "—"}</td>
                    <td className="data-table__muted">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn--edit"
                          title="Edit"
                          onClick={() => navigate(`/admin/static-pages/${row._id}/edit`)}
                        >
                          <MdEditSquare size={18} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          title="Delete"
                          onClick={() => onDelete(row)}
                        >
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
    </div>
  );
}
