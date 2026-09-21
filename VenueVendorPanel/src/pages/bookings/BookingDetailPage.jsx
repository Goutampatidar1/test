import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import api from "../../api.js";
import {
  vendorGetBookingById,
  vendorUpdateBookingStatus,
} from "../../api/vendorBookings.js";
import { formatInr } from "../../utils/venueListMapper.js";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "cancelled", label: "Cancelled" },
];

function InfoRow({ label, value, icon }) {
  return (
    <div className="vendor-booking-info-row">
      {icon ? <span className="vendor-booking-info-row__icon" aria-hidden="true">{icon}</span> : null}
      <div>
        <dt className="vendor-booking-info-row__label">{label}</dt>
        <dd className="vendor-booking-info-row__value">{value}</dd>
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v16H4z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState("pending");
  const [saving, setSaving] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    try {
      const booking = await vendorGetBookingById(id);
      if (!booking) {
        setNotFound(true);
        return;
      }
      setDetail(booking);
      setStatus(booking.orderStatus ?? booking.status ?? "pending");
    } catch (err) {
      if (err?.status === 404) {
        setNotFound(true);
      } else {
        Swal.fire({
          icon: "error",
          title: "Could not load booking",
          text: err?.message || "Please try again.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  if (notFound) {
    return <Navigate to="/vendor/bookings" replace />;
  }

  if (loading || !detail) {
    return (
      <div className="vendor-booking-detail-page">
        <p className="vendor-bookings-empty">Loading booking details…</p>
      </div>
    );
  }

  const handleStatusSave = async () => {
    setSaving(true);
    try {
      const updated = await vendorUpdateBookingStatus(id, status);
      setDetail(updated);
      setStatus(updated.orderStatus ?? updated.status ?? status);
      Swal.fire({
        icon: "success",
        title: "Status updated",
        text: `Booking ${detail.id} is now ${status}.`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Update failed",
        text: err?.message || "Could not update booking status.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadInvoice = async () => {
    try {
      const response = await api.get(
        `/venue-vendor/bookings/${encodeURIComponent(id)}/invoice?format=pdf`,
        { responseType: "blob" },
      );
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${detail.id || "booking"}-invoice.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Invoice download failed",
        text: err?.message || "Could not download invoice.",
      });
    }
  };

  const payStatus = detail.payment.status;
  const pay = detail.payment;

  return (
    <div className="vendor-booking-detail-page">
      <header className="vendor-venues-page__head vendor-venues-page__head--form vendor-booking-detail__head">
        <div className="vendor-venues-page__title-row">
          <Link to="/vendor/bookings" className="vendor-venues-back" aria-label="Back to bookings">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="vendor-venues-page__title">Booking Details</h1>
            <p className="vendor-venues-page__subtitle">Booking ID: {detail.id}</p>
          </div>
        </div>
        <div className="vendor-venues-page__head-actions">
          <button type="button" className="vendor-booking-invoice-btn" onClick={handleDownloadInvoice}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download Invoice
          </button>
        </div>
      </header>

      <div className="vendor-booking-detail__grid">
        <div className="vendor-booking-detail__main">
          <section className="vendor-booking-card">
            <h2 className="vendor-booking-card__title">Service Information</h2>
            <dl className="vendor-booking-card__body">
              <InfoRow label="Service Name" value={detail.venue.name} />
              <InfoRow label="Category" value={detail.venue.category} />
              <InfoRow label="Location" value={detail.venue.location} icon={<PinIcon />} />
              <InfoRow label="Full Address" value={detail.venue.address} />
            </dl>
          </section>

          <section className="vendor-booking-card">
            <h2 className="vendor-booking-card__title">Customer Information</h2>
            <dl className="vendor-booking-card__body">
              <InfoRow label="Name" value={detail.customer.name} icon={<UserIcon />} />
              <InfoRow label="Email" value={detail.customer.email} icon={<MailIcon />} />
              <InfoRow label="Phone" value={detail.customer.phone} icon={<PhoneIcon />} />
              <InfoRow label="Address" value={detail.customer.address} icon={<PinIcon />} />
            </dl>
          </section>

          <section className="vendor-booking-card">
            <h2 className="vendor-booking-card__title">Booking Details</h2>
            <dl className="vendor-booking-card__body vendor-booking-card__body--grid">
              <InfoRow label="Booking Date" value={detail.booking.date} />
              <InfoRow label="Booking Time" value={detail.booking.time} />
              <InfoRow label="Number of Guests" value={String(detail.booking.guests)} />
              <InfoRow label="Booked On" value={detail.booking.bookedOn} />
              <div className="vendor-booking-info-row vendor-booking-info-row--full">
                <div>
                  <dt className="vendor-booking-info-row__label">Special Requests</dt>
                  <dd className="vendor-booking-info-row__value vendor-booking-info-row__value--block">
                    {detail.booking.specialRequests}
                  </dd>
                </div>
              </div>
            </dl>
          </section>
        </div>

        <aside className="vendor-booking-detail__side">
          <section className="vendor-booking-card">
            <h2 className="vendor-booking-card__title">Booking Status</h2>
            <div className="vendor-booking-status-form">
              <label className="vendor-venue-form-field__label" htmlFor="booking-status">
                Booking Status
              </label>
              <select
                id="booking-status"
                className="vendor-venue-input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="vendor-booking-save-btn"
                onClick={handleStatusSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Update Status"}
              </button>
            </div>
          </section>

          <section className="vendor-booking-card">
            <h2 className="vendor-booking-card__title">Payment Details</h2>
            <dl className="vendor-booking-payment">
              <div className="vendor-booking-payment__row">
                <dt>Base Price</dt>
                <dd>{formatInr(pay.basePrice)}</dd>
              </div>
              <div className="vendor-booking-payment__row">
                <dt>Tax &amp; Fees</dt>
                <dd>{formatInr(pay.taxFees)}</dd>
              </div>
              <div className="vendor-booking-payment__row vendor-booking-payment__row--total">
                <dt>Total Amount</dt>
                <dd>{formatInr(pay.total ?? pay.grandTotal)}</dd>
              </div>
              {Number(pay.tokenAmountPercentage) > 0 ? (
                <div className="vendor-booking-payment__row">
                  <dt>Token ({pay.tokenAmountPercentage}%)</dt>
                  <dd>{formatInr(pay.tokenAmount)}</dd>
                </div>
              ) : null}
              <div className="vendor-booking-payment__row">
                <dt>Amount Paid</dt>
                <dd>{formatInr(pay.amountPaid)}</dd>
              </div>
              <div className="vendor-booking-payment__row">
                <dt>Remaining Amount</dt>
                <dd>{formatInr(pay.remainingAmount)}</dd>
              </div>
              {Number(pay.amountDueNow) > 0 ? (
                <div className="vendor-booking-payment__row">
                  <dt>Amount Due Now</dt>
                  <dd>{formatInr(pay.amountDueNow)}</dd>
                </div>
              ) : null}
              <div className="vendor-booking-payment__row">
                <dt>Payment Method</dt>
                <dd>{pay.method}</dd>
              </div>
              <div className="vendor-booking-payment__row">
                <dt>Payment Status</dt>
                <dd>
                  <span className={`vendor-booking-pay vendor-booking-pay--${payStatus}`}>
                    {pay.statusLabel ||
                      (payStatus === "paid"
                        ? "Paid"
                        : payStatus === "partially_paid"
                          ? "Partially paid"
                          : payStatus === "refunded"
                            ? "Refunded"
                            : payStatus === "pending"
                              ? "Pending"
                              : payStatus)}
                  </span>
                </dd>
              </div>
              <div className="vendor-booking-payment__row">
                <dt>Transaction ID</dt>
                <dd className="vendor-booking-payment__txn">{detail.payment.transactionId}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
