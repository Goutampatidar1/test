import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { IoEyeSharp } from "react-icons/io5";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import { adminDeleteVendor, adminListVendors, adminUpdateVendor } from "../../api/adminVendors.js";
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

export function VendorList() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [vendors, setVendors] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [approvalStatus, setApprovalStatus] = useState(() => searchParams.get("approvalStatus") || "");
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [loadError, setLoadError] = useState("");
  const [togglingVendorId, setTogglingVendorId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadVendors = useCallback(async () => {
    if (!adminToken) return;
    setLoadError("");
    try {
      const { vendors: rows, pagination: pg } = await adminListVendors(adminToken, {
        page,
        limit,
        search: debouncedSearch || undefined,
        status: status || undefined,
        approvalStatus: approvalStatus || undefined,
      });
      setVendors(rows);
      setTotal(pg.total ?? 0);
      setPages(pg.pages ?? 1);
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      setLoadError(e.message || "Failed to load vendors.");
    }
  }, [adminToken, approvalStatus, debouncedSearch, dispatch, page, status]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  const handleDelete = async (v) => {
    const { isConfirmed } = await Swal.fire({
      title: "Delete vendor?",
      html: `This will remove <strong>${v.businessName || v.name}</strong> permanently.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteVendor(adminToken, v._id);
      await Swal.fire({ icon: "success", title: "Vendor deleted", timer: 1500 });
      loadVendors();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete vendor." });
    }
  };

  const handleToggleStatus = async (v) => {
    if (!adminToken) return;
    try {
      setTogglingVendorId(v._id);
      await adminUpdateVendor(adminToken, v._id, {
        status: v.status === "active" ? "inactive" : "active",
        });
      await Swal.fire({ icon: "success", title: v.status === "active" ? "Vendor deactivated" : "Vendor activated", timer: 1500 });
      loadVendors();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: e.message || "Could not update vendor." });
    } finally {
      setTogglingVendorId("");
    }
  };

  return (
    <div className="page-card">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">Vendor Management</h2>
        </div>
        <div className="page-card__actions">
          <AdminSearchField
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search shop or vendor..."
            aria-label="Search vendors"
          />
          <select className="user-list-status-select" value={approvalStatus} onChange={(e) => { setApprovalStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Link to="new" className="btn btn--accent">
            + Add Vendor
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
              <th>Gst Number</th>
              <th>Approval Status</th>
              <th>Status</th>
              <th className="data-table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan={8}><p className="table-placeholder">No vendors found.</p></td></tr>
            ) : vendors.map((v, idx) => (
              <ClickableTableRow key={v._id} to={v._id}>
                <td>{(page - 1) * limit + idx + 1}</td>
                <td>
                  <div className="user-cell">
                    <span className="user-cell__avatar">
                      {mediaUrl(v.profileImage) ? (
                        <img src={mediaUrl(v.profileImage)} alt="" className="user-cell__avatar-img" width={40} height={40} />
                      ) : (
                        <ProfileImagePlaceholder size={20} />
                      )}
                    </span>
                    <div>
                      <div className="user-cell__name">{v.name || "—"}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="user-cell__muted">{v.email || "—"}</div>
                  <div className="user-cell__muted">{v.phone || "—"}</div>
                </td>
                <td>
                  <div className="data-table__strong">{v.businessName || "—"}</div>
                  <div className="user-cell__muted">{v.businessPhone || "—"}</div>
                </td>
                <td>
                  <div className="user-cell__muted">{v.gstin || "—"}</div>
                </td>
                {/* <td className="user-cell__muted">{v.bankName || "—"}</td> */}
                <td>
                  <StatusBadge status={v.approvalStatus} />
                </td>
                <td>
                  <button type="button" className={`settings-switch${v.status === "active" ? " settings-switch--on" : ""}`} role="switch" aria-checked={v.status === "active"} aria-label={`Toggle status for ${v.name || v.email}`} onClick={() => handleToggleStatus(v)} disabled={togglingVendorId === v._id}>
                    <span className="settings-switch__knob" aria-hidden />
                  </button>
                </td>
                <td>
                  <div className="row-actions">
                    <Link to={v._id} className="icon-btn icon-btn--view" title="View">
                      <IoEyeSharp size={18} />
                    </Link>
                    <Link to={`${v._id}/edit`} className="icon-btn icon-btn--edit" title="Edit">
                      <MdEditSquare size={18} />
                    </Link>
                    <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={() => handleDelete(v)}>
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
