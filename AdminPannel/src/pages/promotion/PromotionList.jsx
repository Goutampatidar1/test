import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { AiFillDelete } from "react-icons/ai";
import { MdEditSquare } from "react-icons/md";
import { adminDeletePromotion, adminListPromotions, adminUpdatePromotion } from "../../api/promotionController.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const LIST_LIMIT = 10;

export function PromotionList() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [togglingId, setTogglingId] = useState("");

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { promotions, pagination } = await adminListPromotions(adminToken, { page, limit: LIST_LIMIT });
      setRows(promotions);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Load failed", text: e.message || "Failed to load promotions." });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const onDelete = async (row) => {
    if (!adminToken) return;
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: "Delete promotion?",
      text: `This will delete "${row.promoCode}".`,
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Delete",
    });
    if (!isConfirmed) return;
    try {
      await adminDeletePromotion(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Promotion deleted", timer: 1500 });
      await loadRows();
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Delete failed", text: e.message || "Could not delete promotion." });
    }
  };

  const onToggleStatus = async (row) => {
    if (!adminToken) return;
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setTogglingId(row._id);
    try {
      await adminUpdatePromotion(adminToken, row._id, { status: nextStatus });
      await Swal.fire({ icon: "success", title: "Promotion status updated", timer: 1500 });
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Promotion status update failed", text: e.message || "Could not update promotion status." });
    } finally {
      setTogglingId("");
      await loadRows();
    }
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Promotions</h2>
          <Link to="/admin/promo/new" className="btn btn--accent">Create Promotion</Link>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Promo Code</th>
                <th>Image</th>
                <th>Discount</th>
                <th>Current Usage / Total Usage</th>
                <th>Date Range</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8}>No promotions found.</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <ClickableTableRow key={row._id} to={`/admin/promo/${row._id}`}>
                    <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                    <td>{row.promoCode || "—"}</td>
                    <td>{row.image ? <img src={mediaUrl(row.image)} alt={row.promoCode} style={{ width: "auto", height: "50px", objectFit: "cover", borderRadius: 6 }} /> : "—"}</td>
                    <td>{row.discountType === "percentage" ? `${row.discountValue}%` : `Rs ${row.discountValue}`}</td>
                    <td>{row.usedCount ?? 0}/{row.totalUsageLimit ?? 0}</td>
                    <td className="data-table__muted">
                      {row.startDate ? new Date(row.startDate).toLocaleDateString() : "—"} - {row.endDate ? new Date(row.endDate).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`settings-switch${row.status === "active" ? " settings-switch--on" : ""}`}
                        role="switch"
                        aria-checked={row.status === "active"}
                        aria-label={`Toggle status for ${row.promoCode}`}
                        onClick={() => onToggleStatus(row)}
                        disabled={togglingId === row._id}
                      >
                        <span className="settings-switch__knob" aria-hidden />
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--view" title="View" onClick={() => navigate(`/admin/promo/${row._id}`)}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button type="button" className="icon-btn icon-btn--edit" title="Edit" onClick={() => navigate(`/admin/promo/${row._id}/edit`)}>
                          <MdEditSquare size={18} />
                        </button>
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
