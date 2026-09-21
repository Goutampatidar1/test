import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";
import { IoEyeSharp } from "react-icons/io5";
import { TbInvoice } from "react-icons/tb";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import Swal from "sweetalert2";
import {
  adminListEcomTransactions,
  adminListRechargeTransactions,
  adminListRevenueHistory,
  adminListVenueTransactions,
} from "../../api/adminPayments.js";
import {
  adminListDeliveryWithdrawals,
  adminUpdateDeliveryWithdrawal,
} from "../../api/adminDeliveryWithdrawals.js";
import {
  adminListVendorWithdrawals,
  adminUpdateVendorWithdrawal,
} from "../../api/adminVendorWithdrawals.js";
import { logout } from "../../store/authSlice.js";
import { openTransactionInvoice } from "../../utils/invoicePrint.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";

const LIST_LIMIT = 10;

const TABS = [
  { key: "revenue", label: "Revenue" },
  { key: "order", label: "Order Payments" },
  { key: "recharge", label: "Recharge Payments" },
  { key: "booking", label: "Booking Payments" },
  { key: "withdrawal", label: "Driver Withdrawals" },
  { key: "vendor_withdrawal", label: "Vendor Withdrawals" },
];

const SEARCH_PLACEHOLDERS = {
  revenue: "Search all history...",
  order: "Search payments...",
  recharge: "Search payments...",
  booking: "Search payments...",
  withdrawal: "Search driver or request...",
  vendor_withdrawal: "Search vendor or request...",
};

const EMPTY_REVENUE_TOTALS = { inflow: 0, outflow: 0, net: 0 };

function initialPaymentTab(searchParams) {
  const tab = searchParams.get("tab");
  return TABS.some((item) => item.key === tab) ? tab : "order";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toLocaleString("en-IN")}`;
}

function WithdrawalStatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "approved"
      ? "vendor-approved"
      : s === "pending"
        ? "vendor-pending"
        : "vendor-suspended";
  return <span className={`pill pill--${cls}`}>{status || "—"}</span>;
}

function revenueDetailKind(kind) {
  if (kind === "ecom") return "ecom";
  if (kind === "venue") return "venue";
  if (kind === "recharge") return "recharge";
  return null;
}

function toDisplayRows(tabKey, rows) {
  return rows.map((row) => {
    if (tabKey === "revenue") {
      return {
        id: row._id,
        kind: row.kind,
        kindLabel: row.kindLabel || "—",
        transactionId: row.transactionId || "—",
        orderId: row.orderId || "—",
        customer: row.customer || "—",
        vendor: row.vendor || "—",
        amount: row.amount,
        method: row.method || "—",
        date: row.date || row.createdAt,
        status: row.status || "—",
        direction: row.direction,
        raw: row,
      };
    }
    if (tabKey === "recharge") {
      return {
        id: row._id,
        transactionId: row.transactionId || "—",
        orderId: row.recharge?.referenceId || row.referenceId || "—",
        customer: row.user?.name || "—",
        vendor: row.rechargeType ? `${row.rechargeType.toUpperCase()} Recharge` : "Recharge",
        amount: row.amount,
        method: row.paymentMethod || "—",
        date: row.createdAt || row.processedAt,
        status: row.status || "—",
        raw: row,
      };
    }
    if (tabKey === "withdrawal" || tabKey === "vendor_withdrawal") {
      const party = tabKey === "vendor_withdrawal" ? row.vendor : row.driver;
      return {
        id: row._id,
        requestNumber: row.requestNumber || "—",
        partyName: party?.businessName || party?.name || "—",
        partyPhone: party?.phone || "—",
        amount: row.amount,
        bankAccountName: row.bankAccountName || "—",
        bankName: row.bankName || "—",
        ifscCode: row.ifscCode || "—",
        accountNumber: row.accountNumber || "—",
        date: row.createdAt,
        status: row.status || "—",
        raw: row,
      };
    }
    if (tabKey === "order") {
      const summary = row.paymentSummary || {};
      return {
        id: row._id,
        transactionId: row.transactionId || "—",
        orderId: row.order?.orderNumber || "—",
        customer: row.user?.name || "—",
        vendor: summary.vendorName || "—",
        adminCommission: summary.adminCommission ?? 0,
        vendorAmount: summary.vendorAmount ?? 0,
        shippingCharge: summary.shippingCharge ?? row.order?.shippingCharge ?? 0,
        totalAmount: summary.totalAmount ?? row.order?.grandTotal ?? row.amount ?? 0,
        amount: row.amount,
        method: row.paymentMethod || "—",
        date: row.createdAt || row.processedAt,
        status: row.status || "—",
        raw: row,
      };
    }
    return {
      id: row._id,
      transactionId: row.transactionId || "—",
      orderId: row.order?.orderNumber || "—",
      customer: row.user?.name || "—",
      vendor: tabKey === "booking" ? "Service Booking" : "Ecom Order",
      amount: row.amount,
      method: row.paymentMethod || "—",
      date: row.createdAt || row.processedAt,
      status: row.status || "—",
      raw: row,
    };
  });
}

function exportCsv(fileName, rows, tabKey) {
  const headers =
    tabKey === "revenue"
      ? ["Type", "Transaction ID", "Order ID", "Customer", "Vendor", "Amount", "Method", "Date", "Status"]
      : tabKey === "order"
      ? [
          "Transaction ID",
          "Order ID",
          "Customer",
          "Vendor",
          "Admin Commission",
          "Vendor Amount",
          "Shipping Charge",
          "Total Amount",
          "Method",
          "Date",
          "Status",
        ]
      : ["Transaction ID", "Order ID", "Customer", "Vendor", "Amount", "Method", "Date", "Status"];
  const csvRows = [headers.join(",")];
  rows.forEach((row) => {
    const cols =
      tabKey === "revenue"
        ? [
            row.kindLabel,
            row.transactionId,
            row.orderId,
            row.customer,
            row.vendor,
            String(row.amount ?? ""),
            row.method,
            formatDate(row.date),
            row.status,
          ]
        : tabKey === "order"
        ? [
            row.transactionId,
            row.orderId,
            row.customer,
            row.vendor,
            String(row.adminCommission ?? ""),
            String(row.vendorAmount ?? ""),
            String(row.shippingCharge ?? ""),
            String(row.totalAmount ?? ""),
            row.method,
            formatDate(row.date),
            row.status,
          ]
        : [
            row.transactionId,
            row.orderId,
            row.customer,
            row.vendor,
            String(row.amount ?? ""),
            row.method,
            formatDate(row.date),
            row.status,
          ];
    csvRows.push(
      cols.map((col) => `"${String(col ?? "").replace(/"/g, '""')}"`).join(",")
    );
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function OrderAndBookingTransactionPage() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const loadSeqRef = useRef(0);

  const [activeTab, setActiveTab] = useState(() => initialPaymentTab(searchParams));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [withdrawalStatus, setWithdrawalStatus] = useState("");
  const [actionId, setActionId] = useState("");
  const [revenueTotals, setRevenueTotals] = useState(EMPTY_REVENUE_TOTALS);

  const selectTab = (tabKey) => {
    if (tabKey === activeTab) return;
    loadSeqRef.current += 1;
    setActiveTab(tabKey);
    setPage(1);
    setPages(1);
    setTotal(0);
    setRows([]);
    setRevenueTotals(EMPTY_REVENUE_TOTALS);
    setActionId("");
    if (tabKey !== "withdrawal" && tabKey !== "vendor_withdrawal") {
      setWithdrawalStatus("");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, withdrawalStatus]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const payload = { page, limit: LIST_LIMIT, search: debouncedSearch || undefined };
      let result;
      if (activeTab === "revenue") result = await adminListRevenueHistory(adminToken, payload);
      else if (activeTab === "order") result = await adminListEcomTransactions(adminToken, payload);
      else if (activeTab === "booking") result = await adminListVenueTransactions(adminToken, payload);
      else if (activeTab === "withdrawal") {
        result = await adminListDeliveryWithdrawals(adminToken, {
          ...payload,
          status: withdrawalStatus || undefined,
        });
      } else if (activeTab === "vendor_withdrawal") {
        result = await adminListVendorWithdrawals(adminToken, {
          ...payload,
          status: withdrawalStatus || undefined,
        });
      } else result = await adminListRechargeTransactions(adminToken, payload);

      if (seq !== loadSeqRef.current) return;

      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setPages(result?.pagination?.pages ?? 1);
      setTotal(result?.pagination?.total ?? 0);
      setRevenueTotals(activeTab === "revenue" ? result?.totals ?? EMPTY_REVENUE_TOTALS : EMPTY_REVENUE_TOTALS);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: error.message || "Could not load records.",
      });
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [activeTab, adminToken, debouncedSearch, dispatch, page, withdrawalStatus]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const displayRows = useMemo(() => toDisplayRows(activeTab, rows), [activeTab, rows]);
  const paymentKind = activeTab === "order" ? "ecom" : activeTab === "booking" ? "venue" : "recharge";
  const isOrderTab = activeTab === "order";
  const isRevenueTab = activeTab === "revenue";
  const paymentColSpan = isOrderTab ? 12 : isRevenueTab ? 9 : 8;
  const isWithdrawalTab = activeTab === "withdrawal" || activeTab === "vendor_withdrawal";
  const withdrawalPartyLabel = activeTab === "vendor_withdrawal" ? "Vendor" : "Driver";

  const onExport = () => {
    if (isWithdrawalTab) return;
    const name = `payment-${activeTab}-transactions.csv`;
    exportCsv(name, displayRows, activeTab);
  };

  const onInvoice = (row) => {
    const tabKey =
      activeTab === "revenue"
        ? row.kind === "ecom"
          ? "order"
          : row.kind === "venue"
            ? "booking"
            : "recharge"
        : activeTab;
    openTransactionInvoice({ tabKey, row });
  };

  const onApproveWithdrawal = async (row) => {
    if (!adminToken) return;
    const { isConfirmed, value: adminNote } = await Swal.fire({
      title: "Approve withdrawal?",
      html: `Approve <strong>${formatAmount(row.amount)}</strong> for <strong>${row.partyName}</strong>?`,
      input: "text",
      inputPlaceholder: "Admin note (optional)",
      showCancelButton: true,
      confirmButtonText: "Approve",
      confirmButtonColor: "#16a34a",
    });
    if (!isConfirmed) return;

    try {
      setActionId(row.id);
      const updateFn =
        activeTab === "vendor_withdrawal" ? adminUpdateVendorWithdrawal : adminUpdateDeliveryWithdrawal;
      await updateFn(adminToken, row.id, {
        status: "approved",
        adminNote: adminNote || "",
      });
      await Swal.fire({ icon: "success", title: "Withdrawal approved", timer: 1500 });
      loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Approve failed", text: error.message || "Could not approve." });
    } finally {
      setActionId("");
    }
  };

  const onRejectWithdrawal = async (row) => {
    if (!adminToken) return;
    const { isConfirmed, value: rejectionReason } = await Swal.fire({
      title: "Reject withdrawal?",
      html: `Reject <strong>${formatAmount(row.amount)}</strong> for <strong>${row.partyName}</strong>. Balance will be refunded.`,
      input: "text",
      inputPlaceholder: "Rejection reason",
      inputValidator: (value) => (!value?.trim() ? "Rejection reason is required" : undefined),
      showCancelButton: true,
      confirmButtonText: "Reject",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    try {
      setActionId(row.id);
      const updateFn =
        activeTab === "vendor_withdrawal" ? adminUpdateVendorWithdrawal : adminUpdateDeliveryWithdrawal;
      await updateFn(adminToken, row.id, {
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
      });
      await Swal.fire({ icon: "success", title: "Withdrawal rejected", timer: 1500 });
      loadRows();
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Reject failed", text: error.message || "Could not reject." });
    } finally {
      setActionId("");
    }
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head payment-head">
          <div>
            <h2 className="page-card__title">Payment Management</h2>
          </div>
          <div className="page-card__actions">
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={SEARCH_PLACEHOLDERS[activeTab] || "Search..."}
              aria-label="Search payments"
            />
            {isWithdrawalTab ? (
              <select
                className="user-list-status-select"
                value={withdrawalStatus}
                onChange={(e) => setWithdrawalStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={onExport}>
                Export
              </button>
            )}
          </div>
        </div>

        <div className="payment-tabs" role="tablist" aria-label="Payment sections">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`payment-tabs__item${activeTab === tab.key ? " is-active" : ""}`}
              aria-selected={activeTab === tab.key}
              onClick={() => selectTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isRevenueTab ? (
          <div className="revenue-summary" aria-label="Revenue totals">
            <div className="revenue-summary__card">
              <span className="revenue-summary__label">Successful inflow</span>
              <strong className="revenue-summary__value">{formatAmount(revenueTotals.inflow)}</strong>
            </div>
            <div className="revenue-summary__card">
              <span className="revenue-summary__label">Approved withdrawals</span>
              <strong className="revenue-summary__value">{formatAmount(revenueTotals.outflow)}</strong>
            </div>
            <div className="revenue-summary__card">
              <span className="revenue-summary__label">Net</span>
              <strong className="revenue-summary__value">{formatAmount(revenueTotals.net)}</strong>
            </div>
          </div>
        ) : null}

        <div className="table-scroll">
          {isWithdrawalTab ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>{withdrawalPartyLabel}</th>
                  <th>Amount</th>
                  <th>Bank Details</th>
                  <th>Status</th>
                  <th>Requested On</th>
                  <th className="data-table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <p className="table-placeholder">Loading withdrawal requests...</p>
                    </td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <p className="table-placeholder">No withdrawal requests found.</p>
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="data-table__strong">{row.requestNumber}</span>
                      </td>
                      <td>
                        <div className="data-table__strong">{row.partyName}</div>
                        <div className="user-cell__muted">{row.partyPhone}</div>
                      </td>
                      <td>{formatAmount(row.amount)}</td>
                      <td>
                        <div>{row.bankAccountName}</div>
                        <div className="user-cell__muted">
                          {row.bankName} · {row.ifscCode}
                        </div>
                        <div className="user-cell__muted data-table__mono">{row.accountNumber}</div>
                      </td>
                      <td>
                        <WithdrawalStatusBadge status={row.status} />
                      </td>
                      <td>{formatDate(row.date)}</td>
                      <td>
                        {String(row.status).toLowerCase() === "pending" ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="icon-btn icon-btn--view"
                              title="Approve"
                              disabled={actionId === row.id}
                              onClick={() => onApproveWithdrawal(row)}
                            >
                              <MdCheckCircle size={18} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn--delete"
                              title="Reject"
                              disabled={actionId === row.id}
                              onClick={() => onRejectWithdrawal(row)}
                            >
                              <MdCancel size={18} />
                            </button>
                          </div>
                        ) : (
                          <span className="user-cell__muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {isRevenueTab ? <th>Type</th> : null}
                  <th>Transaction ID</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Vendor</th>
                  {isOrderTab ? (
                    <>
                      <th>Admin Commission</th>
                      <th>Vendor Amount</th>
                      <th>Shipping Charge</th>
                      <th>Total Amount</th>
                    </>
                  ) : (
                    <th>Amount</th>
                  )}
                  <th>Method</th>
                  <th>Date</th>
                  <th className="data-table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={paymentColSpan}>
                      <p className="table-placeholder">Loading transactions...</p>
                    </td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={paymentColSpan}>
                      <p className="table-placeholder">No transactions found.</p>
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row) => {
                    const detailKind = isRevenueTab ? revenueDetailKind(row.kind) : paymentKind;
                    const detailTo = detailKind ? `${detailKind}/${row.id}` : "";
                    const cells = (
                      <>
                        {isRevenueTab ? (
                          <td>
                            <span className="pill pill--vendor-pending">{row.kindLabel}</span>
                          </td>
                        ) : null}
                        <td>
                          <span className="data-table__strong">{row.transactionId}</span>
                        </td>
                        <td>
                          <span className="data-table__strong">{row.orderId}</span>
                        </td>
                        <td>{row.customer}</td>
                        <td>{row.vendor}</td>
                        {isOrderTab ? (
                          <>
                            <td>{formatAmount(row.adminCommission)}</td>
                            <td>{formatAmount(row.vendorAmount)}</td>
                            <td>{formatAmount(row.shippingCharge)}</td>
                            <td>{formatAmount(row.totalAmount)}</td>
                          </>
                        ) : (
                          <td>{formatAmount(row.amount)}</td>
                        )}
                        <td>{String(row.method || "—").replace("_", " ")}</td>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <div className="row-actions">
                            {detailTo ? (
                              <Link to={detailTo} relative="path" className="icon-btn icon-btn--view" title="View details">
                                <IoEyeSharp size={18} />
                              </Link>
                            ) : (
                              <span className="user-cell__muted">—</span>
                            )}
                            {detailTo ? (
                              <button type="button" className="icon-btn icon-btn--invoice" title="Invoice / print" onClick={() => onInvoice(row)}>
                                <TbInvoice size={18} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </>
                    );
                    return detailTo ? (
                      <ClickableTableRow key={row.id} to={detailTo} relative="path">
                        {cells}
                      </ClickableTableRow>
                    ) : (
                      <tr key={row.id}>{cells}</tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <ListPagination page={page} pages={pages} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
