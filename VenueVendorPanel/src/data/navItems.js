export const serviceNavItems = [
  { to: "dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "venues", label: "Services", icon: "venues" },
  { to: "reels", label: "Reels", icon: "video" },
  { to: "bookings", label: "Bookings", icon: "bookings" },
  { to: "promotions", label: "Promotions", icon: "plans" },
  { to: "profile", label: "Profile", icon: "profile" },
];

export const ecomNavItems = [
  { to: "dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "reels", label: "Reels", icon: "video" },
  { to: "products", label: "Products", icon: "venues" },
  { to: "orders", label: "Orders", icon: "bookings" },
  { to: "promotions", label: "Promotions", icon: "plans" },
  { to: "profile", label: "Profile", icon: "profile" },
];

/** @deprecated use serviceNavItems or getNavItemsForMode */
export const navItems = serviceNavItems;

export const pagesNavGroup = {
  label: "Pages",
  icon: "pages",
  children: [],
};

export const bothNavItems = [
  { to: "dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "venues", label: "Services", icon: "venues" },
  { to: "reels", label: "Reels", icon: "video" },
  { to: "bookings", label: "Bookings", icon: "bookings" },
  { to: "products", label: "Products", icon: "venues" },
  { to: "orders", label: "Orders", icon: "bookings" },
  { to: "promotions", label: "Promotions", icon: "plans" },
  { to: "profile", label: "Profile", icon: "profile" },
];

export function getNavItemsForMode(panelMode = "service") {
  if (panelMode === "ecom") return ecomNavItems;
  if (panelMode === "both") return bothNavItems;
  return serviceNavItems;
}

export function flattenNavLinks(items) {
  return items.map((item) => ({ to: item.to, label: item.label }));
}
