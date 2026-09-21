import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { AiOutlineEye } from "react-icons/ai";
import {
  adminApprovePromotionRequest,
  adminListPromotionRequests,
  adminRejectPromotionRequest,
} from "../../api/promotionAdvertisingController.js";
import { logout } from "../../store/authSlice.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import { mediaUrl } from "../../media.js";

const LIST_LIMIT = 10;

const STATUS_META = {
  pending_review: { label: "Pending review", pill: "pill--order-warning" },
  scheduled: { label: "Scheduled", pill: "pill--pay-info" },
  active: { label: "Active", pill: "pill--active" },
  rejected: { label: "Rejected", pill: "pill--blocked" },
  expired: { label: "Expired", pill: "pill--inactive" },
  cancelled: { label: "Cancelled", pill: "pill--inactive" },
};

function formatInr(amount) {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function isVenueRow(row) {
  return row?.vendor?.kind === "venue" || row?.ownerType === "venue";
}

function statusMeta(status) {
  return STATUS_META[status] || { label: status || "—", pill: "pill--pay-neutral" };
}

export function PromotionRequestsPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [viewRow, setViewRow] = useState(null);
  const [statusFilter, setStatusFilter] = useState(
    () => searchParams.get("status") || ""
  );
  const [planTypeFilter, setPlanTypeFilter] = useState(() => searchParams.get("planType") || "");
  const [ownerTypeFilter, setOwnerTypeFilter] = useState(() => searchParams.get("ownerType") || "");

  useEffect(() => {
    const nextStatus = searchParams.get("status");
    const nextPlanType = searchParams.get("planType") || "";
    const nextOwner = searchParams.get("ownerType") || "";
    if (nextStatus != null) setStatusFilter(nextStatus);
    setPlanTypeFilter(nextPlanType);
    setOwnerTypeFilter(nextOwner);
    setPage(1);
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!adminToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await adminListPromotionRequests(adminToken, {
        page,
        limit: LIST_LIMIT,
        status: statusFilter || undefined,
        planType: planTypeFilter || undefined,
        ownerType: ownerTypeFilter || undefined,
      });
      setRows(result?.requests || []);
      setTotal(result?.pagination?.total || 0);
      setPages(result?.pagination?.pages || 1);
    } catch (err) {
      setRows([]);
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Load failed", text: err?.message || "Failed to load requests" });
    } finally {
      setLoading(false);
    }
  }, [adminToken, page, statusFilter, planTypeFilter, ownerTypeFilter, dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const onApprove = async (row) => {
    const { isConfirmed } = await Swal.fire({
      title: "Approve promotion?",
      text: `${row.planName} · ${row.vendor?.name || "Vendor"}`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Approve",
    });
    if (!isConfirmed || !adminToken) return;
    try {
      await adminApprovePromotionRequest(adminToken, row._id);
      await Swal.fire({ icon: "success", title: "Approved", timer: 1500 });
      setViewRow(null);
      load();
    } catch (err) {
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Approve failed", text: err?.message || "Failed" });
    }
  };

  const onReject = async (row) => {
    const { value: reason } = await Swal.fire({
      title: "Reject promotion",
      input: "text",
      inputPlaceholder: "Reason (optional)",
      showCancelButton: true,
      confirmButtonText: "Reject",
    });
    if (reason === undefined || !adminToken) return;
    try {
      await adminRejectPromotionRequest(adminToken, row._id, reason);
      await Swal.fire({ icon: "success", title: "Rejected", timer: 1500 });
      setViewRow(null);
      load();
    } catch (err) {
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Reject failed", text: err?.message || "Failed" });
    }
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head promo-requests__head">
          <div>
            <h2 className="page-card__title">Promotion Requests</h2>
            <p className="page-card__desc">Review paid vendor and service-vendor promotions before they go live.</p>
          </div>
          <div className="promo-requests__filters">
            <select
              className="user-list-status-select"
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              aria-label="Filter by status"
            >
              <option value="pending_review">Pending review</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="">All statuses</option>
            </select>
            <select
              className="user-list-status-select"
              value={ownerTypeFilter}
              onChange={(e) => {
                setPage(1);
                setOwnerTypeFilter(e.target.value);
              }}
              aria-label="Filter by vendor type"
            >
              <option value="">All vendors</option>
              <option value="ecom">E-commerce vendor</option>
              <option value="venue">Service vendor</option>
            </select>
            <select
              className="user-list-status-select"
              value={planTypeFilter}
              onChange={(e) => {
                setPage(1);
                setPlanTypeFilter(e.target.value);
              }}
              aria-label="Filter by plan type"
            >
              <option value="">All types</option>
              <option value="banner">Banner</option>
              <option value="get_verified">Get Verified</option>
              <option value="product_presence_first">Product Presence</option>
            </select>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table data-table--compact promo-requests__table">
            <thead>
              <tr>
                <th>S No.</th>
                <th>Vendor</th>
                <th>Promotion</th>
                <th>Location</th>
                <th>Dates</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No requests found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const meta = statusMeta(row.status);
                  const venue = isVenueRow(row);
                  return (
                    <ClickableTableRow key={row._id} onOpen={() => setViewRow(row)}>
                      <td className="data-table__muted">{(page - 1) * LIST_LIMIT + idx + 1}</td>
                      <td>
                        <div className="user-cell__name">{row.vendor?.name || "—"}</div>
                        <div className="data-table__muted">{venue ? "Service vendor" : "E-commerce vendor"}</div>
                        {row.vendor?.phone ? <div className="data-table__muted">{row.vendor.phone}</div> : null}
                      </td>
                      <td>
                        <div className="promo-requests__promo">
                          {row.bannerImage ? (
                            <img
                              className="promo-requests__thumb"
                              src={mediaUrl(row.bannerImage)}
                              alt=""
                            />
                          ) : null}
                          <div>
                            <div className="user-cell__name">{row.planName || "—"}</div>
                            <div className="data-table__muted">
                              {row.planTypeLabel || row.planType} · {row.durationTypeLabel || row.durationType}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>{row.cityName || "—"}</div>
                        <div className="data-table__muted">{row.subDistrictName || "—"}</div>
                      </td>
                      <td className="data-table__muted">
                        <div>{formatDate(row.startDate)}</div>
                        <div>to {formatDate(row.expiryDate)}</div>
                      </td>
                      <td className="data-table__mono">{formatInr(row.amount)}</td>
                      <td>
                        <span className={`pill ${meta.pill}`}>{meta.label}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn icon-btn--view"
                            title="View details"
                            onClick={() => setViewRow(row)}
                          >
                            <AiOutlineEye size={18} />
                          </button>
                          {row.status === "pending_review" ? (
                            <>
                              <button type="button" className="btn btn--primary" onClick={() => onApprove(row)}>
                                Approve
                              </button>
                              <button type="button" className="btn btn--ghost" onClick={() => onReject(row)}>
                                Reject
                              </button>
                            </>
                          ) : null}
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

      {viewRow ? (
        <div
          role="dialog"
          aria-modal="true"
          className="promo-requests__overlay"
          onClick={() => setViewRow(null)}
        >
          <div className="page-card promo-requests__dialog" onClick={(e) => e.stopPropagation()}>
            <div className="page-card__head">
              <h2 className="page-card__title">Request details</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            {viewRow.bannerImage ? (
              <img className="promo-requests__banner" src={mediaUrl(viewRow.bannerImage)} alt="" />
            ) : null}
            <div className="promo-requests__details">
              <div>
                <strong>Vendor</strong>
                <span>
                  {viewRow.vendor?.name || "—"} ({isVenueRow(viewRow) ? "Service vendor" : "E-commerce vendor"})
                </span>
              </div>
              <div>
                <strong>Plan</strong>
                <span>
                  {viewRow.planName || "—"} · {viewRow.planTypeLabel || viewRow.planType}
                </span>
              </div>
              <div>
                <strong>Duration</strong>
                <span>
                  {viewRow.durationTypeLabel || viewRow.durationType} · {formatInr(viewRow.amount)}
                </span>
              </div>
              <div>
                <strong>Location</strong>
                <span>
                  {viewRow.cityName || "—"} / {viewRow.subDistrictName || "—"}
                </span>
              </div>
              <div>
                <strong>Dates</strong>
                <span>
                  {formatDate(viewRow.startDate)} → {formatDate(viewRow.expiryDate)}
                </span>
              </div>
              <div>
                <strong>Status</strong>
                <span className={`pill ${statusMeta(viewRow.status).pill}`}>{statusMeta(viewRow.status).label}</span>
              </div>
              {viewRow.rejectionReason ? (
                <div>
                  <strong>Rejection reason</strong>
                  <span>{viewRow.rejectionReason}</span>
                </div>
              ) : null}
            </div>
            {viewRow.status === "pending_review" ? (
              <div className="user-form__actions">
                <button type="button" className="btn btn--ghost" onClick={() => onReject(viewRow)}>
                  Reject
                </button>
                <button type="button" className="btn btn--primary" onClick={() => onApprove(viewRow)}>
                  Approve
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
