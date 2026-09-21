import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { IoEyeSharp } from "react-icons/io5";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import {
  adminDeleteVenueVendor,
  adminListVenueVendors,
  adminUpdateVenueVendor,
} from "../../api/adminVenueVendors.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";

function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();
  const cls = s === "approved" ? "vendor-approved" : s === "pending" ? "vendor-pending" : "vendor-suspended";
  return <span className={`pill pill--${cls}`}>{status || "—"}</span>;
}

export function VenueVendorList() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [approvalStatus, setApprovalStatus] = useState(() => searchParams.get("approvalStatus") || "");
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [loadError, setLoadError] = useState("");
  const [togglingId, setTogglingId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadData = useCallback(async () => {
    if (!adminToken) return;
    setLoadError("");
    try {
      const { venueVendors, pagination } = await adminListVenueVendors(adminToken, {
        page,
        limit,
        search: debouncedSearch || undefined,
        status: status || undefined,
        approvalStatus: approvalStatus || undefined,
      });
      setRows(venueVendors);
      setTotal(pagination.total ?? 0);
      setPages(pagination.pages ?? 1);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      setLoadError(e.message || "Failed to load service vendors.");
    }
  }, [adminToken, approvalStatus, debouncedSearch, dispatch, page, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (row) => {
    const { isConfirmed } = await Swal.fire({
      title: "Delete service vendor?",
      html: `This will remove <strong>${row.businessName || row.name}</strong> permanently.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteVenueVendor(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Service vendor deleted", timer: 1500 });
      loadData();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete service vendor." });
    }
  };

  const handleToggleStatus = async (row) => {
    if (!adminToken) return;
    try {
      setTogglingId(row._id);
      await adminUpdateVenueVendor(adminToken, row._id, {
        status: row.status === "active" ? "inactive" : "active",
      });
      await Swal.fire({
        icon: "success",
        title: row.status === "active" ? "Service vendor deactivated" : "Service vendor activated",
        timer: 1500,
      });
      loadData();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: e.message || "Could not update status." });
    } finally {
      setTogglingId("");
    }
  };

  return (
    <div className="page-card">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">Service Vendor Management</h2>
        </div>
        <div className="page-card__actions">
          <AdminSearchField
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search service vendor..."
            aria-label="Search service vendors"
          />
          <select className="user-list-status-select" value={approvalStatus} onChange={(e) => { setApprovalStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Link to="new" className="btn btn--accent">
            + Add Service Vendor
          </Link>
        </div>
      </div>

      {loadError ? <p className="user-list-error">{loadError}</p> : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>S No.</th>
              <th>Vendor Info</th>
              <th>Contact Info</th>
              <th>Business Details</th>
              <th>PAN / GST</th>
              <th>Approval Status</th>
              <th>Status</th>
              <th className="data-table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8}><p className="table-placeholder">No service vendors found.</p></td></tr>
            ) : rows.map((row, idx) => (
              <ClickableTableRow key={row._id} to={row._id}>
                <td>{(page - 1) * limit + idx + 1}</td>
                <td>
                  <div className="user-cell">
                    <span className="user-cell__avatar">
                      {mediaUrl(row.profileImage) ? (
                        <img src={mediaUrl(row.profileImage)} alt="" className="user-cell__avatar-img" width={40} height={40} />
                      ) : (
                        <ProfileImagePlaceholder size={20} />
                      )}
                    </span>
                    <div>
                      <div className="user-cell__name">{row.name || "—"}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="user-cell__muted">{row.email || "—"}</div>
                  <div className="user-cell__muted">{row.phone || "—"}</div>
                </td>
                <td>
                  <div className="data-table__strong">{row.businessName || "—"}</div>
                  <div className="user-cell__muted">{row.businessPhone || "—"}</div>
                </td>
                <td>
                  <div className="user-cell__muted">{row.panNumber || "—"}</div>
                  <div className="user-cell__muted">{row.gstNumber || "—"}</div>
                </td>
                <td><StatusBadge status={row.approvalStatus} /></td>
                <td>
                  <button type="button" className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`} role="switch" aria-checked={row.status === "active"} aria-label={`Toggle status for ${row.name || row.email}`} onClick={() => handleToggleStatus(row)} disabled={togglingId === row._id}>
                    <span className="settings-switch__knob" aria-hidden />
                  </button>
                </td>
                <td>
                  <div className="row-actions">
                    <Link to={row._id} className="icon-btn icon-btn--view" title="View">
                      <IoEyeSharp size={18} />
                    </Link>
                    <Link to={`${row._id}/edit`} className="icon-btn icon-btn--edit" title="Edit">
                      <MdEditSquare size={18} />
                    </Link>
                    <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={() => handleDelete(row)}>
                      <AiFillDelete size={18} />
                    </button>
                  </div>
                </td>
              </ClickableTableRow>
            ))}
          </tbody>
        </table>
      </div>
      <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
    </div>
  );
}
