const CATEGORY_ICON_MAP = {
  dj: "/category-icons/dj.svg",
  baggi: "/category-icons/baggi.svg",
  "bhangra team": "/category-icons/bhangra.svg",
  tent: "/category-icons/tent.svg",
  "light decoration": "/category-icons/light.svg",
  catering: "/category-icons/catering.svg",
  other: "/category-icons/other.svg",
};

function normalizeCategoryName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

export function getServiceCategoryIcon(category) {
  const name = normalizeCategoryName(category?.name);
  return CATEGORY_ICON_MAP[name] || "/category-icons/other.svg";
}

export function resolveServiceCategoryImage(category) {
  const localIcon = getServiceCategoryIcon(category);
  const remote = String(category?.image || "").trim();
  if (!remote || remote.includes("/uploads/seed/")) {
    return localIcon;
  }
  return remote;
}
