import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { vendorListBookings } from "../../api/vendorBookings.js";
import { VendorSearchField, VendorToolbarSelect } from "../../components/VendorSearchField.jsx";
import { formatInr } from "../../utils/venueListMapper.js";

function StatusBadge({ status }) {
  const labels = {
    confirmed: "Confirmed",
    pending: "Pending",
    cancelled: "Cancelled",
  };
  return <span className={`vendor-dash-badge vendor-dash-badge--${status}`}>{labels[status] ?? status}</span>;
}

function PaymentBadge({ status }) {
  const labels = {
    paid: "Paid",
    partially_paid: "Partially paid",
    pending: "Pending",
    refunded: "Refunded",
  };
  return <span className={`vendor-booking-pay vendor-booking-pay--${status}`}>{labels[status] ?? status}</span>;
}

export function BookingsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const statusFilter = searchParams.get("status") || "all";
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await vendorListBookings({
        limit: 100,
        status: statusFilter,
        search,
      });
      setBookings(result?.bookings ?? []);
    } catch (err) {
      setBookings([]);
      setError(err?.message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(loadBookings, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadBookings, search]);

  const filtered = useMemo(() => bookings, [bookings]);

  return (
    <div className="vendor-bookings-page">
      <header className="vendor-venues-page__head">
        <div>
          <h1 className="vendor-venues-page__title">Booking Management</h1>
          <p className="vendor-venues-page__subtitle">View and manage all service bookings</p>
        </div>
      </header>

      <div className="vendor-list-toolbar">
        <VendorSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, customer, or service..."
          aria-label="Search bookings"
        />
        <VendorToolbarSelect
          value={statusFilter}
          onChange={(e) => {
            const value = e.target.value;
            const next = new URLSearchParams(searchParams);
            if (value === "all") next.delete("status");
            else next.set("status", value);
            setSearchParams(next);
          }}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </VendorToolbarSelect>
      </div>

      {error ? <p className="vendor-bookings-error">{error}</p> : null}

      <section className="vendor-dash-panel vendor-bookings-panel">
        <div className="vendor-dash-table-wrap">
          <table className="vendor-dash-table vendor-bookings-table">
            <thead>
              <tr>
                <th>BOOKING ID</th>
                <th>CUSTOMER</th>
                <th>SERVICE</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>PAID</th>
                <th>REMAINING</th>
                <th>STATUS</th>
                <th>PAYMENT</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="vendor-bookings-empty">
                    Loading bookings…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="vendor-bookings-empty">
                    No bookings match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.orderId ?? row.id}>
                    <td className="vendor-dash-table__id">{row.id}</td>
                    <td>{row.customer}</td>
                    <td>{row.venue}</td>
                    <td>{row.date}</td>
                    <td>{formatInr(row.amount ?? row.grandTotal)}</td>
                    <td>{formatInr(row.amountPaid ?? row.payment?.amountPaid ?? 0)}</td>
                    <td>{formatInr(row.remainingAmount ?? row.payment?.remainingAmount ?? 0)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <PaymentBadge status={row.paymentStatus} />
                    </td>
                    <td className="vendor-bookings-table__action">
                      <Link
                        to={`/vendor/bookings/${encodeURIComponent(row.orderId ?? row.id)}`}
                        className="vendor-bookings-view-link"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
