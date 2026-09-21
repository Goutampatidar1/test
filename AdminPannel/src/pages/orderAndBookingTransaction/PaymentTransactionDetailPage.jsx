import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { TbInvoice } from "react-icons/tb";
import {
  adminGetEcomTransactionById,
  adminGetRechargeTransactionById,
  adminGetVenueTransactionById,
} from "../../api/adminPayments.js";
import { logout } from "../../store/authSlice.js";
import { openTransactionInvoiceFromDetail } from "../../utils/invoicePrint.js";
import { NotFoundPage } from "../NotFoundPage.jsx";

const KINDS = new Set(["ecom", "venue", "recharge"]);

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

function DetailRow({ label, value }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-row__label">{label}</span>
      <span className="user-detail-row__value">{value ?? "—"}</span>
    </div>
  );
}

export function PaymentTransactionDetailPage() {
  const { kind, transactionId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);

  const [tx, setTx] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    if (kind === "recharge") return "Recharge payment details";
    if (kind === "venue") return "Booking payment details";
    if (kind === "ecom") return "Order payment details";
    return "Payment details";
  }, [kind]);

  useEffect(() => {
    if (!adminToken || !transactionId || !KINDS.has(kind || "")) return;
    let cancelled = false;
    (async () => {
      setError("");
      setNotFound(false);
      try {
        let data = null;
        if (kind === "ecom") data = await adminGetEcomTransactionById(adminToken, transactionId);
        else if (kind === "venue") data = await adminGetVenueTransactionById(adminToken, transactionId);
        else data = await adminGetRechargeTransactionById(adminToken, transactionId);

        if (cancelled) return;
        if (!data?._id) {
          setNotFound(true);
          return;
        }
        setTx(data);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) return dispatch(logout());
        if (e?.status === 404) return setNotFound(true);
        setError(e.message || "Failed to load transaction.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, dispatch, kind, transactionId]);

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
          Back to payments
        </button>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="user-page">
        <p className="static-cms-loading">Loading transaction…</p>
      </div>
    );
  }

  const orderLink =
    kind !== "recharge" && tx.order?._id ? (
      <Link to={`../../../orders/${kind}/${tx.order._id}`} relative="path" style={{ textDecoration: "none" }}>
        {tx.order.orderNumber || tx.order._id}
      </Link>
    ) : null;

  const recharge = kind === "recharge" ? tx.recharge : null;

  const onInvoice = () => {
    openTransactionInvoiceFromDetail(kind, tx);
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
            {tx.transactionId || transactionId}
          </p>
        </div>
        <div className="user-page__toolbar-actions">
          <button type="button" className="icon-btn icon-btn--invoice" title="Invoice / print" onClick={onInvoice}>
            <TbInvoice size={20} />
          </button>
          <Link to="../.." relative="path" className="btn btn--ghost">
            Payment list
          </Link>
        </div>
      </div>

      <div className="page-card user-view-card">
        <div className="user-view-head">
          <div className="user-view-grid">
            <DetailRow label="Transaction ID" value={tx.transactionId} />
            <DetailRow label="Status" value={tx.status} />
            <DetailRow label="Type" value={tx.type} />
            <DetailRow label="Amount" value={formatAmount(tx.amount)} />
            <DetailRow label="Payment method" value={String(tx.paymentMethod || "—").replace(/_/g, " ")} />
            <DetailRow label="Customer" value={tx.user?.name} />
            <DetailRow label="Phone" value={tx.user?.phone} />
            <DetailRow label="Email" value={tx.user?.email} />
            <DetailRow label="Gateway" value={tx.gateway} />
            <DetailRow label="Gateway order ID" value={tx.gatewayOrderId} />
            <DetailRow label="Gateway payment ID" value={tx.gatewayPaymentId} />
            <DetailRow label="Remarks" value={tx.remarks || "—"} />
            <DetailRow label="Created" value={formatDateTime(tx.createdAt)} />
            <DetailRow label="Processed" value={formatDateTime(tx.processedAt)} />
            {kind !== "recharge" ? (
              <>
                <DetailRow label="Linked order" value={orderLink || tx.order?.orderNumber || "—"} />
                {tx.order ? <DetailRow label="Order total" value={formatAmount(tx.order.grandTotal)} /> : null}
                {tx.order ? <DetailRow label="Order status" value={tx.order.orderStatus} /> : null}
                {tx.order ? <DetailRow label="Order payment" value={tx.order.paymentStatus} /> : null}
                {kind === "ecom" && tx.paymentSummary ? (
                  <>
                    <DetailRow label="Vendor" value={tx.paymentSummary.vendorName} />
                    <DetailRow label="Admin commission" value={formatAmount(tx.paymentSummary.adminCommission)} />
                    <DetailRow label="Vendor amount" value={formatAmount(tx.paymentSummary.vendorAmount)} />
                    <DetailRow label="Shipping charge" value={formatAmount(tx.paymentSummary.shippingCharge)} />
                    <DetailRow label="Total amount" value={formatAmount(tx.paymentSummary.totalAmount)} />
                  </>
                ) : null}
              </>
            ) : null}
            {recharge ? (
              <>
                <DetailRow label="Recharge type" value={recharge.type} />
                <DetailRow label="Contact" value={recharge.contactNumber} />
                <DetailRow label="Recharge amount" value={formatAmount(recharge.amount)} />
                <DetailRow label="Provider" value={recharge.provider} />
                <DetailRow label="Reference ID" value={recharge.referenceId} />
                <DetailRow label="Recharge status" value={recharge.status} />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
