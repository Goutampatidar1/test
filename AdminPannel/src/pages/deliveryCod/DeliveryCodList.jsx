import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { IoEyeSharp } from "react-icons/io5";
import { adminListDriversCod } from "../../api/adminDeliveryCod.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";

function formatInr(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function DeliveryCodList() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [error, setError] = useState("");
  const limit = 10;

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setError("");
    try {
      const { rows: items, pagination } = await adminListDriversCod(adminToken, {
        page,
        limit,
        search: search.trim() || undefined,
        onlyPending,
      });
      setRows(items);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      setError(e.message || "Failed to load driver COD balances.");
    }
  }, [adminToken, dispatch, onlyPending, page, search]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const totalPending = rows.reduce((sum, row) => sum + (Number(row.codPendingBalance) || 0), 0);

  return (
    <div className="page-card">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">Driver COD Collection</h2>
          <p className="page-card__subtitle">
            Track cash collected from COD deliveries and settle amounts handed over by drivers.
          </p>
        </div>
        <div className="page-card__actions">
          <AdminSearchField
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search driver name, email, phone..."
            aria-label="Search drivers"
          />
          <select
            className="user-list-status-select"
            value={onlyPending ? "pending" : "all"}
            onChange={(e) => {
              setOnlyPending(e.target.value === "pending");
              setPage(1);
            }}
          >
            <option value="pending">Pending balance only</option>
            <option value="all">All drivers</option>
          </select>
        </div>
      </div>

      {error ? <p className="user-list-error">{error}</p> : null}

      <div className="driver-cod-stats driver-cod-stats--list">
        <div className="stat-card stat-card--orange">
          <div className="stat-card__meta">
            <div className="stat-card__label">Drivers on this page</div>
            <div className="stat-card__value">{rows.length}</div>
          </div>
          <div className="stat-card__icon" aria-hidden="true" />
        </div>
        <div className="stat-card stat-card--yellow">
          <div className="stat-card__meta">
            <div className="stat-card__label">Pending on this page</div>
            <div className="stat-card__value">{formatInr(totalPending)}</div>
          </div>
          <div className="stat-card__icon" aria-hidden="true" />
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>S No.</th>
              <th>Driver</th>
              <th>Contact</th>
              <th>Pending COD</th>
              <th>Wallet earnings</th>
              <th>Status</th>
              <th className="data-table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <p className="table-placeholder">No drivers found for the selected filter.</p>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <ClickableTableRow key={row._id} to={row._id}>
                  <td>{(page - 1) * limit + idx + 1}</td>
                  <td>
                    <div className="user-cell">
                      <span className="user-cell__avatar">
                        {mediaUrl(row.profileImage) ? (
                          <img
                            src={mediaUrl(row.profileImage)}
                            alt=""
                            className="user-cell__avatar-img"
                            width={40}
                            height={40}
                          />
                        ) : (
                          <ProfileImagePlaceholder size={20} />
                        )}
                      </span>
                      <div>
                        <div className="user-cell__name">{row.name || "—"}</div>
                        <div className="user-cell__muted">{row.approvalStatus || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="user-cell__muted">{row.email || "—"}</div>
                    <div className="user-cell__muted">{row.phone || "—"}</div>
                  </td>
                  <td>
                    {Number(row.codPendingBalance) > 0 ? (
                      <span className="pill pill--vendor-pending">
                        {row.codPendingBalanceLabel || formatInr(row.codPendingBalance)}
                      </span>
                    ) : (
                      <span className="user-cell__muted">₹0</span>
                    )}
                  </td>
                  <td>{formatInr(row.walletBalance)}</td>
                  <td>
                    <span className={`pill pill--${row.status === "active" ? "vendor-approved" : "vendor-suspended"}`}>
                      {row.status || "—"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link
                        to={row._id}
                        className="icon-btn icon-btn--view"
                        title="Manage COD settlement"
                      >
                        <IoEyeSharp size={18} />
                      </Link>
                      <Link to={`/admin/delivery/${row._id}`} className="btn btn--ghost btn--sm">
                        Driver profile
                      </Link>
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
  );
}
