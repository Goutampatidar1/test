import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IoEyeSharp } from "react-icons/io5";
import { TbInvoice } from "react-icons/tb";
import Swal from "sweetalert2";
import { adminGetEcomOrderInvoicePdf, adminListEcomOrders, adminListVenueOrders } from "../api/adminPayments.js";
import { ListPagination } from "./ListPagination.jsx";
import { ClickableTableRow } from "./ClickableTableRow.jsx";
import { openAdminEcomOrderInvoicePdf, openOrderInvoice } from "../utils/invoicePrint.js";

const LIST_LIMIT = 10;

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

export function VendorOrdersSection({ adminToken, kind = "ecom", ownerId, title, subtitle, onUnauthorized }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [orderStatus, setOrderStatus] = useState("");

  const orderKind = kind === "venue" ? "venue" : "ecom";
  const sectionTitle = title || (kind === "venue" ? "Bookings" : "Orders");
  const sectionSubtitle =
    subtitle ||
    (kind === "venue"
      ? "Service bookings linked to this vendor's services"
      : "E-commerce orders containing this vendor's products");

  const loadRows = useCallback(async () => {
    if (!adminToken || !ownerId) return;
    setLoading(true);
    try {
      const payload = {
        page,
        limit: LIST_LIMIT,
        orderStatus: orderStatus || undefined,
        ...(kind === "venue" ? { venueVendorId: ownerId } : { vendorId: ownerId }),
      };
      const result =
        kind === "venue"
          ? await adminListVenueOrders(adminToken, payload)
          : await adminListEcomOrders(adminToken, payload);

      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setPages(result?.pagination?.pages ?? 1);
      setTotal(result?.pagination?.total ?? 0);
    } catch (error) {
      if (error?.status === 401) {
        if (typeof onUnauthorized === "function") onUnauthorized();
        return;
      }
      await Swal.fire({
        icon: "error",
        title: "Load failed",
        text: error.message || "Could not load orders.",
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, kind, onUnauthorized, orderStatus, ownerId, page]);

  useEffect(() => {
    setPage(1);
  }, [orderStatus, ownerId, kind]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const onInvoice = async (row) => {
    if (orderKind === "ecom") {
      await openEcomOrderInvoice(adminToken, row);
      return;
    }
    openOrderInvoice({ kind: orderKind, row });
  };

  return (
    <section className="vendor-read-section vendor-detail-page__orders border-top pt-3 pt-md-4 mt-3 mt-md-4">
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-md-between gap-2 gap-md-3 mb-3">
        <div>
          <h3 className="vendor-read-section__title mb-1">{sectionTitle}</h3>
          <p className="vendor-read-section__sub mb-0">{sectionSubtitle}</p>
        </div>
        <select
          className="user-list-status-select"
          value={orderStatus}
          onChange={(e) => setOrderStatus(e.target.value)}
          aria-label="Filter orders by status"
        >
          {ORDER_STATUS_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{kind === "venue" ? "Booking" : "Order"}</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Date</th>
              <th className="data-table__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <p className="table-placeholder">Loading orders…</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <p className="table-placeholder">No orders found for this vendor.</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ClickableTableRow key={row._id} to={`/admin/orders/${orderKind}/${row._id}`}>
                  <td>
                    <span className="data-table__strong">{row.orderNumber || row._id}</span>
                  </td>
                  <td>{row.user?.name || "—"}</td>
                  <td>{Array.isArray(row.items) ? row.items.length : 0}</td>
                  <td>{formatAmount(row.grandTotal)}</td>
                  <td>{row.paymentStatus || "—"}</td>
                  <td>{row.orderStatus || "—"}</td>
                  <td>{formatDate(row.createdAt || row.placedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <Link
                        to={`/admin/orders/${orderKind}/${row._id}`}
                        className="icon-btn icon-btn--view"
                        title="View details"
                      >
                        <IoEyeSharp size={18} />
                      </Link>
                      <button
                        type="button"
                        className="icon-btn icon-btn--invoice"
                        title="Invoice / print"
                        onClick={() => onInvoice(row)}
                      >
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
    </section>
  );
}
