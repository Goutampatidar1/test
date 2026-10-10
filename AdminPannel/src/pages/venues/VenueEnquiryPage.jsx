import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { AiOutlineEye } from "react-icons/ai";
import {
  adminGetVenueEnquiry,
  adminListVenueEnquiries,
  adminUpdateVenueEnquiryStatus,
} from "../../api/adminVenueEnquiries.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

const LIST_LIMIT = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "converted", label: "Booked" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

const STATUS_PILL = {
  pending: "pill pill--vendor-pending",
  accepted: "pill pill--pay-info",
  converted: "pill pill--vendor-approved",
  rejected: "pill pill--blocked",
  cancelled: "pill pill--inactive",
  expired: "pill pill--suspended",
};

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatHold(seconds) {
  if (seconds == null) return "";
  if (seconds <= 0) return "hold expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m left to book` : `${m}m left to book`;
}

function StatusPill({ row }) {
  return <span className={STATUS_PILL[row.status] || "pill"}>{row.statusLabel || row.status}</span>;
}

export function VenueEnquiryPage() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewRow, setViewRow] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleError = useCallback(
    async (e, title) => {
      if (e?.status === 401) {
        dispatch(logout());
        return;
      }
      await Swal.fire({ icon: "error", title, text: e?.message || "Something went wrong." });
    },
    [dispatch]
  );

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const { enquiries, pagination } = await adminListVenueEnquiries(adminToken, {
        page,
        limit: LIST_LIMIT,
        status,
        search: appliedSearch,
      });
      setRows(enquiries);
      setPages(pagination?.pages ?? 1);
      setTotal(pagination?.total ?? 0);
    } catch (e) {
      await handleError(e, "Load failed");
    } finally {
      setLoading(false);
    }
  }, [adminToken, page, status, appliedSearch, handleError]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const openView = async (row) => {
    setViewRow(row);
    try {
      const fresh = await adminGetVenueEnquiry(adminToken, row._id);
      if (fresh) setViewRow(fresh);
    } catch (e) {
      await handleError(e, "Could not load enquiry");
    }
  };

  const changeStatus = async (next) => {
    if (!viewRow) return;
    let reason = "";
    if (next === "rejected" || next === "cancelled") {
      const result = await Swal.fire({
        title: next === "rejected" ? "Reject enquiry" : "Cancel enquiry",
        input: "textarea",
        inputLabel: next === "rejected" ? "Reason (sent to the customer)" : "Reason (optional)",
        inputValidator: (v) =>
          next === "rejected" && String(v || "").trim().length < 3 ? "Please write a short reason." : undefined,
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        confirmButtonText: next === "rejected" ? "Reject" : "Cancel enquiry",
      });
      if (!result.isConfirmed) return;
      reason = String(result.value || "").trim();
    } else {
      const { isConfirmed } = await Swal.fire({
        icon: "question",
        title: "Accept on behalf of the vendor?",
        text: "The customer gets a booking window to confirm these dates.",
        showCancelButton: true,
        confirmButtonText: "Accept",
      });
      if (!isConfirmed) return;
    }
    setBusy(true);
    try {
      const updated = await adminUpdateVenueEnquiryStatus(adminToken, viewRow._id, { status: next, reason });
      if (updated) setViewRow(updated);
      await Swal.fire({ icon: "success", title: `Enquiry ${next}`, timer: 1300 });
      await loadRows();
    } catch (e) {
      await handleError(e, "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const canAct = viewRow && ["pending", "accepted"].includes(viewRow.status);

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head" style={{ gap: 12, flexWrap: "wrap" }}>
          <h2 className="page-card__title">Venue Enquiries</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AdminSearchField
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 60))}
              placeholder="Enquiry no., name or phone"
              aria-label="Search enquiries"
            />
            <label className="user-field" style={{ margin: 0, width: 200 }}>
              <select
                className="user-field__input"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by status"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Enquiry</th>
                <th>Venue</th>
                <th>Customer</th>
                <th>Dates</th>
                <th>Guests</th>
                <th>Status</th>
                <th>Created</th>
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
                  <td colSpan={8}>No enquiries found.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <ClickableTableRow key={row._id} onOpen={() => openView(row)}>
                    <td>
                      {row.enquiryNumber}
                      {row.source === "quick" ? (
                        <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>Call-back request</span>
                      ) : null}
                    </td>
                    <td>
                      {row.venue?.name || "—"}
                      {row.venue?.city ? <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>{row.venue.city}</span> : null}
                    </td>
                    <td>
                      {row.customer?.name || row.contact?.name || "—"}
                      <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>
                        {row.customer?.phone || row.contact?.phone || ""}
                      </span>
                    </td>
                    <td className="data-table__muted">{row.summaryLabel || row.dateLabel}</td>
                    <td>{row.guestCount || "—"}</td>
                    <td>
                      <StatusPill row={row} />
                      {row.status === "accepted" && row.holdSecondsRemaining != null ? (
                        <span className="data-table__muted" style={{ display: "block", fontSize: 12 }}>
                          {formatHold(row.holdSecondsRemaining)}
                        </span>
                      ) : null}
                    </td>
                    <td className="data-table__muted">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-btn icon-btn--view" title="View" onClick={() => openView(row)}>
                          <AiOutlineEye size={18} />
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

      {viewRow ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewRow(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="page-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="page-card__head" style={{ marginBottom: 12 }}>
              <h2 className="page-card__title">Enquiry {viewRow.enquiryNumber}</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setViewRow(null)}>
                Close
              </button>
            </div>
            {viewRow.venue?.thumbnail ? (
              <img
                src={mediaUrl(viewRow.venue.thumbnail)}
                alt={viewRow.venue?.name || "Venue"}
                style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
              />
            ) : null}
            <div className="row g-2">
              <div className="col-12">
                <strong>Status:</strong> <StatusPill row={viewRow} />
                {viewRow.status === "accepted" && viewRow.holdSecondsRemaining != null ? (
                  <span className="data-table__muted"> · {formatHold(viewRow.holdSecondsRemaining)}</span>
                ) : null}
              </div>
              <div className="col-12">
                <strong>Venue:</strong> {viewRow.venue?.name || "—"}
                {viewRow.venue?.address ? <span className="data-table__muted"> · {viewRow.venue.address}</span> : null}
              </div>
              <div className="col-6">
                <strong>Customer:</strong> {viewRow.customer?.name || viewRow.contact?.name || "—"}
              </div>
              <div className="col-6">
                <strong>Phone:</strong> {viewRow.customer?.countryCode || ""} {viewRow.customer?.phone || viewRow.contact?.phone || "—"}
              </div>
              {viewRow.customer?.email ? (
                <div className="col-12">
                  <strong>Email:</strong> {viewRow.customer.email}
                </div>
              ) : null}
              <div className="col-12">
                <strong>Dates:</strong> {viewRow.summaryLabel || viewRow.dateLabel}
              </div>
              <div className="col-6">
                <strong>Booking type:</strong> {viewRow.bookingType === "hourly" ? "Hourly" : "Full day"}
              </div>
              <div className="col-6">
                <strong>Guests:</strong> {viewRow.guestCount || "—"}
              </div>
              {viewRow.eventType ? (
                <div className="col-6">
                  <strong>Event:</strong> {viewRow.eventType}
                </div>
              ) : null}
              {viewRow.preferredCallTime ? (
                <div className="col-6">
                  <strong>Call time:</strong> {viewRow.preferredCallTime}
                </div>
              ) : null}
              {viewRow.message ? (
                <div className="col-12">
                  <strong>Message:</strong> {viewRow.message}
                </div>
              ) : null}
              {viewRow.quote && Object.keys(viewRow.quote).length > 0 ? (
                <div className="col-12">
                  <strong>Quote:</strong>{" "}
                  {viewRow.quote.total != null ? `₹${Number(viewRow.quote.total).toLocaleString("en-IN")}` : ""}
                  {viewRow.quote.note ? <span className="data-table__muted"> · {viewRow.quote.note}</span> : null}
                </div>
              ) : null}
              {viewRow.vendorNote ? (
                <div className="col-12">
                  <strong>Vendor note:</strong> {viewRow.vendorNote}
                </div>
              ) : null}
              {viewRow.rejectionReason ? (
                <div className="col-12" style={{ color: "#b91c1c" }}>
                  <strong>Rejection reason:</strong> {viewRow.rejectionReason}
                </div>
              ) : null}
              {viewRow.cancellationReason ? (
                <div className="col-12">
                  <strong>Cancellation reason:</strong> {viewRow.cancellationReason}
                </div>
              ) : null}
              <div className="col-6">
                <strong>Created:</strong> {formatDateTime(viewRow.createdAt)}
              </div>
              <div className="col-6">
                <strong>Reply due:</strong> {formatDateTime(viewRow.responseDueAt)}
              </div>
              {viewRow.acceptedAt ? (
                <div className="col-6">
                  <strong>Accepted:</strong> {formatDateTime(viewRow.acceptedAt)}
                </div>
              ) : null}
              {viewRow.holdExpiresAt ? (
                <div className="col-6">
                  <strong>Book before:</strong> {formatDateTime(viewRow.holdExpiresAt)}
                </div>
              ) : null}
              {viewRow.orderId ? (
                <div className="col-12">
                  <strong>Booking:</strong> {String(viewRow.orderId)}
                  {viewRow.convertedAt ? <span className="data-table__muted"> · {formatDateTime(viewRow.convertedAt)}</span> : null}
                </div>
              ) : null}
            </div>
            {canAct ? (
              <div className="user-form__actions">
                {viewRow.status === "pending" ? (
                  <>
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => changeStatus("rejected")}>
                      Reject
                    </button>
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => changeStatus("accepted")}>
                      Accept
                    </button>
                  </>
                ) : null}
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => changeStatus("cancelled")}>
                  Cancel enquiry
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
