import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import { IoEyeSharp } from "react-icons/io5";
import { adminDeleteAmenity, adminListAmenities, adminUpdateAmenity } from "../../api/adminAmenities.js";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const LIST_LIMIT = 10;

export function AmenitiesList() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const admin = useSelector((s) => s.auth.admin);
  const adminId = admin?._id || admin?.id || "";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [togglingId, setTogglingId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const loadRows = useCallback(async () => {
    if (!adminToken || !adminId) return;
    setLoading(true);
    try {
      const { amenities, pagination } = await adminListAmenities(adminToken, {
        page,
        limit: LIST_LIMIT,
        role: "Admin",
        addedById: adminId,
        search: debouncedSearch || undefined,
      });
      setRows(amenities);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: error.message || "Failed to load amenities." });
    } finally {
      setLoading(false);
    }
  }, [adminId, adminToken, debouncedSearch, dispatch, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const onDelete = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete amenity?",
      text: `This will delete "${row.name}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed) return;
    try {
      await adminDeleteAmenity(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Amenity deleted", timer: 1500 });
      await loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: error.message || "Could not delete amenity." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdateAmenity(adminToken, row._id, { status: nextStatus });
      await Swal.fire({ icon: "success", title: "Amenity status updated", timer: 1200 });
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
            <h2 className="page-card__title">Amenities</h2>
            <p className="page-card__desc">Manage amenities for service listings.</p>
          </div>
          <div className="page-card__actions">
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search amenity..."
              aria-label="Search amenities"
            />
            <Link to="/admin/amenities/new" className="btn btn--accent">
              Add Amenity
            </Link>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Name</th>
                <th>Icon</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>
                    <p className="table-placeholder">Loading amenities...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="table-placeholder">No amenities found.</p>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} to={`/admin/amenities/${row._id}`}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>{row.name || "—"}</td>
                    <td>
                      {row.icon ? (
                        <img src={mediaUrl(row.icon)} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8 }} />
                      ) : (
                        "—"
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
                        <Link to={`/admin/amenities/${row._id}`} className="icon-btn icon-btn--view" title="View">
                          <IoEyeSharp size={18} />
                        </Link>
                        <Link to={`/admin/amenities/${row._id}/edit`} className="icon-btn icon-btn--edit" title="Edit">
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
