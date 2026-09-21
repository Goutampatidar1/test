import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { normalizeEcomProfileUser, vendorEcomGetDashboard, vendorEcomListProducts } from "../../api/vendorEcom.js";
import { vendorPanelGetMe } from "../../api/vendorPanelAuth.js";
import { publicListCategories } from "../../api/publicCatalog.js";
import { EcomStatIcon } from "../../components/ecom/EcomStatIcon.jsx";
import { OrderStatusBadge } from "../../components/ecom/OrderStatusBadge.jsx";
import { ShopImagesPanel } from "../../components/ecom/ShopImagesPanel.jsx";
import { VendorBannerCarousel } from "../../components/VendorBannerCarousel.jsx";
import { PhoneVisibilityToggle } from "../../components/PhoneVisibilityToggle.jsx";
import { ProfileCompletionCard } from "../../components/ProfileCompletionCard.jsx";
import { AppImage } from "../../components/AppImage.jsx";
import { selectHasBothCapabilities, selectPanelMode, setAccountUser } from "../../store/authSlice.js";
import { getEcomVendorProfileCompletion } from "../../utils/profileCompletion.js";
import { formatInr } from "../../utils/venueListMapper.js";

const STAT_CARDS = [
  { key: "newOrders", label: "New Orders", tone: "yellow", icon: "new", to: "/vendor/orders?status=new" },
  { key: "totalOrders", label: "Total Orders", tone: "blue", icon: "orders", to: "/vendor/orders" },
  { key: "completedOrders", label: "Completed", tone: "green", icon: "completed", to: "/vendor/orders?status=completed" },
  { key: "totalProducts", label: "Products", tone: "blue", icon: "products", to: "/vendor/products" },
];

export function EcomDashboardSection() {
  const dispatch = useDispatch();
  const panelMode = useSelector(selectPanelMode);
  const authUser = useSelector((s) => s.auth.user);
  const accounts = useSelector((s) => s.auth.accounts);
  const shopUserRaw = useSelector((s) =>
    s.auth.panelMode === "ecom" ? s.auth.user : s.auth.accounts?.ecom?.user || s.auth.user,
  );
  const serviceUser = useSelector((s) => s.auth.accounts?.service?.user);
  const hasBoth = useSelector(selectHasBothCapabilities);
  const shopUser = useMemo(() => normalizeEcomProfileUser(shopUserRaw), [shopUserRaw]);
  const ecomToken = accounts?.ecom?.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({});
  const [recentOrders, setRecentOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const tasks = [
          vendorEcomGetDashboard(),
          vendorEcomListProducts({ limit: 1 }).catch(() => ({ pagination: { total: 0 } })),
          publicListCategories({ mode: "ecom", limit: 12, includeEmpty: true }).catch(() => []),
        ];

        if (ecomToken) {
          tasks.push(vendorPanelGetMe(ecomToken, "ecom"));
        }

        const results = await Promise.all(tasks);
        if (cancelled) return;

        const data = results[0];
        const productsResult = results[1];
        const categoryRows = results[2];
        const ecomProfile = ecomToken ? results[3] : null;

        if (ecomProfile?.user) {
          dispatch(setAccountUser({ mode: "ecom", user: normalizeEcomProfileUser(ecomProfile.user) }));
        }

        const totalProducts = productsResult?.pagination?.total ?? 0;
        setProductCount(totalProducts);
        setStats({
          newOrders: data?.newOrders?.length ?? data?.stats?.pendingOrders ?? 0,
          totalOrders: data?.stats?.totalOrders ?? 0,
          completedOrders: data?.stats?.completedOrders ?? 0,
          totalProducts,
        });
        setRecentOrders(Array.isArray(data?.newOrders) ? data.newOrders : []);
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, ecomToken, panelMode]);

  const statCards = useMemo(
    () =>
      STAT_CARDS.map((card) => ({
        ...card,
        value: stats[card.key] ?? 0,
      })),
    [stats],
  );

  const profileCompletion = useMemo(
    () =>
      getEcomVendorProfileCompletion(shopUser, {
        productCount,
        serviceUser: hasBoth ? serviceUser : null,
      }),
    [hasBoth, productCount, serviceUser, shopUser],
  );

  const greeting = shopUser?.businessName || shopUser?.name || authUser?.businessName || authUser?.name || "Vendor";

  return (
    <div className="vendor-dashboard">
      <header className="vendor-dashboard__head">
        <div>
          <h1 className="vendor-dashboard__title">Shop Dashboard</h1>
          <p className="vendor-dashboard__subtitle">Welcome back, {greeting}! Here&apos;s your store summary.</p>
        </div>
        <Link to="/vendor/products/new" className="vendor-venues-add-btn">
          <span aria-hidden="true">+</span> Add Product
        </Link>
      </header>

      {error ? <p className="vendor-venues-empty vendor-venues-empty--error">{error}</p> : null}

      <PhoneVisibilityToggle />

      <VendorBannerCarousel />

      <section className="vendor-dash-stats" aria-label="Summary statistics">
        {statCards.map((card) => (
          <Link
            key={card.key}
            to={card.to}
            className={`vendor-dash-stat vendor-dash-stat--${card.tone}`}
            aria-label={`${card.label}: ${loading ? "loading" : card.value}`}
          >
            <div className="vendor-dash-stat__icon">
              <EcomStatIcon name={card.icon} />
            </div>
            <div className="vendor-dash-stat__body">
              <div className="vendor-dash-stat__value">{loading ? "—" : card.value}</div>
              <div className="vendor-dash-stat__label">{card.label}</div>
            </div>
          </Link>
        ))}
      </section>

      <ProfileCompletionCard completion={profileCompletion} variant="ecom" />

      <ShopImagesPanel user={shopUser} />

      <section className="vendor-dash-panel">
        <div className="vendor-ecom-panel-head">
          <h2 className="vendor-dash-panel__title">Recent Orders</h2>
          <Link to="/vendor/orders" className="vendor-ecom-panel-head__link">
            View all
          </Link>
        </div>
        <div className="vendor-dash-table-wrap">
          <table className="vendor-dash-table">
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
                    Loading recent orders…
                  </td>
                </tr>
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="vendor-bookings-empty">
                    No orders yet. New orders will appear here.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.orderId ?? order.id}>
                    <td className="vendor-dash-table__id">{order.orderDisplayId || order.orderNumber || order.orderId}</td>
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

      <section className="vendor-dash-panel vendor-service-categories vendor-service-categories--compact">
        <div className="vendor-service-categories__head">
          <div>
            <h2 className="vendor-dash-panel__title">Add a Product</h2>
            <p>Pick a category to list a new product quickly.</p>
          </div>
          <Link to="/vendor/products/new" className="vendor-ecom-panel-head__link">
            Browse all
          </Link>
        </div>

        {loading ? (
          <p className="vendor-service-categories__empty">Loading categories…</p>
        ) : categories.length === 0 ? (
          <p className="vendor-service-categories__empty">No shop categories available yet.</p>
        ) : (
          <div className="vendor-service-category-grid vendor-service-category-grid--compact">
            {categories.map((category) => (
              <Link
                key={category._id}
                to={`/vendor/products/new?category=${encodeURIComponent(category._id)}`}
                className="vendor-service-category-card vendor-service-category-card--compact"
                title={category.name}
              >
                <span className="vendor-service-category-card__image">
                  <AppImage src={category.image} alt="" />
                </span>
                <strong>{category.name}</strong>
                <span>Add product</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
