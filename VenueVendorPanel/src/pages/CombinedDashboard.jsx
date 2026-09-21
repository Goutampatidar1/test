import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { vendorGetDashboard } from "../api/vendorBookings.js";
import {
  venueVendorGetShopStatus,
  venueVendorUpdateShopStatus,
} from "../api/venueVendorAuth.js";
import { vendorEcomGetDashboard, vendorEcomListProducts } from "../api/vendorEcom.js";
import { vendorPanelGetMe } from "../api/vendorPanelAuth.js";
import { publicListCategories } from "../api/publicCatalog.js";
import { venueVendorListCategories } from "../api/venueVendorCatalog.js";
import { vendorListVenues } from "../api/vendorVenues.js";
import { setAccountUser, setUser } from "../store/authSlice.js";
import { formatInr } from "../utils/venueListMapper.js";
import { getCombinedVendorProfileCompletion } from "../utils/profileCompletion.js";
import { normalizeEcomProfileUser } from "../api/vendorEcom.js";
import { VendorBannerCarousel } from "../components/VendorBannerCarousel.jsx";
import { PhoneVisibilityToggle } from "../components/PhoneVisibilityToggle.jsx";
import { ProfileCompletionCard } from "../components/ProfileCompletionCard.jsx";
import { ShopImagesPanel } from "../components/ecom/ShopImagesPanel.jsx";
import { DashboardSegmentToggle } from "../components/DashboardSegmentToggle.jsx";
import { EcomStatIcon } from "../components/ecom/EcomStatIcon.jsx";
import { OrderStatusBadge } from "../components/ecom/OrderStatusBadge.jsx";
import { AppImage } from "../components/AppImage.jsx";

const SERVICE_STATS = [
  { key: "total", label: "Total Bookings", tone: "blue", icon: "calendar", to: "/vendor/bookings" },
  { key: "pending", label: "Pending", tone: "yellow", icon: "clock", to: "/vendor/bookings?status=pending" },
  { key: "completed", label: "Completed", tone: "green", icon: "check", to: "/vendor/bookings?status=confirmed" },
  { key: "cancelled", label: "Cancelled", tone: "red", icon: "cancel", to: "/vendor/bookings?status=cancelled" },
];

const SHOP_STATS = [
  { key: "newOrders", label: "New Orders", tone: "yellow", icon: "new", to: "/vendor/orders?status=new" },
  { key: "totalOrders", label: "Total Orders", tone: "blue", icon: "orders", to: "/vendor/orders" },
  { key: "completedOrders", label: "Completed", tone: "green", icon: "completed", to: "/vendor/orders?status=completed" },
  { key: "totalProducts", label: "Products", tone: "blue", icon: "products", to: "/vendor/products" },
];

function ServiceStatIcon({ name }) {
  const icons = {
    calendar: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    clock: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    check: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
    ),
    cancel: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    ),
  };
  return icons[name] ?? icons.calendar;
}

function BookingStatusBadge({ status }) {
  const labels = { confirmed: "Confirmed", pending: "Pending", cancelled: "Cancelled" };
  return <span className={`vendor-dash-badge vendor-dash-badge--${status}`}>{labels[status] ?? status}</span>;
}

export function CombinedDashboard() {
  const dispatch = useDispatch();
  const serviceUser = useSelector((s) => s.auth.accounts?.service?.user || s.auth.user);
  const shopUserRaw = useSelector((s) => s.auth.accounts?.ecom?.user || s.auth.user);
  const shopUser = useMemo(() => normalizeEcomProfileUser(shopUserRaw), [shopUserRaw]);
  const serviceToken = useSelector((s) => s.auth.accounts?.service?.token || s.auth.token);
  const ecomToken = useSelector((s) => s.auth.accounts?.ecom?.token);

  const [recentSide, setRecentSide] = useState("service");
  const [addSide, setAddSide] = useState("service");
  const [statsSide, setStatsSide] = useState("service");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(serviceUser?.isOpen !== false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState("");

  const [serviceStats, setServiceStats] = useState({ total: 0, pending: 0, completed: 0, cancelled: 0 });
  const [shopStats, setShopStats] = useState({});
  const [recentBookings, setRecentBookings] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [venueCount, setVenueCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [serviceCategories, setServiceCategories] = useState([]);
  const [shopCategories, setShopCategories] = useState([]);
  const loadRequestRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const tasks = [
        vendorGetDashboard({ recentLimit: 5 }),
        vendorEcomGetDashboard(),
        vendorListVenues({ page: 1, limit: 1 }).catch(() => null),
        vendorEcomListProducts({ limit: 1 }).catch(() => ({ pagination: { total: 0 } })),
        venueVendorListCategories({ limit: 100 }).catch(() => []),
        publicListCategories({ mode: "ecom", limit: 12, includeEmpty: true }).catch(() => []),
        serviceToken ? venueVendorGetShopStatus(serviceToken) : Promise.resolve(null),
      ];
      if (serviceToken) tasks.push(vendorPanelGetMe(serviceToken, "service"));
      if (ecomToken) tasks.push(vendorPanelGetMe(ecomToken, "ecom"));

      const results = await Promise.all(tasks);
      if (requestId !== loadRequestRef.current) return;

      const serviceData = results[0];
      const ecomData = results[1];
      const venues = results[2];
      const productsResult = results[3];
      const svcCategories = results[4];
      const ecomCategories = results[5];
      const shopStatus = results[6];
      const profileResults = results.slice(7);
      const serviceProfile = serviceToken ? profileResults[0] : null;
      const ecomProfile = ecomToken ? profileResults[serviceToken ? 1 : 0] : null;

      if (serviceProfile?.user) {
        dispatch(setAccountUser({ mode: "service", user: serviceProfile.user }));
        dispatch(setUser(serviceProfile.user));
      }
      if (ecomProfile?.user) {
        dispatch(setAccountUser({ mode: "ecom", user: normalizeEcomProfileUser(ecomProfile.user) }));
      }

      setServiceStats(serviceData?.stats ?? { total: 0, pending: 0, completed: 0, cancelled: 0 });
      setRecentBookings(Array.isArray(serviceData?.recentBookings) ? serviceData.recentBookings : []);
      setVenueCount(Number(venues?.pagination?.total ?? venues?.venues?.length ?? 0) || 0);

      const totalProducts = productsResult?.pagination?.total ?? 0;
      setProductCount(totalProducts);
      setShopStats({
        newOrders: ecomData?.newOrders?.length ?? ecomData?.stats?.pendingOrders ?? 0,
        totalOrders: ecomData?.stats?.totalOrders ?? 0,
        completedOrders: ecomData?.stats?.completedOrders ?? 0,
        totalProducts,
      });
      setRecentOrders(Array.isArray(ecomData?.newOrders) ? ecomData.newOrders : []);
      setServiceCategories(Array.isArray(svcCategories) ? svcCategories : []);
      setShopCategories(Array.isArray(ecomCategories) ? ecomCategories : []);

      if (shopStatus && typeof shopStatus.isOpen === "boolean") {
        setIsOpen(shopStatus.isOpen);
      } else if (serviceProfile?.user) {
        setIsOpen(serviceProfile.user.isOpen !== false);
      }
    } catch (err) {
      if (requestId === loadRequestRef.current) {
        setError(err?.message || "Failed to load dashboard.");
      }
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [dispatch, ecomToken, serviceToken]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onToggleShop = async () => {
    if (!serviceToken || togglingOpen) return;
    const next = !isOpen;
    setTogglingOpen(true);
    setShopMessage("");
    try {
      const result = await venueVendorUpdateShopStatus(serviceToken, next);
      const opened = result?.isOpen !== false;
      setIsOpen(opened);
      if (result?.user) {
        dispatch(setUser(result.user));
      } else if (serviceUser) {
        dispatch(setUser({ ...serviceUser, isOpen: opened }));
      }
      setShopMessage(
        opened
          ? "Business is open. Your services are visible to users."
          : "Business is closed. Your services are hidden from users.",
      );
    } catch (err) {
      setShopMessage(err?.message || "Could not update business status.");
    } finally {
      setTogglingOpen(false);
    }
  };

  const profileCompletion = useMemo(
    () => getCombinedVendorProfileCompletion(serviceUser, shopUser, { venueCount, productCount }),
    [productCount, serviceUser, shopUser, venueCount],
  );

  const serviceStatCards = useMemo(
    () =>
      SERVICE_STATS.map((card) => ({
        ...card,
        value: serviceStats[card.key] ?? 0,
        group: "service",
      })),
    [serviceStats],
  );

  const shopStatCards = useMemo(
    () =>
      SHOP_STATS.map((card) => ({
        ...card,
        value: shopStats[card.key] ?? 0,
        group: "shop",
      })),
    [shopStats],
  );

  const visibleStatCards = statsSide === "service" ? serviceStatCards : shopStatCards;

  const greeting =
    serviceUser?.businessName ||
    serviceUser?.name ||
    shopUser?.businessName ||
    shopUser?.name ||
    "Vendor";

  return (
    <div className="vendor-dashboard vendor-dashboard--combined">
      <header className="vendor-dashboard__head">
        <div>
          <h1 className="vendor-dashboard__title">Dashboard</h1>
          <p className="vendor-dashboard__subtitle">Welcome back, {greeting}! Manage services and shop in one place.</p>
        </div>
        <div className="vendor-dashboard__head-actions">
          <div className={`vendor-shop-toggle${isOpen ? " is-open" : " is-closed"}`}>
            <div className="vendor-shop-toggle__copy">
              <strong>{isOpen ? "Business Open" : "Business Closed"}</strong>
              <span>
                {isOpen ? "Users can see and book your services." : "Your services are hidden from users."}
              </span>
            </div>
            <button
              type="button"
              className={`vendor-shop-switch${isOpen ? " is-on" : ""}`}
              role="switch"
              aria-checked={isOpen}
              aria-label={isOpen ? "Close business" : "Open business"}
              disabled={togglingOpen || loading}
              onClick={onToggleShop}
            >
              <span className="vendor-shop-switch__knob" aria-hidden />
            </button>
          </div>
          <Link to="/vendor/products/new" className="vendor-venues-add-btn">
            <span aria-hidden="true">+</span> Add Product
          </Link>
        </div>
      </header>

      {shopMessage ? (
        <p className={`vendor-shop-toggle__msg${isOpen ? "" : " is-closed"}`}>{shopMessage}</p>
      ) : null}

      <PhoneVisibilityToggle />

      {error ? <p className="vendor-venues-empty vendor-venues-empty--error">{error}</p> : null}

      <VendorBannerCarousel />

      <ProfileCompletionCard completion={profileCompletion} variant="both" combined />

      <ShopImagesPanel user={shopUser} />

      <section className="vendor-dash-panel vendor-service-categories vendor-service-categories--compact vendor-dash-panel--toggle">
        <div className="vendor-service-categories__head vendor-dash-panel-head--toggle">
          <div>
            <h2 className="vendor-dash-panel__title">
              {addSide === "service" ? "Add a service" : "Add a product"}
            </h2>
            <p>
              {addSide === "service"
                ? "Pick a category to add a service quickly."
                : "Pick a category to list a new product quickly."}
            </p>
          </div>
          <div className="vendor-dash-panel-head__actions">
            <DashboardSegmentToggle
              value={addSide}
              onChange={setAddSide}
              ariaLabel="Switch between service and product categories"
            />
            <Link
              to={addSide === "service" ? "/vendor/venues/new" : "/vendor/products/new"}
              className="vendor-ecom-panel-head__link"
            >
              Browse all
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="vendor-service-categories__empty">Loading categories…</p>
        ) : addSide === "service" ? (
          serviceCategories.length === 0 ? (
            <p className="vendor-service-categories__empty">No service categories are available yet.</p>
          ) : (
            <div className="vendor-service-category-grid vendor-service-category-grid--compact">
              {serviceCategories.map((category) => (
                <Link
                  key={category._id}
                  to={`/vendor/venues/new?category=${encodeURIComponent(category._id)}`}
                  className="vendor-service-category-card vendor-service-category-card--compact"
                  title={category.name}
                >
                  <span className="vendor-service-category-card__image">
                    <AppImage src={category.image} alt="" />
                  </span>
                  <strong>{category.name}</strong>
                  <span>Add service</span>
                </Link>
              ))}
            </div>
          )
        ) : shopCategories.length === 0 ? (
          <p className="vendor-service-categories__empty">No shop categories available yet.</p>
        ) : (
          <div className="vendor-service-category-grid vendor-service-category-grid--compact">
            {shopCategories.map((category) => (
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

      <section className="vendor-dash-panel vendor-dash-stats-panel" aria-label="Summary statistics">
        <div className="vendor-ecom-panel-head vendor-dash-panel-head--toggle">
          <div>
            <h2 className="vendor-dash-panel__title">
              {statsSide === "service" ? "Service overview" : "Shop overview"}
            </h2>
            <p className="vendor-dash-stats-panel__hint">
              {statsSide === "service"
                ? "Booking counts for your services."
                : "Order and product counts for your shop."}
            </p>
          </div>
          <DashboardSegmentToggle
            value={statsSide}
            onChange={setStatsSide}
            ariaLabel="Switch between service and shop statistics"
          />
        </div>
        <div className="vendor-dash-stats vendor-dash-stats--panel">
          {visibleStatCards.map((card) => (
            <Link
              key={`${card.group}-${card.key}`}
              to={card.to}
              className={`vendor-dash-stat vendor-dash-stat--${card.tone}`}
              aria-label={`${card.label}: ${loading ? "loading" : card.value}`}
            >
              <div className="vendor-dash-stat__icon">
                {card.group === "service" ? <ServiceStatIcon name={card.icon} /> : <EcomStatIcon name={card.icon} />}
              </div>
              <div className="vendor-dash-stat__body">
                <div className="vendor-dash-stat__value">{loading ? "—" : card.value}</div>
                <div className="vendor-dash-stat__label">{card.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="vendor-dash-panel vendor-dash-panel--toggle">
        <div className="vendor-ecom-panel-head vendor-dash-panel-head--toggle">
          <h2 className="vendor-dash-panel__title">
            {recentSide === "service" ? "Recent bookings" : "Recent orders"}
          </h2>
          <div className="vendor-dash-panel-head__actions">
            <DashboardSegmentToggle
              value={recentSide}
              onChange={setRecentSide}
              ariaLabel="Switch between recent bookings and recent orders"
            />
            <Link
              to={recentSide === "service" ? "/vendor/bookings" : "/vendor/orders"}
              className="vendor-ecom-panel-head__link"
            >
              View all
            </Link>
          </div>
        </div>
        <div className="vendor-dash-table-wrap">
          {recentSide === "service" ? (
            <table className="vendor-dash-table">
              <thead>
                <tr>
                  <th>BOOKING ID</th>
                  <th>CUSTOMER</th>
                  <th>SERVICE</th>
                  <th>DATE</th>
                  <th>AMOUNT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="vendor-bookings-empty">
                      Loading recent bookings…
                    </td>
                  </tr>
                ) : recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="vendor-bookings-empty">
                      No bookings yet.
                    </td>
                  </tr>
                ) : (
                  recentBookings.map((row) => (
                    <tr key={row.orderId ?? row.id}>
                      <td className="vendor-dash-table__id">
                        <Link
                          to={`/vendor/bookings/${encodeURIComponent(row.orderId ?? row.id)}`}
                          className="vendor-bookings-view-link"
                        >
                          {row.id}
                        </Link>
                      </td>
                      <td>{row.customer}</td>
                      <td>{row.venue}</td>
                      <td>{row.date}</td>
                      <td>{formatInr(row.amount)}</td>
                      <td>
                        <BookingStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
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
          )}
        </div>
      </section>
    </div>
  );
}
