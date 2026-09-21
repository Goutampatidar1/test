import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
import { IoEyeSharp } from "react-icons/io5";
import { TbInvoice } from "react-icons/tb";
import { adminGetEcomOrderInvoicePdf, adminListEcomOrders, adminListVenueOrders } from "../../api/adminPayments.js";
import { logout } from "../../store/authSlice.js";
import { openAdminEcomOrderInvoicePdf, openOrderInvoice } from "../../utils/invoicePrint.js";
import { ListPagination } from "../../components/ListPagination.jsx";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";
import { ClickableTableRow } from "../../components/ClickableTableRow.jsx";

async function openEcomOrderInvoice(adminToken, row) {
  try {
    await openAdminEcomOrderInvoicePdf(
      (orderId) => adminGetEcomOrderInvoicePdf(adminToken, orderId),
      row._id
    );
  } catch (error) {
    await Swal.fire({
      icon: "error",
      title: "Invoice unavailable",
      text: error.message || "Could not open invoice PDF.",
    });
  }
}

const LIST_LIMIT = 10;

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toLocaleString()}`;
}

function formatPaymentStatus(value) {
  const status = String(value || "").toLowerCase();
  const labels = {
    paid: "Paid",
    partially_paid: "Partially paid",
    pending: "Pending",
    failed: "Failed",
    refunded: "Refunded",
    partially_refunded: "Partially refunded",
  };
  return labels[status] || value || "—";
}

const TABS = [
  { key: "order", label: "Order List" },
  { key: "booking", label: "Booking List" },
];

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function initialOrderTab(searchParams) {
  const tab = searchParams.get("tab");
  return tab === "booking" ? "booking" : "order";
}

export function OrderAndBookingPage() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [activeTab, setActiveTab] = useState(() => initialOrderTab(searchParams));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, orderStatus, dateFrom, dateTo]);

  const loadRows = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const payload = {
        page,
        limit: LIST_LIMIT,
        search: debouncedSearch || undefined,
        orderStatus: orderStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const result =
        activeTab === "order"
          ? await adminListEcomOrders(adminToken, payload)
          : await adminListVenueOrders(adminToken, payload);

      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setPages(result?.pagination?.pages ?? 1);
      setTotal(result?.pagination?.total ?? 0);
    } catch (error) {
      if (error?.status === 401) return dispatch(logout());
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: error.message || "Could not load records.",
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, adminToken, dateFrom, dateTo, debouncedSearch, dispatch, orderStatus, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const hasActiveFilters = Boolean(orderStatus || dateFrom || dateTo);

  const clearFilters = () => {
    setOrderStatus("");
    setDateFrom("");
    setDateTo("");
  };

  const orderKind = activeTab === "order" ? "ecom" : "venue";
  const isBookingTab = activeTab === "booking";

  const onInvoice = async (row) => {
    if (orderKind === "ecom") {
      await openEcomOrderInvoice(adminToken, row);
      return;
    }
    openOrderInvoice({ kind: orderKind, row });
  };

  return (
    <div className="user-page">
      <div className="page-card">
        <div className="page-card__head payment-head">
          <div>
            <h2 className="page-card__title">Order & Booking Management</h2>
          </div>
          <div className="page-card__actions">
            <AdminSearchField
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order or customer name..."
              aria-label="Search orders"
            />
          </div>
        </div>

        <div className="payment-tabs" role="tablist" aria-label="Order and booking tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`payment-tabs__item${activeTab === tab.key ? " is-active" : ""}`}
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="user-list-filters order-booking-filters">
          <select
            className="user-list-status-select"
            value={orderStatus}
            onChange={(e) => setOrderStatus(e.target.value)}
            aria-label="Filter by order status"
          >
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="order-booking-filters__date">
            <span className="order-booking-filters__date-label">From</span>
            <input
              type="date"
              className="user-list-date-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="order-booking-filters__date">
            <span className="order-booking-filters__date-label">To</span>
            <input
              type="date"
              className="user-list-date-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {hasActiveFilters ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Amount</th>
                {isBookingTab ? <th>Paid</th> : null}
                {isBookingTab ? <th>Remaining</th> : null}
                <th>Payment</th>
                <th>Order Status</th>
                <th>Date</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isBookingTab ? 10 : 8}>
                    <p className="table-placeholder">Loading records...</p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={isBookingTab ? 10 : 8}>
                    <p className="table-placeholder">No records found.</p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <ClickableTableRow key={row._id} to={`${orderKind}/${row._id}`} relative="path">
                    <td>
                      <span className="data-table__strong">{row.orderNumber || row._id}</span>
                    </td>
                    <td>{row.user?.name || "—"}</td>
                    <td>{Array.isArray(row.items) ? row.items.length : 0}</td>
                    <td>{formatAmount(row.grandTotal)}</td>
                    {isBookingTab ? (
                      <td>{formatAmount(row.amountPaid ?? row.payment?.amountPaid)}</td>
                    ) : null}
                    {isBookingTab ? (
                      <td>{formatAmount(row.remainingAmount ?? row.payment?.remainingAmount)}</td>
                    ) : null}
                    <td>
                      <span>{formatPaymentStatus(row.paymentStatus)}</span>
                    </td>
                    <td>
                      <span>{row.orderStatus || "—"}</span>
                    </td>
                    <td>{formatDate(row.createdAt || row.placedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`${orderKind}/${row._id}`} relative="path" className="icon-btn icon-btn--view" title="View details">
                          <IoEyeSharp size={18} />
                        </Link>
                        <button type="button" className="icon-btn icon-btn--invoice" title="Invoice / print" onClick={() => onInvoice(row)}>
                          <TbInvoice size={18} />
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
