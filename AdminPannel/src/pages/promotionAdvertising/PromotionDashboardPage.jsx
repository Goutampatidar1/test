import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
  MdCampaign,
  MdCheckCircle,
  MdCurrencyRupee,
  MdImage,
  MdPendingActions,
  MdStar,
  MdVerified,
} from "react-icons/md";
import { adminGetPromotionDashboard } from "../../api/promotionAdvertisingController.js";
import { logout } from "../../store/authSlice.js";

function formatInr(amount) {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

export function PromotionDashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);

  const load = useCallback(async () => {
    if (!adminToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await adminGetPromotionDashboard(adminToken);
      setDashboard(data);
    } catch (err) {
      if (err?.status === 401) dispatch(logout());
      else Swal.fire({ icon: "error", title: "Load failed", text: err?.message || "Failed to load dashboard" });
    } finally {
      setLoading(false);
    }
  }, [adminToken, dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const cards = useMemo(() => {
    const d = dashboard || {};
    return [
      {
        key: "bannerActive",
        label: "Banner Active",
        value: loading ? "—" : String(d.banner?.active ?? 0),
        tone: "yellow",
        Icon: MdImage,
        to: "/admin/promotion-requests?status=active&planType=banner",
      },
      {
        key: "bannerPending",
        label: "Banner Pending",
        value: loading ? "—" : String(d.banner?.pending ?? 0),
        tone: "orange",
        Icon: MdPendingActions,
        to: "/admin/promotion-requests?status=pending_review&planType=banner",
      },
      {
        key: "verifiedActive",
        label: "Verified Active",
        value: loading ? "—" : String(d.getVerified?.active ?? 0),
        tone: "yellow",
        Icon: MdVerified,
        to: "/admin/promotion-requests?status=active&planType=get_verified",
      },
      {
        key: "verifiedPending",
        label: "Verified Pending",
        value: loading ? "—" : String(d.getVerified?.pending ?? 0),
        tone: "orange",
        Icon: MdCheckCircle,
        to: "/admin/promotion-requests?status=pending_review&planType=get_verified",
      },
      {
        key: "top50",
        label: "Product Top 50",
        value: loading ? "—" : String(d.productTop50?.active ?? 0),
        tone: "yellow",
        Icon: MdStar,
        to: "/admin/promotion-requests?status=active&planType=product_presence_first",
      },
      {
        key: "top100",
        label: "Product Top 100",
        value: loading ? "—" : String(d.productTop100?.active ?? 0),
        tone: "orange",
        Icon: MdCampaign,
        to: "/admin/promotion-requests?status=active&planType=product_presence_first",
      },
      {
        key: "revToday",
        label: "Revenue Today",
        value: loading ? "—" : formatInr(d.revenue?.today),
        tone: "yellow",
        Icon: MdCurrencyRupee,
        to: "/admin/promotion-requests",
      },
      {
        key: "revWeek",
        label: "Revenue Weekly",
        value: loading ? "—" : formatInr(d.revenue?.weekly),
        tone: "orange",
        Icon: MdCurrencyRupee,
        to: "/admin/promotion-requests",
      },
      {
        key: "revMonth",
        label: "Revenue Monthly",
        value: loading ? "—" : formatInr(d.revenue?.monthly),
        tone: "yellow",
        Icon: MdCurrencyRupee,
        to: "/admin/promotion-requests",
      },
    ];
  }, [dashboard, loading]);

  return (
    <div className="page-stack">
      <div className="page-card">
        <div className="page-card__head" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 className="page-card__title">Promotion Dashboard</h2>
            <p className="page-card__subtitle" style={{ margin: "4px 0 0" }}>
              Active, pending, and revenue from paid vendor promotions.
            </p>
          </div>
          <div className="page-card__actions" style={{ display: "flex", gap: 8 }}>
            <Link className="btn btn--ghost" to="/admin/promotion-plans">
              Plans
            </Link>
            <Link className="btn btn--accent" to="/admin/promotion-requests">
              Requests
            </Link>
          </div>
        </div>
      </div>

      <section className="stat-grid" aria-label="Promotion statistics" aria-busy={loading}>
        {cards.map((s) => {
          const Icon = s.Icon;
          return (
            <article
              key={s.key}
              className={`stat-card stat-card--${s.tone} stat-card--link`}
              role="link"
              tabIndex={0}
              aria-label={`${s.label}: ${s.value}`}
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

      <div className="page-card">
        <div className="page-card__head">
          <h2 className="page-card__title">Quick summary</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Active</th>
                <th>Pending</th>
                <th>Expired</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>Loading…</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td>Banner</td>
                    <td>{dashboard?.banner?.active ?? 0}</td>
                    <td>{dashboard?.banner?.pending ?? 0}</td>
                    <td>{dashboard?.banner?.expired ?? 0}</td>
                  </tr>
                  <tr>
                    <td>Get Verified</td>
                    <td>{dashboard?.getVerified?.active ?? 0}</td>
                    <td>{dashboard?.getVerified?.pending ?? 0}</td>
                    <td>{dashboard?.getVerified?.expired ?? 0}</td>
                  </tr>
                  <tr>
                    <td>Product Top 50</td>
                    <td>{dashboard?.productTop50?.active ?? 0}</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td>Product Top 100</td>
                    <td>{dashboard?.productTop100?.active ?? 0}</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
