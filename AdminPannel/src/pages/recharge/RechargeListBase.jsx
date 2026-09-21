import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { adminListRecharges } from "../../api/adminRecharges.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";

const LIST_LIMIT = 10;

function typeLabel(type) {
  if (type === "mobile") return "Mobile";
  if (type === "gas") return "Gas";
  if (type === "fastag") return "Fastag";
  return "Recharge";
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function RechargeListBase({ type }) {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { recharges, pagination } = await adminListRecharges(adminToken, {
        page,
        limit: LIST_LIMIT,
        type,
        search: debouncedSearch || undefined,
      });
      setRows(recharges);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: error.message || "Failed to load recharge history.",
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, debouncedSearch, dispatch, page, type]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const title = `${typeLabel(type)} Recharge History`;
  const isMobile = type === "mobile";
  const colSpan = isMobile ? 10 : 11;

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <div>
            <h2 className="page-card__title">{title}</h2>
            <p className="page-card__desc">View old recharge history with user details and transaction information.</p>
          </div>
          <div className="page-card__actions">
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by contact, provider, reference..."
              aria-label="Search recharge history"
            />
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              {isMobile ? (
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Operator</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  {/* <th>Status</th> */}
                  <th>Transaction Ref</th>
                  <th>Date</th>
                  <th>Customer Contact</th>
                </tr>
              ) : (
                <tr>
                  <th>#</th>
                  <th>Booking Ref</th>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Provider</th>
                  <th>Consumer No.</th>
                  <th>Booked At</th>
                  <th>ETA</th>
                  {/* <th>Status</th> */}
                  <th>Update</th>
                  <th>Amount</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan}>
                    <p className="table-placeholder">Loading recharge history...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <p className="table-placeholder">No recharge history found.</p>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row._id}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    {isMobile ? (
                      <>
                        <td>{row.user?.name || "—"}</td>
                        <td>{row.contactNumber || "—"}</td>
                        <td>{row.typeDetails?.operator || row.provider || "—"}</td>
                        <td>{row.typeDetails?.plan || "—"}</td>
                        <td>{formatAmount(row.amount)}</td>
                        {/* <td>
                          <span className={`badge ${row.status === "success" ? "badge--active" : "badge--muted"}`}>
                            {row.status || "—"}
                          </span>
                        </td> */}
                        <td>{row.referenceId || "—"}</td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td>{row.user?.phone || "—"}</td>
                      </>
                    ) : (
                      <>
                        <td>{row.typeDetails?.bookingRef || row.referenceId || "—"}</td>
                        <td>{row.user?.name || "—"}</td>
                        <td>{row.contactNumber || row.user?.phone || "—"}</td>
                        <td>{row.provider || "—"}</td>
                        <td>{row.typeDetails?.consumerNo || "—"}</td>
                        <td>{formatDate(row.typeDetails?.bookedAt || row.createdAt)}</td>
                        <td>{formatDate(row.typeDetails?.eta)}</td>
                        {/* <td>
                          <span className={`badge ${row.status === "success" ? "badge--active" : "badge--muted"}`}>
                            {row.status || "—"}
                          </span>
                        </td> */}
                        <td>{row.typeDetails?.updateMessage || "—"}</td>
                        <td>{formatAmount(row.amount)}</td>
                      </>
                    )}
                  </tr>
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
