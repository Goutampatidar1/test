/**
 * Central navigation config: path segments under /admin/*
 * Items with `children` render as collapsible groups; leaf entries use `to` relative to /admin.
 */
export const navItems = [
  { to: "dashboard", label: "Dashboard", icon: "grid" },
  { to: "users", label: "User Management", icon: "users" },
  {
    id: "ecom",
    label: "Ecom Management",
    icon: "cart",
    children: [
      { to: "vendors", label: "Vendor Management", icon: "store" },
      { to: "delivery", label: "Delivery Management", icon: "truck" },
      { to: "delivery-cod", label: "Driver COD Collection", icon: "credit" },
      { to: "products", label: "Product Management", icon: "box" },
      { to: "attribute-sets", label: "Attribute Sets", icon: "layers" },
      { to: "attributes", label: "Attributes", icon: "sliders" },
    ],
  },
  {
    id: "venue",
    label: "Service Management",
    icon: "map",
    children: [
      { to: "venue-vendors", label: "Service Vendor Management", icon: "map" },
      { to: "venues", label: "Services", icon: "map-pin" },
      { to: "amenities", label: "Amenities", icon: "sliders" },
    ],
  },

  {
    id: "recharge",
    label: "Recharge and Utility",
    icon: "zap",
    children: [
      { to: "mobile-recharge", label: "Mobile Recharge", icon: "zap" },
      { to: "gas-recharge", label: "Gas Recharge", icon: "percent" },
      { to: "fastag-recharge", label: "Fastag Recharge", icon: "credit" },
    ],
  },
  { to: "orders", label: "Order Management", icon: "list" },
  { to: "categories", label: "Categories", icon: "folder" },
  { to: "sub-categories", label: "Sub-Categories", icon: "folders" },
  { to: "locations", label: "States, Cities & Sub-Districts", icon: "map-pin" },
  {
    id: "promotion-ads",
    label: "Promotion Management",
    icon: "image",
    children: [
      { to: "promotion-dashboard", label: "Dashboard", icon: "grid" },
      { to: "promotion-plans", label: "Plans", icon: "tag" },
      { to: "promotion-requests", label: "Requests", icon: "list" },
    ],
  },
  // { to: "recharge", label: "Recharge Monitoring", icon: "zap" },
  // { to: "commission", label: "Commission", icon: "percent" },
  { to: "payments", label: "Payment Management", icon: "credit" },
  { to: "banners", label: "Banner Management", icon: "image" },
  { to: "video-feeds", label: "Reels / Video Feeds", icon: "video" },
  { to: "plans", label: "Vendor Plans", icon: "tag" },
  { to: "faq", label: "FAQ", icon: "help" },
  // { to: "reports", label: "Reports & Analytics", icon: "chart" },
  { to: "notifications", label: "Notifications", icon: "bell" },
  { to: "static-pages", label: "Static Pages", icon: "file" },
  { to: "settings", label: "App Settings", icon: "gear" },
  { to: "profile", label: "Admin Profile", icon: "profile" },
];

/** Flatten leaf links for header title lookup and similar. */
export function flattenNavLinks(items) {
  const out = [];
  for (const item of items) {
    if (Array.isArray(item.children)) {
      for (const c of item.children) out.push({ to: c.to, label: c.label });
    } else if (item.to) {
      out.push({ to: item.to, label: item.label });
    }
  }
  return out;
}
