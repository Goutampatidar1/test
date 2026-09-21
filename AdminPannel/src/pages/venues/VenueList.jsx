import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import { IoEyeSharp } from "react-icons/io5";
import { adminDeleteVenue, adminListVenues, adminUpdateVenue } from "../../api/adminVenues.js";
import { AppImage } from "../../components/AppImage.jsx";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const LIST_LIMIT = 10;

export function VenueList() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [togglingId, setTogglingId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { venues, pagination } = await adminListVenues(adminToken, {
        page,
        limit: LIST_LIMIT,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
      });
      setRows(venues);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: error.message || "Failed to load services." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, debouncedSearch, dispatch, page, statusFilter]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const onDelete = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete service?",
      text: `This will delete "${row.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed) return;
    try {
      await adminDeleteVenue(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Service deleted", timer: 1500 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: error.message || "Could not delete service." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateVenue(adminToken, row._id, { status: nextStatus });
      await Swal.fire({ icon: "success", title: "Service status updated", timer: 1200 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Status update failed", text: error.message || "Could not update status." });
    } finally {
      setTogglingId("");
    }
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <div>
            <h2 className="page-card__title">Services</h2>
            <p className="page-card__desc">Manage your service listings and visibility.</p>
          </div>
          <div className="page-card__actions">
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search service..."
              aria-label="Search services"
            />
            <select className="user-list-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Name</th>
                <th>Category</th>
                <th>Sub-Category</th>
                <th>City</th>
                <th>Source</th>
                <th>Approval</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <p className="table-placeholder">Loading services...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <p className="table-placeholder">No services found.</p>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} to={`/admin/venues/${row._id}`}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>
                      <div className="user-cell">
                        <div className="user-cell__avatar">
                          <AppImage
                            src={row.thumbnail}
                            alt={row.name || "Service"}
                            className="user-cell__avatar-img"
                          />
                        </div>
                        <div>
                          <div className="user-cell__name">{row.name || "—"}</div>
                          <div className="user-cell__id">{row.address || "No address"}</div>
                        </div>
                      </div>
                    </td>
                    <td>{row.category?.name || "—"}</td>
                    <td>{row.subCategory?.name || "—"}</td>
                    <td>{row.city || "—"}</td>
                    <td>{row.role === "VenueVendor" ? "Service vendor" : row.role || "Admin"}</td>
                    <td>
                      {row.adminApproved ? (
                        <span className="badge text-bg-success">Approved</span>
                      ) : (
                        <span className="badge text-bg-warning">Pending</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/admin/venues/${row._id}`} className="icon-btn icon-btn--view" title="View">
                          <IoEyeSharp size={18} />
                        </Link>
                        <Link to={`/admin/venues/${row._id}/edit`} className="icon-btn icon-btn--edit" title="Edit">
                          <MdEditSquare size={18} />
                        </Link>
                        <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={() => onDelete(row)}>
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </ClickableTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
