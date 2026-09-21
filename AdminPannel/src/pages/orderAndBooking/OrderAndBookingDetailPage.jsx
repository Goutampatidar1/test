import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { TbInvoice } from "react-icons/tb";
import Swal from "sweetalert2";
import {
  adminAssignDriverToOrder,
  adminGetEcomOrderById,
  adminGetEcomOrderInvoicePdf,
  adminGetVenueOrderById,
  adminListAssignableDriversForOrder,
  adminUpdateEcomOrderStatus,
} from "../../api/adminPayments.js";
import { logout } from "../../store/authSlice.js";
import { AppImage } from "../../components/AppImage.jsx";
import { openAdminEcomOrderInvoicePdf, openOrderInvoice } from "../../utils/invoicePrint.js";
import { promptRejectionReason } from "../../utils/promptRejectionReason.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

const KINDS = new Set(["ecom", "venue"]);

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toLocaleString()}`;
}

function formatOrderStatusLabel(value) {
  const status = String(value || "").toLowerCase();
  const labels = {
    pending: "Pending",
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  return labels[status] || value || "—";
}

function isAdminFulfilledOrder(order) {
  if (order?.isAdminFulfilled === true) return true;
  if (order?.isAdminFulfilled === false) return false;
  const vendors = Array.isArray(order?.vendors) ? order.vendors.filter(Boolean) : [];
  if (vendors.length) return false;
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return false;
  return items.every((item) => {
    if (item?.vendor) return false;
    return String(item?.product?.role || "").toLowerCase() !== "vendor";
  });
}

function resolveAdminFulfillmentActions(order) {
  if (order?.adminFulfillment) return order.adminFulfillment;
  const orderStatus = String(order?.orderStatus || "pending").toLowerCase();
  const orderCancelled = orderStatus === "cancelled" || orderStatus === "refunded";
  const hasAssignedDriver = Boolean(order?.deliveryBoy || order?.assignedDriver);
  return {
    canAccept: !orderCancelled && orderStatus === "pending",
    canReject: !orderCancelled && orderStatus === "pending",
    canMarkOutForDelivery: !orderCancelled && ["confirmed", "processing"].includes(orderStatus),
    canMarkDelivered: !orderCancelled && orderStatus === "shipped" && !hasAssignedDriver,
  };
}

function formatPaymentStatusLabel(value) {
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

function VenuePaymentBreakdown({ order }) {
  const payment = order.payment ?? order.paymentSummary ?? order;
  const tokenPct = Number(payment.tokenAmountPercentage ?? order.tokenAmountPercentage) || 0;
  const tokenAmount = Number(payment.tokenAmount ?? order.tokenAmount) || 0;
  const amountPaid = Number(payment.amountPaid ?? order.amountPaid) || 0;
  const remainingAmount = Number(payment.remainingAmount ?? order.remainingAmount) || 0;
  const amountDueNow = Number(payment.amountDueNow ?? order.amountDueNow) || 0;

  return (
    <>
      <DetailRow label="Sub total" value={formatAmount(payment.subTotal ?? order.subTotal)} />
      <DetailRow label="Grand total" value={formatAmount(payment.grandTotal ?? order.grandTotal)} />
      {tokenPct > 0 ? <DetailRow label="Token %" value={`${tokenPct}%`} /> : null}
      {tokenAmount > 0 ? <DetailRow label="Token amount" value={formatAmount(tokenAmount)} /> : null}
      <DetailRow label="Amount paid" value={formatAmount(amountPaid)} />
      <DetailRow label="Remaining amount" value={formatAmount(remainingAmount)} />
      {amountDueNow > 0 ? <DetailRow label="Amount due now" value={formatAmount(amountDueNow)} /> : null}
    </>
  );
}

function OrderPricingSummary({ order, isVenue }) {
  const payment = order.payment ?? order.paymentSummary ?? order;
  const subTotal = Number(payment.subTotal ?? order.subTotal) || 0;
  const discountTotal = Number(payment.discountTotal ?? order.discountTotal) || 0;
  const taxTotal = Number(payment.taxTotal ?? order.taxTotal) || 0;
  const shippingCharge = Number(payment.shippingCharge ?? order.shippingCharge) || 0;
  const grandTotal = Number(payment.grandTotal ?? order.grandTotal) || 0;
  const tokenPct = Number(payment.tokenAmountPercentage ?? order.tokenAmountPercentage) || 0;
  const tokenAmount = Number(payment.tokenAmount ?? order.tokenAmount) || 0;
  const amountPaid = Number(payment.amountPaid ?? order.amountPaid) || 0;
  const remainingAmount = Number(payment.remainingAmount ?? order.remainingAmount) || 0;
  const amountDueNow = Number(payment.amountDueNow ?? order.amountDueNow) || 0;

  return (
    <div className="order-pricing-summary">
      <h3 className="order-pricing-summary__title">Order summary</h3>
      <dl className="order-pricing-summary__list">
        <div className="order-pricing-summary__row">
          <dt>Subtotal</dt>
          <dd>{formatAmount(subTotal)}</dd>
        </div>
        {discountTotal > 0 ? (
          <div className="order-pricing-summary__row">
            <dt>Discount</dt>
            <dd>−{formatAmount(discountTotal)}</dd>
          </div>
        ) : null}
        {taxTotal > 0 ? (
          <div className="order-pricing-summary__row">
            <dt>Tax</dt>
            <dd>{formatAmount(taxTotal)}</dd>
          </div>
        ) : null}
        {!isVenue ? (
          <div className="order-pricing-summary__row">
            <dt>Shipping charge</dt>
            <dd>{formatAmount(shippingCharge)}</dd>
          </div>
        ) : null}
        {isVenue && tokenPct > 0 ? (
          <div className="order-pricing-summary__row">
            <dt>Token ({tokenPct}%)</dt>
            <dd>{formatAmount(tokenAmount)}</dd>
          </div>
        ) : null}
        {isVenue ? (
          <>
            <div className="order-pricing-summary__row">
              <dt>Amount paid</dt>
              <dd>{formatAmount(amountPaid)}</dd>
            </div>
            <div className="order-pricing-summary__row">
              <dt>Remaining</dt>
              <dd>{formatAmount(remainingAmount)}</dd>
            </div>
            {amountDueNow > 0 ? (
              <div className="order-pricing-summary__row">
                <dt>Due now</dt>
                <dd>{formatAmount(amountDueNow)}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="order-pricing-summary__row order-pricing-summary__row--total">
          <dt>Grand total</dt>
          <dd>{formatAmount(grandTotal)}</dd>
        </div>
      </dl>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-row__label">{label}</span>
      <span className="user-detail-row__value">{value ?? "—"}</span>
    </div>
  );
}

function formatShippingAddress(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "—";

  const name = snapshot.fullName || snapshot.name || "";
  const phone = snapshot.phone || snapshot.mobileNumber || "";
  const addressLine =
    snapshot.fullAddress ||
    snapshot.addressLine ||
    [snapshot.houseNo, snapshot.buildingName, snapshot.roadName, snapshot.areaColony, snapshot.landmark]
      .filter(Boolean)
      .join(", ");
  const locality = [snapshot.city, snapshot.subDistrict, snapshot.state, snapshot.pincode].filter(Boolean).join(", ");

  const lines = [];
  if (name || phone) lines.push([name, phone].filter(Boolean).join(" · "));
  if (addressLine) lines.push(addressLine);
  if (locality) lines.push(locality);

  return lines.length ? lines.join("\n") : "—";
}

function isAdminAssignedDriver(order) {
  return order?.deliveryBoyAssignedBy === "admin" && Boolean(order?.assignedDriver || order?.deliveryBoy);
}

function isDriverAccepted(order) {
  const status = String(order?.driverDelivery?.status || "").toLowerCase();
  return ["accepted", "processing", "out_for_delivery", "delivered"].includes(status);
}

function hasDriverRejection(order) {
  const dd = order?.driverDelivery;
  if (!dd) return false;
  return Boolean(String(dd.rejectionReason || "").trim() || dd.rejectedAt || dd.status === "rejected");
}

function driverStatusLabel(order) {
  const dd = order?.driverDelivery;
  const status = String(dd?.status || "").toLowerCase();
  if (!status && dd?.rejectedAt) return "Rejected";
  const labels = {
    pending: "Pending acceptance",
    accepted: "Processing",
    processing: "Processing",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    rejected: "Rejected",
  };
  return labels[status] || status || "Pending acceptance";
}

function deliveryOtpLabel(deliveryOtp) {
  if (!deliveryOtp) return "—";
  if (deliveryOtp.otp) return deliveryOtp.otp;
  if (deliveryOtp.status === "verified") return "Verified";
  if (deliveryOtp.status === "cancelled") return "Cancelled";
  return "—";
}

export function OrderAndBookingDetailPage() {
  const { kind, orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [order, setOrder] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [assignableDrivers, setAssignableDrivers] = useState([]);
  const [assignMeta, setAssignMeta] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState("");

  const title = useMemo(() => {
    if (kind === "venue") return "Booking order details";
    if (kind === "ecom") return "Ecom order details";
    return "Order details";
  }, [kind]);

  useEffect(() => {
    if (!adminToken || !orderId || !KINDS.has(kind || "")) return;
    let cancelled = false;
    (async () => {
      setError("");
      setNotFound(false);
      try {
        const data = kind === "venue" ? await adminGetVenueOrderById(adminToken, orderId) : await adminGetEcomOrderById(adminToken, orderId);
        if (cancelled) return;
        if (!data?._id) {
          setNotFound(true);
          return;
        }
        setOrder(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load order.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, kind, orderId]);

  useEffect(() => {
    if (!adminToken || kind !== "ecom" || !order?._id) return;
    if (isAdminAssignedDriver(order) && isDriverAccepted(order) && !hasDriverRejection(order)) {
      return;
    }

    let cancelled = false;
    (async () => {
      setAssignLoading(true);
      try {
        const result = await adminListAssignableDriversForOrder(adminToken, order._id);
        if (cancelled) return;
        setAssignableDrivers(Array.isArray(result?.drivers) ? result.drivers : []);
        setAssignMeta(result);
        const assignedId =
          result?.assignedDriver?._id ||
          (order.deliveryBoyAssignedBy === "admin"
            ? order.deliveryBoy?._id || order.assignedDriver?._id || ""
            : "");
        const rejectedId = order.driverDelivery?.rejectedBy?._id
          ? String(order.driverDelivery.rejectedBy._id)
          : "";
        const nextId = assignedId ? String(assignedId) : "";
        setSelectedDriverId(nextId && nextId !== rejectedId ? nextId : "");
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        setAssignableDrivers([]);
        setAssignMeta({ message: e.message || "Could not load drivers." });
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, kind, order?._id, order?.deliveryBoyAssignedBy, order?.deliveryBoy, order?.driverDelivery?.status, order?.assignedDriver?._id]);

  if (!KINDS.has(kind || "")) {
    return <NotFoundPage />;
  }

  if (notFound) return <NotFoundPage />;

  if (error) {
    return (
      <div className="user-page">
        <p className="user-list-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("../..", { relative: "path" })}>
          Back to orders
        </button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading order…</p>
      </div>
    );
  }

  const isVenue = kind === "venue";
  const items = Array.isArray(order.items) ? order.items : [];
  const adminAssignedDriver = isAdminAssignedDriver(order)
    ? order.assignedDriver || order.deliveryBoy || assignMeta?.assignedDriver || null
    : null;
  const deliveryLocation = order.deliveryLocation || assignMeta?.location || null;
  const driverAccepted = Boolean(adminAssignedDriver && isDriverAccepted(order));
  const driverRejected = hasDriverRejection(order);
  const rejectedDriver = order.driverDelivery?.rejectedBy || null;
  const canAssignDriver =
    !isVenue && !["cancelled", "refunded", "delivered"].includes(String(order.orderStatus || "").toLowerCase());
  const showAssignControls = canAssignDriver && (!driverAccepted || driverRejected);
  const rejectedDriverId = rejectedDriver?._id ? String(rejectedDriver._id) : "";
  const otherDrivers = assignableDrivers.filter((driver) => String(driver._id) !== rejectedDriverId);
  const driversForAssign = otherDrivers.length ? otherDrivers : assignableDrivers;
  const shippingAddressText = formatShippingAddress(order.addressSnapshot);
  const vendors = Array.isArray(order.vendors) ? order.vendors.filter(Boolean) : [];
  const adminFulfilled = !isVenue && isAdminFulfilledOrder(order);
  const adminFulfillment = adminFulfilled ? resolveAdminFulfillmentActions(order) : null;
  const showAdminStatusActions = Boolean(
    adminFulfillment &&
      (adminFulfillment.canAccept ||
        adminFulfillment.canReject ||
        adminFulfillment.canMarkOutForDelivery ||
        adminFulfillment.canMarkDelivered)
  );

  const applyUpdatedOrder = (fresh) => {
    if (fresh?._id) setOrder(fresh);
  };

  const onAdminStatus = async (status, { reason, successTitle } = {}) => {
    if (!adminToken || !order?._id || statusSaving) return;
    setStatusSaving(status);
    setError("");
    try {
      const fresh = await adminUpdateEcomOrderStatus(adminToken, order._id, { status, reason });
      applyUpdatedOrder(fresh);
      await Swal.fire({ icon: "success", title: successTitle || "Order status updated", timer: 1500 });
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Update failed", text: e.message || "Could not update order status." });
    } finally {
      setStatusSaving("");
    }
  };

  const onAdminReject = async () => {
    const reason = await promptRejectionReason({
      title: "Reject order",
      text: "Please provide a reason for rejecting this admin product order.",
      confirmText: "Reject order",
    });
    if (!reason) return;
    await onAdminStatus("cancelled", { reason, successTitle: "Order rejected" });
  };

  const onAssignDriver = async () => {
    if (!adminToken || !selectedDriverId) return;
    setAssignSaving(true);
    setError("");
    try {
      await adminAssignDriverToOrder(adminToken, order._id, selectedDriverId);
      const fresh = await adminGetEcomOrderById(adminToken, order._id);
      if (fresh?._id) setOrder(fresh);
      await Swal.fire({ icon: "success", title: "Driver assigned", timer: 1500 });
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Assign failed", text: e.message || "Could not assign driver." });
    } finally {
      setAssignSaving(false);
    }
  };

  const onInvoice = async () => {
    if (kind === "ecom") {
      try {
        await openAdminEcomOrderInvoicePdf(
          (id) => adminGetEcomOrderInvoicePdf(adminToken, id),
          order._id
        );
      } catch (e) {
        if (e?.status === 401) return dispatch(logout());
        setError(e.message || "Could not open invoice PDF.");
        await Swal.fire({
          icon: "error",
          title: "Invoice unavailable",
          text: e.message || "Could not open invoice PDF.",
        });
      }
      return;
    }
    openOrderInvoice({ kind, row: order });
  };

  return (
    <div className="user-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate("../..", { relative: "path" })}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div className="user-page__toolbar-text">
          <h2 className="user-page__title">{title}</h2>
          <p className="user-page__subtitle" style={{ opacity: 0.75, fontSize: "0.875rem", margin: 0 }}>
            {order.orderNumber || orderId}
          </p>
        </div>
        <div className="user-page__toolbar-actions">
          <button type="button" className="icon-btn icon-btn--invoice" title="Invoice / print" onClick={onInvoice}>
            <TbInvoice size={20} />
          </button>
          <Link to="../.." relative="path" className="btn btn--ghost">
            Order list
          </Link>
        </div>
      </div>

      <div className="page-card user-view-card">
        <div className="user-view-head">
          <div className="user-view-grid">
            <DetailRow label="Order number" value={order.orderNumber} />
            <DetailRow label="Customer" value={order.user?.name} />
            <DetailRow label="Phone" value={order.user?.phone} />
            <DetailRow label="Email" value={order.user?.email} />
            <DetailRow label="Payment method" value={order.paymentMethod} />
            <DetailRow label="Payment status" value={formatPaymentStatusLabel(order.paymentStatus)} />
            <DetailRow label="Order status" value={formatOrderStatusLabel(order.orderStatus)} />
            <DetailRow label="Placed at" value={formatDateTime(order.placedAt || order.createdAt)} />
            {isVenue ? (
              <VenuePaymentBreakdown order={order} />
            ) : (
              <DetailRow label="Grand total" value={formatAmount(order.grandTotal)} />
            )}
            {!isVenue ? <DetailRow label="Shipping charge" value={formatAmount(order.shippingCharge)} /> : null}
            {!isVenue ? (
              <DetailRow
                label="Customer sub-district"
                value={deliveryLocation?.subDistrict || order.addressSnapshot?.subDistrict || order.user?.subDistrict || "—"}
              />
            ) : (
              <DetailRow
                label="Address"
                value={<span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{shippingAddressText}</span>}
              />
            )}
            {!isVenue ? (
              <DetailRow
                label="Delivery OTP"
                value={
                  <span>
                    <strong>{deliveryOtpLabel(order.deliveryOtp)}</strong>
                    {order.deliveryOtp?.status && order.deliveryOtp.status !== "active" ? (
                      <span style={{ display: "block", opacity: 0.75, fontSize: "0.8125rem", marginTop: "0.15rem" }}>
                        Status: {order.deliveryOtp.status}
                        {order.deliveryOtp.verifiedAt ? ` · ${formatDateTime(order.deliveryOtp.verifiedAt)}` : ""}
                      </span>
                    ) : null}
                  </span>
                }
              />
            ) : null}
          </div>
        </div>

        {adminFulfilled ? (
          <div className="order-fulfillment">
            <h3>Fulfillment</h3>
            <p className="order-fulfillment__hint">
              These items are sold by admin. Update the order status here the same way a vendor updates their orders.
            </p>
            {showAdminStatusActions ? (
              <div className="order-fulfillment__actions">
                {adminFulfillment.canAccept ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={Boolean(statusSaving)}
                    onClick={() => onAdminStatus("confirmed", { successTitle: "Order accepted" })}
                  >
                    {statusSaving === "confirmed" ? "Accepting…" : "Accept"}
                  </button>
                ) : null}
                {adminFulfillment.canReject ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm order-fulfillment__reject"
                    disabled={Boolean(statusSaving)}
                    onClick={onAdminReject}
                  >
                    {statusSaving === "cancelled" ? "Rejecting…" : "Reject"}
                  </button>
                ) : null}
                {adminFulfillment.canMarkOutForDelivery ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={Boolean(statusSaving)}
                    onClick={() => onAdminStatus("shipped", { successTitle: "Marked out for delivery" })}
                  >
                    {statusSaving === "shipped" ? "Updating…" : "Out For Delivery"}
                  </button>
                ) : null}
                {adminFulfillment.canMarkDelivered ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={Boolean(statusSaving)}
                    onClick={() => onAdminStatus("delivered", { successTitle: "Marked delivered" })}
                  >
                    {statusSaving === "delivered" ? "Updating…" : "Mark Delivered"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="user-cell__muted" style={{ margin: 0 }}>
                {order.deliveryBoy || order.assignedDriver
                  ? "Assigned driver will mark this order as delivered."
                  : "No further status updates are available."}
              </p>
            )}
          </div>
        ) : null}

        {!isVenue ? (
          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Shipping address</h3>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
              {shippingAddressText}
            </p>
          </div>
        ) : null}

        {!isVenue && vendors.length > 0 ? (
          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Vendor{vendors.length > 1 ? "s" : ""}</h3>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {vendors.map((vendor) => (
                <div key={vendor._id} style={{ lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 0.35rem" }}>
                    <strong>{vendor.name || "—"}</strong>
                    {vendor.contactName && vendor.contactName !== vendor.name ? (
                      <span className="user-cell__muted"> · {vendor.contactName}</span>
                    ) : null}
                  </p>
                  <p className="user-cell__muted" style={{ margin: 0 }}>
                    {vendor.phone ? `Phone: ${vendor.phone}` : "Phone: —"}
                    {vendor.email ? ` · Email: ${vendor.email}` : ""}
                  </p>
                  <Link to={`/admin/vendors/${vendor._id}`} className="btn btn--ghost btn--sm" style={{ marginTop: "0.35rem" }}>
                    View vendor profile
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!isVenue && (canAssignDriver || adminAssignedDriver || driverRejected) ? (
          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Driver</h3>
            {driverRejected ? (
              <div
                style={{
                  marginBottom: adminAssignedDriver || showAssignControls ? "0.75rem" : 0,
                  padding: "0.75rem 1rem",
                  borderRadius: 8,
                  background: "rgba(220, 38, 38, 0.06)",
                  border: "1px solid rgba(220, 38, 38, 0.15)",
                }}
              >
                <p style={{ margin: "0 0 0.35rem", fontWeight: 600, color: "#b91c1c" }}>Delivery rejected by driver</p>
                {rejectedDriver?.name ? (
                  <p style={{ margin: "0 0 0.35rem", wordBreak: "break-word" }}>
                    <strong>{rejectedDriver.name}</strong>
                    {rejectedDriver.phone ? ` · ${rejectedDriver.phone}` : ""}
                  </p>
                ) : null}
                <p style={{ margin: "0 0 0.35rem" }}>
                  <span className="user-detail-row__label">Reason: </span>
                  <span>{order.driverDelivery?.rejectionReason || "—"}</span>
                </p>
                {order.driverDelivery?.rejectedAt ? (
                  <p className="user-cell__muted" style={{ margin: 0 }}>
                    Rejected at: {formatDateTime(order.driverDelivery.rejectedAt)}
                  </p>
                ) : null}
                {showAssignControls ? (
                  <div style={{ marginTop: "0.85rem" }}>
                    {assignLoading ? (
                      <p className="static-cms-loading" style={{ margin: 0 }}>
                        Loading drivers…
                      </p>
                    ) : (
                      <>
                        <p className="user-cell__muted" style={{ margin: "0 0 0.6rem" }}>
                          Assign a new driver to continue this delivery.
                        </p>
                        <div
                          className="page-card__actions"
                          style={{ justifyContent: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}
                        >
                          <select
                            className="user-list-status-select"
                            value={selectedDriverId}
                            onChange={(e) => setSelectedDriverId(e.target.value)}
                            disabled={assignSaving}
                          >
                            <option value="">
                              {driversForAssign.length ? "Select new driver" : "No drivers available"}
                            </option>
                            {driversForAssign.map((driver) => (
                              <option key={driver._id} value={driver._id}>
                                {driver.name}
                                {driver.phone ? ` · ${driver.phone}` : ""}
                                {driver.subDistrict ? ` · ${driver.subDistrict}` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn--accent"
                            disabled={!selectedDriverId || assignSaving || !driversForAssign.length}
                            onClick={onAssignDriver}
                          >
                            {assignSaving ? "Assigning…" : "Assign new driver"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            {adminAssignedDriver ? (
              <div style={{ marginBottom: driverAccepted ? 0 : "0.75rem" }}>
                <p style={{ margin: "0 0 0.35rem" }}>
                  <strong>{adminAssignedDriver.name}</strong>
                  {adminAssignedDriver.phone ? ` · ${adminAssignedDriver.phone}` : ""}
                </p>
                <p className="user-cell__muted" style={{ margin: 0 }}>
                  Status: {driverStatusLabel(order)}
                  {adminAssignedDriver.subDistrict ? ` · ${adminAssignedDriver.subDistrict}` : ""}
                </p>
              </div>
            ) : null}

            {showAssignControls && !driverRejected ? (
              assignLoading ? (
                <p className="static-cms-loading">Loading drivers for this sub-district…</p>
              ) : (
                <>
                  {!adminAssignedDriver ? (
                    <p className="user-cell__muted" style={{ margin: "0 0 0.75rem" }}>
                      {driverRejected
                        ? "Choose another driver to assign this delivery."
                        : assignMeta?.message ||
                          (deliveryLocation?.subDistrict
                            ? `Showing active approved drivers in ${deliveryLocation.subDistrict}.`
                            : "Set the customer sub-district to filter drivers.")}
                    </p>
                  ) : null}
                  <div className="page-card__actions" style={{ justifyContent: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                    <select
                      className="user-list-status-select"
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      disabled={assignSaving}
                    >
                      <option value="">
                        {driversForAssign.length ? "Select driver" : "No other drivers available"}
                      </option>
                      {driversForAssign.map((driver) => (
                        <option key={driver._id} value={driver._id}>
                          {driver.name}
                          {driver.phone ? ` · ${driver.phone}` : ""}
                          {driver.subDistrict ? ` · ${driver.subDistrict}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--accent"
                      disabled={!selectedDriverId || assignSaving || !driversForAssign.length}
                      onClick={onAssignDriver}
                    >
                      {assignSaving
                        ? "Assigning…"
                        : driverRejected
                          ? "Assign new driver"
                          : adminAssignedDriver
                            ? "Change driver"
                            : "Assign driver"}
                    </button>
                  </div>
                </>
              )
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Line items</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  {isVenue ? <th>Service</th> : <th>SKU</th>}
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                  {isVenue ? <th>Booking</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={isVenue ? 6 : 5}>
                      <p className="table-placeholder">No items.</p>
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const thumb = !isVenue
                      ? item.product?.thumbnail || item.thumbnail || item.image
                      : item.venue?.thumbnail || item.thumbnail;
                    const venueName = isVenue ? item.venue?.name || item.name : null;
                    return (
                      <tr key={`${idx}-${item.name}`}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <AppImage
                              src={thumb}
                              alt=""
                              width={40}
                              height={40}
                              style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                            />
                            <span>
                              {item.name}
                              {!isVenue ? (
                                <span className="user-cell__muted" style={{ display: "block", fontWeight: 500 }}>
                                  Sold by: {item.vendor?.businessName || item.vendor?.name || (item.product?.role === "Vendor" ? "Vendor" : "Admin")}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td>{isVenue ? venueName : item.sku || "—"}</td>
                        <td>{item.quantity}</td>
                        <td>{formatAmount(item.unitPrice)}</td>
                        <td>{formatAmount(item.totalPrice)}</td>
                        {isVenue ? (
                          <td>
                            <span style={{ whiteSpace: "nowrap" }}>{formatDateTime(item.bookingDate)}</span>
                            {item.bookingSlot ? (
                              <span style={{ display: "block", opacity: 0.75, fontSize: "0.8125rem" }}>{item.bookingSlot}</span>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <OrderPricingSummary order={order} isVenue={isVenue} />
        </div>
      </div>
    </div>
  );
}
