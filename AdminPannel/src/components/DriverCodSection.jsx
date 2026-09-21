import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import {
  adminGetDriverCodDetail,
  adminListDriverCodPendingOrders,
  adminListDriverCodSettlements,
  adminSettleDriverCod,
} from "../api/adminDeliveryCod.js";
import { ListPagination } from "./ListPagination.jsx";

function formatInr(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function codSettlementDisplay(row) {
  const pending = Number(row.pendingAmount) || 0;
  const settled = Number(row.codSettledAmount) || 0;
  const status = String(row.codSettlementStatus || "").toLowerCase();

  if (status === "settled" || pending <= 0) {
    return { label: "Settled", pillClass: "pill--vendor-approved" };
  }
  if (status === "partial" || settled > 0) {
    return { label: "Partially settled", pillClass: "pill--order-warning" };
  }
  return { label: "Awaiting settlement", pillClass: "pill--vendor-pending" };
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__meta">
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__value">{value}</div>
      </div>
      <div className="stat-card__icon" aria-hidden="true" />
    </div>
  );
}

export function DriverCodSection({ adminToken, driverId, onSettled }) {
  const [summary, setSummary] = useState(null);
  const [pendingRows, setPendingRows] = useState([]);
  const [settlementRows, setSettlementRows] = useState([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [settlementPage, setSettlementPage] = useState(1);
  const [pendingPages, setPendingPages] = useState(1);
  const [settlementPages, setSettlementPages] = useState(1);
  const [amount, setAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!adminToken || !driverId) return;
    setError("");
    try {
      const data = await adminGetDriverCodDetail(adminToken, driverId);
      setSummary(data);
    } catch (e) {
      setError(e.message || "Failed to load COD summary.");
    }
  }, [adminToken, driverId]);

  const loadPending = useCallback(async () => {
    if (!adminToken || !driverId) return;
    try {
      const { rows, pagination } = await adminListDriverCodPendingOrders(adminToken, driverId, {
        page: pendingPage,
        limit: 5,
      });
      setPendingRows(rows);
      setPendingPages(pagination?.pages ?? 1);
    } catch (e) {
      setError(e.message || "Failed to load pending COD orders.");
    }
  }, [adminToken, driverId, pendingPage]);

  const loadSettlements = useCallback(async () => {
    if (!adminToken || !driverId) return;
    try {
      const { rows, pagination } = await adminListDriverCodSettlements(adminToken, driverId, {
        page: settlementPage,
        limit: 5,
      });
      setSettlementRows(rows);
      setSettlementPages(pagination?.pages ?? 1);
    } catch (e) {
      setError(e.message || "Failed to load settlement history.");
    }
  }, [adminToken, driverId, settlementPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadSummary(), loadPending(), loadSettlements()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSummary, loadPending, loadSettlements]);

  const pendingBalance = Number(summary?.codPendingBalance) || 0;

  const handleSettle = async (e) => {
    e.preventDefault();
    if (!adminToken || !driverId) return;

    const settleAmount = Number(amount);
    if (!Number.isFinite(settleAmount) || settleAmount <= 0) {
      await Swal.fire({ icon: "warning", title: "Invalid amount", text: "Enter a settlement amount greater than zero." });
      return;
    }
    if (settleAmount > pendingBalance) {
      await Swal.fire({
        icon: "warning",
        title: "Amount too high",
        text: `Pending COD balance is ${formatInr(pendingBalance)}.`,
      });
      return;
    }

    const { isConfirmed } = await Swal.fire({
      icon: "question",
      title: "Confirm COD settlement?",
      html: `Collect <strong>${formatInr(settleAmount)}</strong> from this driver and reduce their pending COD balance.`,
      showCancelButton: true,
      confirmButtonText: "Settle",
      confirmButtonColor: "#141414",
    });
    if (!isConfirmed) return;

    setSubmitting(true);
    try {
      const result = await adminSettleDriverCod(adminToken, driverId, {
        amount: settleAmount,
        adminNote: adminNote.trim(),
      });
      setAmount("");
      setAdminNote("");
      await Swal.fire({
        icon: "success",
        title: "COD settled",
        text: result?.message || "Settlement recorded successfully.",
        timer: 1800,
      });
      await Promise.all([loadSummary(), loadPending(), loadSettlements()]);
      onSettled?.(result);
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Settlement failed", text: err.message || "Could not settle COD." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !summary) {
    return <p className="static-cms-loading">Loading COD collection data…</p>;
  }

  return (
    <div className="driver-cod-section">
      {error ? <p className="user-form__error">{error}</p> : null}

      <div className="driver-cod-stats">
        <StatCard
          label="Pending collection"
          value={summary?.codPendingBalanceLabel || formatInr(0)}
          tone="orange"
        />
        <StatCard
          label="Total COD collected"
          value={summary?.totalCodCollectedLabel || formatInr(0)}
          tone="yellow"
        />
        <StatCard
          label="Total settled"
          value={summary?.totalCodSettledLabel || formatInr(0)}
          tone="green"
        />
      </div>

      <div className="driver-cod-settle-panel">
        <div className="driver-cod-settle-panel__head">
          <h3 className="driver-cod-settle-panel__title">Record settlement</h3>
          <p className="driver-cod-settle-panel__desc">
            Enter the cash amount received from the driver. This reduces their pending COD balance.
          </p>
        </div>

        <form className="driver-cod-settle-form" onSubmit={handleSettle}>
          <div className="driver-cod-settle-form__fields">
            <label className="user-field">
              <span className="user-field__label">
                Settlement amount <span className="required-dot">*</span>
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={pendingBalance > 0 ? pendingBalance : undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={pendingBalance > 0 ? `Up to ${formatInr(pendingBalance)}` : "No pending balance"}
                disabled={submitting || pendingBalance <= 0}
                required
              />
            </label>
            <label className="user-field">
              <span className="user-field__label">Admin note</span>
              <input
                type="text"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Optional note for settlement history"
                maxLength={240}
                disabled={submitting || pendingBalance <= 0}
              />
            </label>
          </div>
          <div className="driver-cod-settle-form__actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={submitting || pendingBalance <= 0}
              onClick={() => setAmount(String(pendingBalance || ""))}
            >
              Settle full amount
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting || pendingBalance <= 0}>
              {submitting ? "Settling…" : "Settle amount"}
            </button>
          </div>
        </form>
      </div>

      <section className="driver-cod-block page-card">
        <div className="page-card__head">
          <div>
            <h3 className="page-card__title">Pending COD orders</h3>
            <p className="page-card__subtitle">
              Orders are delivered — this tracks whether cash collected from the customer has been handed over to admin.
            </p>
          </div>
        </div>

        {pendingRows.length === 0 ? (
          <p className="table-placeholder">No pending COD orders for this driver.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Collected</th>
                    <th>Order total</th>
                    <th>Settled</th>
                    <th>Pending</th>
                    <th>Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.map((row) => {
                    const settlement = codSettlementDisplay(row);
                    return (
                    <tr key={row._id}>
                      <td>
                        <Link to={`/admin/orders/ecom/${row._id}`} className="data-table__link">
                          {row.orderNumber || row._id}
                        </Link>
                      </td>
                      <td className="data-table__muted">{formatDate(row.codCollectedAt)}</td>
                      <td>{formatInr(row.grandTotal)}</td>
                      <td>{formatInr(row.codSettledAmount)}</td>
                      <td className="data-table__strong">
                        {row.pendingAmountLabel || formatInr(row.pendingAmount)}
                      </td>
                      <td>
                        <span className={`pill ${settlement.pillClass}`}>{settlement.label}</span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListPagination page={pendingPage} pages={pendingPages} onPageChange={setPendingPage} />
          </>
        )}
      </section>

      <section className="driver-cod-block page-card">
        <div className="page-card__head">
          <div>
            <h3 className="page-card__title">Settlement history</h3>
            <p className="page-card__subtitle">Previous cash handovers recorded by admin.</p>
          </div>
        </div>

        {settlementRows.length === 0 ? (
          <p className="table-placeholder">No COD settlements recorded yet.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Settlement #</th>
                    <th>Amount</th>
                    <th>Balance after</th>
                    <th>Processed</th>
                    <th>By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementRows.map((row) => (
                    <tr key={row._id}>
                      <td className="data-table__mono">{row.settlementNumber}</td>
                      <td className="data-table__strong">{row.amountLabel || formatInr(row.amount)}</td>
                      <td>{formatInr(row.balanceAfter)}</td>
                      <td className="data-table__muted">{formatDate(row.processedAt)}</td>
                      <td>{row.processedBy?.name || row.processedBy?.email || "Admin"}</td>
                      <td className="data-table__muted">{row.adminNote || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination page={settlementPage} pages={settlementPages} onPageChange={setSettlementPage} />
          </>
        )}
      </section>
    </div>
  );
}
