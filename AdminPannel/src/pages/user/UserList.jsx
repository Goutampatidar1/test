import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { IoEyeSharp } from "react-icons/io5";
import { MdEditSquare } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import { adminDeleteUser, adminListUsers, adminUpdateUser } from "../../api/adminUsers.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";

function formatJoined(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function csvEscape(value) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function UserList() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loadError, setLoadError] = useState("");
  const [togglingUserId, setTogglingUserId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadUsers = useCallback(async () => {
    if (!adminToken) return;
    setLoadError("");
    try {
      const { users: rows, pagination: pg } = await adminListUsers(adminToken, {
        page,
        limit,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      });
      setUsers(rows);
      setTotal(pg.total ?? 0);
      setPages(pg.pages ?? 1);
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      setLoadError(e.message || "Failed to load users.");
    }
  }, [adminToken, debouncedSearch, dispatch, limit, page, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setDebouncedSearch(searchInput.trim());
    setPage(1);
  };

  const handleDelete = async (u) => {
    const { isConfirmed } = await Swal.fire({
      title: "Delete user?",
      html: `This will remove <strong>${u.name || u.email}</strong> permanently.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminDeleteUser(adminToken, u._id);
      await Swal.fire({ icon: "success", title: "User deleted", timer: 1500 });
      loadUsers();
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete user." });
    }
  };

  const handleToggleStatus = async (u) => {
    if (!adminToken) return;
    const nextStatus = u.status === "active" ? "inactive" : "active";
    setTogglingUserId(u._id);
    try {
      await adminUpdateUser(adminToken, u._id, { status: nextStatus });
      await Swal.fire({
        icon: "success",
        title: nextStatus === "active" ? "User activated" : "User deactivated",
        timer: 1500,
      });
      loadUsers();
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      await Swal.fire({ icon: "error", title: "Toggle failed", text: e.message || "Could not toggle user status." });
    } finally {
      setTogglingUserId("");
    }
  };

  const handleExportCsv = async () => {
    if (users.length === 0) {
      await Swal.fire({ icon: "info", title: "No data to export", text: "There are no users in the current list." });
      return;
    }

    const headers = ["Name", "Email", "Phone", "Status", "Created At", "Updated At", "User ID"];
    const rows = users.map((u) => [
      u.name || "",
      u.email || "",
      u.phone || "",
      u.status || "",
      u.createdAt || "",
      u.updatedAt || "",
      u._id || "",
    ]);

    const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `users-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-card">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">User management</h2>
        </div>
        <div className="page-card__actions user-list-toolbar">
          <form className="user-list-filters" onSubmit={onSearchSubmit}>
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, mobile.."
              aria-label="Search users"
            />
            <select
              className="user-list-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              {/* <option value="blocked">Blocked</option> */}
            </select>
          </form>
          <button type="button" className="btn btn--ghost" onClick={handleExportCsv}>
            Export CSV
          </button>
          <Link to="new" className="btn btn--accent">
            + Add user
          </Link>
        </div>
      </div>

      {loadError ? (
        <p className="user-list-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>S No.</th>
              <th>User Info</th>
              <th>Contact Details</th>
              <th>Created At</th>
              <th>Status</th>
              <th className="data-table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="table-placeholder">No users match your filters.</p>
                </td>
              </tr>
            ) : (
              users.map((u, idx) => {
                const avatar = mediaUrl(u?.profileImage);
                const serialNo = (page - 1) * limit + idx + 1;
                return (
                  <ClickableTableRow key={u._id} to={u._id}>
                    <td className="data-table__muted">{serialNo}</td>
                    <td>
                      <div className="user-cell">
                        <span className="user-cell__avatar" aria-hidden="true">
                          {avatar ? (
                            <img src={avatar} alt="" className="user-cell__avatar-img" width={40} height={40} />
                          ) : (
                            <ProfileImagePlaceholder size={20} />
                          )}
                        </span>
                        <div>
                          <div className="user-cell__name">{u.name || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="user-cell__muted">{u.email}</div>
                      <div className="user-cell__muted">{u.phone || "—"}</div>
                    </td>
                    <td className="data-table__muted">{formatJoined(u.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${u.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={u.status === "active"}
                        aria-label={`Toggle status for ${u.name || u.email}`}
                        onClick={() => handleToggleStatus(u)}
                        disabled={togglingUserId === u._id}
                        title={u.status === "active" ? "Deactivate user" : "Activate user"}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={u._id} className="icon-btn icon-btn--view" title="View">
                          <IoEyeSharp size={18} />
                        </Link>
                        <Link to={`${u._id}/edit`} className="icon-btn icon-btn--edit" title="Edit">
                          <MdEditSquare size={18} />
                        </Link>
                        {/* <button type="button" className="icon-btn icon-btn--block" title="Block" onClick={() => handleBlock(u)}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="m4.9 4.9 14.2 14.2" />
                          </svg>
                        </button> */}
                        <button type="button" className="icon-btn icon-btn--delete" title="Delete" onClick={() => handleDelete(u)}>
                          <AiFillDelete size={18} />
                        </button>
                      </div>
                    </td>
                  </ClickableTableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
    </div>
  );
}
