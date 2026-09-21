import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { vendorEcomListOrders } from "../../api/vendorEcom.js";
import { OrderStatusBadge } from "../../components/ecom/OrderStatusBadge.jsx";
import { VendorSearchField, VendorToolbarSelect } from "../../components/VendorSearchField.jsx";
import { formatInr } from "../../utils/venueListMapper.js";

export function EcomOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "all";
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { items } = await vendorEcomListOrders({
        limit: 100,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setOrders(items ?? []);
    } catch (err) {
      setError(err.message || "Could not load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(loadOrders, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const id = String(order.orderDisplayId || order.orderNumber || order.orderId || "").toLowerCase();
      const customer = String(order.customerName || "").toLowerCase();
      const product = String(order.productName || "").toLowerCase();
      return id.includes(q) || customer.includes(q) || product.includes(q);
    });
  }, [orders, search]);

  return (
    <div className="vendor-bookings-page">
      <header className="vendor-venues-page__head">
        <div>
          <h1 className="vendor-venues-page__title">Order Management</h1>
          <p className="vendor-venues-page__subtitle">Track and manage customer orders for your shop</p>
        </div>
      </header>

      <div className="vendor-list-toolbar">
        <VendorSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order ID, customer, or product..."
          aria-label="Search orders"
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
          <option value="new">New</option>
          <option value="accepted">Accepted</option>
          <option value="out_for_delivery">Out for delivery</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </VendorToolbarSelect>
      </div>

      {error ? <p className="vendor-bookings-error">{error}</p> : null}

      <section className="vendor-dash-panel vendor-bookings-panel">
        <div className="vendor-dash-table-wrap">
          <table className="vendor-dash-table vendor-bookings-table">
            <thead>
              <tr>
                <th>ORDER ID</th>
                <th>CUSTOMER</th>
                <th>PRODUCT</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="vendor-bookings-empty">
                    Loading orders…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="vendor-bookings-empty">
                    {orders.length === 0
                      ? "No orders yet. New orders will appear here once customers start buying."
                      : "No orders match your search or filter."}
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.orderId ?? order.id}>
                    <td className="vendor-dash-table__id">
                      {order.orderDisplayId || order.orderNumber || order.orderId}
                    </td>
                    <td>{order.customerName || "—"}</td>
                    <td>{order.productName || "—"}</td>
                    <td>{order.orderDate || "—"}</td>
                    <td>{order.totalAmountLabel || formatInr(order.totalAmount ?? 0)}</td>
                    <td>
                      <OrderStatusBadge status={order.status} label={order.statusLabel} />
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
