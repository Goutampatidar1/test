import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";import {
  MdBusiness,
  MdCurrencyRupee,
  MdEvent,
  MdPending,
  MdPendingActions,
  MdPeople,
  MdPhoneAndroid,
  MdShoppingCart,
  MdStore,
  MdStorefront,
} from "react-icons/md";
import { adminGetDashboardStats } from "../api/adminDashboard.js";
import { logout } from "../store/authSlice.js";

const STAT_CARDS = [
  { key: "totalUsers", label: "Total Users", tone: "yellow", format: "number", Icon: MdPeople, to: "/admin/users" },
  { key: "ecomVendors", label: "Ecom Vendors", tone: "orange", format: "number", Icon: MdStore, to: "/admin/vendors" },
  { key: "venueVendors", label: "Service Vendors", tone: "orange", format: "number", Icon: MdBusiness, to: "/admin/venue-vendors" },
  { key: "totalOrders", label: "Total Orders", tone: "yellow", format: "number", Icon: MdShoppingCart, to: "/admin/orders?tab=order" },
  { key: "revenue", label: "Revenue", tone: "yellow", format: "currency", Icon: MdCurrencyRupee, to: "/admin/payments" },
  {
    key: "totalRechargeTransactions",
    label: "Total Recharge Trans.",
    tone: "orange",
    format: "number",
    Icon: MdPhoneAndroid,
    to: "/admin/payments?tab=recharge",
  },
  {
    key: "totalVenueBookings",
    label: "Total Service Bookings",
    tone: "yellow",
    format: "number",
    Icon: MdEvent,
    to: "/admin/orders?tab=booking",
  },
  {
    key: "ecomActiveVendors",
    label: "Ecom Active Vendors",
    tone: "yellow",
    format: "number",
    Icon: MdStorefront,
    to: "/admin/vendors?status=active&approvalStatus=approved",
  },
  {
    key: "venueActiveVendors",
    label: "Service Active Vendors",
    tone: "yellow",
    format: "number",
    Icon: MdBusiness,
    to: "/admin/venue-vendors?status=active&approvalStatus=approved",
  },
  {
    key: "ecomPendingApprovals",
    label: "Ecom Pending Approvals",
    tone: "orange",
    format: "number",
    Icon: MdPendingActions,
    to: "/admin/vendors?approvalStatus=pending",
  },
  {
    key: "venuePendingApprovals",
    label: "Service Pending Approvals",
    tone: "orange",
    format: "number",
    Icon: MdPending,
    to: "/admin/venue-vendors?approvalStatus=pending",
  },
];function formatStatValue(value, format) {
  const num = Number(value ?? 0);
  if (format === "currency") {
    return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  return num.toLocaleString("en-IN");
}

function monthRangeHint(months) {
  if (!months?.length) return "Last 6 months";
  const first = months[0];
  const last = months[months.length - 1];
  if (first.year === last.year) {
    return `${first.label} – ${last.label} ${last.year}`;
  }
  return `${first.label} ${first.year} – ${last.label} ${last.year}`;
}

function sparkPaths(values, width = 320, height = 120, pad = 10) {
  if (!values.length) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);
  const points = values.map((value, i) => {
    const x = i * stepX;
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x} ${y}`;
  });
  const line = points.map((point, i) => `${i === 0 ? "M" : "L"}${point}`).join(" ");
  const lastX = values.length === 1 ? width : (values.length - 1) * stepX;
  return { line, area: `${line} L${lastX} ${height} L0 ${height} Z` };
}

export function DashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminGetDashboardStats(adminToken);
      setStats(data);
    } catch (e) {
      if (e?.status === 401) return dispatch(logout());
      setError(e?.message || "Could not load dashboard stats.");
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const cards = useMemo(
    () =>
      STAT_CARDS.map((card) => ({
        ...card,
        value: loading ? "—" : formatStatValue(stats?.[card.key], card.format),
      })),
    [loading, stats]
  );

  const monthlyOrders = stats?.monthlyOrders ?? [];
  const categoryRows = stats?.categoryPerformance ?? [];
  const spark = useMemo(
    () => sparkPaths(monthlyOrders.map((m) => Number(m.count) || 0)),
    [monthlyOrders]
  );
  const categoryMax = Math.max(...categoryRows.map((c) => Number(c.quantity) || 0), 1);

  return (
    <div className="page-stack">
      {error ? (
        <div className="panel" role="alert">
          <p className="panel__hint" style={{ color: "#b91c1c", margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <section className="stat-grid" aria-label="Summary statistics" aria-busy={loading}>
        {cards.map((s) => {
          const Icon = s.Icon;
          return (
            <article
              key={s.key}
              className={`stat-card stat-card--${s.tone} stat-card--link`}
              role="link"
              tabIndex={0}
              aria-label={`${s.label}: ${s.value}. Open ${s.label}.`}
              onClick={() => navigate(s.to)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(s.to);
                }
              }}
            >
              <div className="stat-card__meta">
                <div className="stat-card__label">{s.label}</div>
                <div className="stat-card__value">{s.value}</div>
              </div>
              <div className="stat-card__icon" aria-hidden="true">
                <Icon className="stat-card__icon-svg" />
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel-row">
        <div className="panel">
          <h2 className="panel__title">Monthly Orders</h2>
          <p className="panel__hint">{monthRangeHint(monthlyOrders)}</p>
          <div
            className="spark"
            role="img"
            aria-label={
              monthlyOrders.length
                ? `Orders from ${monthRangeHint(monthlyOrders)}`
                : "Monthly orders"
            }
          >
            <svg viewBox="0 0 320 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ffd54a" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ffd54a" stopOpacity="0" />
                </linearGradient>
              </defs>
              {spark.area ? <path d={spark.area} fill="url(#sparkFill)" /> : null}
              {spark.line ? (
                <path
                  d={spark.line}
                  fill="none"
                  stroke="#ff8a00"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
            </svg>
          </div>
        </div>
        <div className="panel">
          <h2 className="panel__title">Category Performance</h2>
          <p className="panel__hint">
            {categoryRows.length ? "Top categories by items sold" : "No category sales yet"}
          </p>
          <div className="bars" role="img" aria-label="Category sales">
            {categoryRows.map((cat) => {
              const height = Math.max(8, ((Number(cat.quantity) || 0) / categoryMax) * 100);
              return (
                <div key={cat.name} className="bars__item">
                  <div className="bars__track">
                    <div className="bars__fill" style={{ height: `${height}%` }} />
                  </div>
                  <span className="bars__label">{cat.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
