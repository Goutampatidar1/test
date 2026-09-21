import { useCallback, useEffect, useId, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { getAppConfig, patchAppConfig, postAppConfig } from "../../api/adminMisc.js";
import { adminListCities, adminCreateCity } from "../../api/adminCities.js";
import { adminListSubDistricts, adminCreateSubDistrict } from "../../api/adminSubDistricts.js";
import { adminListStates } from "../../api/adminStates.js";
import { fetchAppConfig } from "../../store/appConfigSlice.js";
import { logout } from "../../store/authSlice.js";
import { mediaUrl } from "../../media.js";
import { sanitizePhoneInput, validateIndianMobileMessage } from "../../utils/validation.js";
import { FadeLoader } from "react-spinners";
import { AdminSearchField } from "../../components/AdminSearchField.jsx";

const SCALAR_KEYS = [
  "app_name",
  "app_email",
  "app_mobile",
  "app_detail",
  "address",
  "latitude",
  "longitude",
  "facebook",
  "twitter",
  "instagram",
  "linkedin",
  "app_details",
  "app_footer_text",
  "shipping_charge",
];

const ECOM_VISIBILITY_SCOPE_OPTIONS = [
  { value: "all", label: "Visible for all locations" },
  {
    value: "sub_district",
    label: "Manage by Sub-District (Tehsil / Taluka / Subdivision)",
  },
];

/** Hidden until whole-city e-commerce rules are enabled in admin UI. */
const SHOW_ECOM_OPTIONAL_CITY_RULE = false;

const SETTINGS_TABS = [
  { id: "general", label: "App config" },
  { id: "branding", label: "Media" },
  { id: "location", label: "Location" },
  { id: "social", label: "Social" },
  // { id: "content", label: "Content" },
  { id: "payment-methods", label: "Payment methods" },
  { id: "ecom-flow", label: "E-commerce flow" },
  // { id: "payment-gateways", label: "Payment gateways" },
  // { id: "documents", label: "Documents" },
  { id: "approvals", label: "Approvals" },
];

const PAYMENT_METHOD_DEFS = [
  { type: "cod", label: "Cash on delivery", hint: "Customer pays when the order is delivered" },
  { type: "online", label: "Online payment", hint: "Cards, UPI, net banking, etc." },
  { type: "wallet", label: "Wallet", hint: "Pay using in-app wallet balance" },
];

const GATEWAY_DEFS = [
  { provider: "razorpay", title: "Razorpay" },
  { provider: "stripe", title: "Stripe" },
  { provider: "paypal", title: "PayPal" },
  { provider: "paytm", title: "Paytm" },
];

const DOCUMENT_DEFS = [
  { type: "Aadhar Card", label: "Aadhar card", hint: "Vendor KYC" },
  { type: "Pan Card", label: "PAN card", hint: "Vendor KYC" },
  { type: "Bank Details", label: "Bank details", hint: "Payout / settlement" },
];

const COMMISSION_DEFS = [
  { type: "Vendor", label: "Vendor commission", hint: "Platform percentage on vendor sales (0–100%)." },
  { type: "VenueVendor", label: "Service vendor commission", hint: "Platform percentage for service vendors (0–100%)." },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = {
  appName: 100,
  appEmail: 120,
  appDetail: 160,
  address: 300,
  latLng: 20,
  socialUrl: 255,
  appDetails: 2000,
  footerText: 180,
  gatewayField: 180,
};

function charCount(value, max) {
  return `${String(value || "").length}/${max}`;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateSettingsForm({ scalars, paymentMethods, paymentGateways, commissions, ecomFlow }) {
  const appName = (scalars.app_name || "").trim();
  const appEmail = (scalars.app_email || "").trim();
  const appMobile = (scalars.app_mobile || "").trim();
  const address = (scalars.address || "").trim();
  const latitude = (scalars.latitude || "").trim();
  const longitude = (scalars.longitude || "").trim();
  const footerText = (scalars.app_footer_text || "").trim();

  if (!appName) return { tab: "general", text: "App name is required." };
  if (!appEmail) return { tab: "general", text: "Support email is required." };
  if (!EMAIL_REGEX.test(appEmail)) return { tab: "general", text: "Support email format is invalid." };
  const appMobileError = validateIndianMobileMessage(appMobile, { required: true, label: "Support mobile" });
  if (appMobileError) return { tab: "general", text: appMobileError };

  if (latitude) {
    const lat = Number.parseFloat(latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { tab: "location", text: "Latitude must be a valid number between -90 and 90." };
    }
  }
  if (longitude) {
    const lng = Number.parseFloat(longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { tab: "location", text: "Longitude must be a valid number between -180 and 180." };
    }
  }
  if ((latitude && !longitude) || (!latitude && longitude)) {
    return { tab: "location", text: "Provide both latitude and longitude, or leave both empty." };
  }

  if (!footerText) return { tab: "general", text: "Footer text is required." };

  const shippingCharge = Number(scalars.shipping_charge);
  if (!Number.isFinite(shippingCharge) || shippingCharge < 0) {
    return { tab: "general", text: "Shipping charge must be 0 or greater." };
  }

  for (const c of commissions) {
    const p = Number(c.percentage);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return { tab: "general", text: `${c.label} must be between 0 and 100.` };
    }
  }

  const socialEntries = [
    { key: "facebook", label: "Facebook" },
    { key: "twitter", label: "Twitter / X" },
    { key: "instagram", label: "Instagram" },
    { key: "linkedin", label: "LinkedIn" },
  ];
  for (const { key, label } of socialEntries) {
    const value = (scalars[key] || "").trim();
    if (value && !isValidHttpUrl(value)) {
      return { tab: "social", text: `${label} URL must start with http:// or https://` };
    }
  }

  const onlinePaymentActive = paymentMethods.some((m) => m.type === "online" && m.isActive);
  if (onlinePaymentActive) {
    const razorpay = razorpayGatewayFromList(paymentGateways);
    const keyId = (razorpay.credentials?.key_id || "").trim();
    const keySecret = (razorpay.credentials?.key_secret || "").trim();
    if (!keyId || !keySecret) {
      return {
        tab: "payment-methods",
        text: "Razorpay Key ID and Key secret are required when Online payment is enabled.",
      };
    }
  }

  for (const g of paymentGateways) {
    if (g.provider === "razorpay" || !g.isActive) continue;
    const keyId = (g.credentials?.key_id || "").trim();
    const keySecret = (g.credentials?.key_secret || "").trim();
    if (!keyId || !keySecret) {
      const title = GATEWAY_DEFS.find((x) => x.provider === g.provider)?.title ?? g.provider;
      return { tab: "payment-gateways", text: `${title}: Key ID and Key secret are required when gateway is active.` };
    }
  }

  const ecomError = validateEcomFlow(ecomFlow);
  if (ecomError) return ecomError;

  return null;
}

function razorpayGatewayFromList(list) {
  return (Array.isArray(list) ? list : []).find((row) => row.provider === "razorpay") ?? emptyGateway("razorpay");
}

function updateRazorpayGateway(list, patch) {
  const exists = list.some((row) => row.provider === "razorpay");
  if (!exists) return [...list, { ...emptyGateway("razorpay"), ...patch }];
  return list.map((row) => (row.provider === "razorpay" ? { ...row, ...patch } : row));
}

function updateRazorpayCredentials(list, credentialsPatch) {
  return list.map((row) =>
    row.provider === "razorpay"
      ? { ...row, credentials: { ...row.credentials, ...credentialsPatch } }
      : row,
  );
}

function emptyGateway(provider) {
  return {
    provider,
    isActive: false,
    credentials: {
      key_id: "",
      key_secret: "",
      webhook_secret: "",
      merchant_id: "",
    },
  };
}

function normalizeGateways(arr) {
  const map = Object.fromEntries(
    (Array.isArray(arr) ? arr : [])
      .filter(Boolean)
      .map((g) => [g.provider, g]),
  );
  return GATEWAY_DEFS.map(({ provider }) => {
    const g = map[provider];
    if (!g) return emptyGateway(provider);
    const c = g.credentials || {};
    return {
      provider,
      isActive: !!g.isActive,
      credentials: {
        key_id: c.key_id != null ? String(c.key_id) : "",
        key_secret: c.key_secret != null ? String(c.key_secret) : "",
        webhook_secret: c.webhook_secret != null ? String(c.webhook_secret) : "",
        merchant_id: c.merchant_id != null ? String(c.merchant_id) : "",
      },
    };
  });
}

function normalizePaymentMethods(arr) {
  const map = Object.fromEntries(
    (Array.isArray(arr) ? arr : [])
      .filter(Boolean)
      .map((m) => [m.type, m]),
  );
  return PAYMENT_METHOD_DEFS.map(({ type, label, hint }) => ({
    type,
    label,
    hint,
    isActive: map[type] != null ? !!map[type].isActive : true,
  }));
}

function normalizeDocuments(arr) {
  const map = Object.fromEntries(
    (Array.isArray(arr) ? arr : [])
      .filter(Boolean)
      .map((d) => [d.type, d]),
  );
  return DOCUMENT_DEFS.map(({ type, label, hint }) => ({
    type,
    label,
    hint,
    isActive: map[type] != null ? !!map[type].isActive : true,
  }));
}

function normalizeCommissions(arr) {
  const map = Object.fromEntries(
    (Array.isArray(arr) ? arr : [])
      .filter(Boolean)
      .map((c) => [c.type, c]),
  );
  return COMMISSION_DEFS.map(({ type, label, hint }) => {
    const row = map[type];
    let pct = row?.percentage;
    if (pct == null || !Number.isFinite(Number(pct))) pct = 0;
    pct = Math.min(100, Math.max(0, Number(pct)));
    return { type, label, hint, percentage: pct };
  });
}

function methodsForApi(list) {
  return list.map(({ type, isActive }) => ({ type, isActive }));
}

function gatewaysForApi(list, paymentMethods) {
  const onlinePaymentActive = paymentMethods.some((m) => m.type === "online" && m.isActive);
  return list.map(({ provider, isActive, credentials }) => ({
    provider,
    isActive: provider === "razorpay" ? onlinePaymentActive : isActive,
    credentials: { ...credentials },
  }));
}

function documentsForApi(list) {
  return list.map(({ type, isActive }) => ({ type, isActive }));
}

function commissionsForApi(list) {
  return list.map(({ type, percentage }) => ({
    type,
    percentage: Math.min(100, Math.max(0, Number(percentage) || 0)),
  }));
}

function defaultEcomFlowState() {
  return {
    enabled: true,
    scope: "all",
    rule: "block",
    cities: [],
    pincodes: [],
    subDistricts: [],
  };
}

function normalizeEcomFlowFromDoc(doc) {
  const flow = doc?.ecom_flow || {};
  let scope =
    flow.scope === "city" || flow.scope === "pincode" || flow.scope === "sub_district"
      ? flow.scope
      : "all";
  // City / pincode scopes are hidden in admin UI for now — treat as sub-district.
  if (scope === "city" || scope === "pincode") {
    scope = "sub_district";
  }
  return {
    enabled: flow.enabled !== false,
    scope,
    rule: flow.rule === "allow" ? "allow" : "block",
    cities: Array.isArray(flow.cities)
      ? flow.cities.map((c) => (typeof c === "object" && c?._id ? String(c._id) : String(c))).filter(Boolean)
      : [],
    pincodes: Array.isArray(flow.pincodes) ? flow.pincodes.map(String) : [],
    subDistricts: Array.isArray(flow.subDistricts)
      ? flow.subDistricts
          .map((item) => (typeof item === "object" && item?._id ? String(item._id) : String(item)))
          .filter(Boolean)
      : [],
  };
}

function ecomFlowForApi(flow) {
  return {
    enabled: !!flow.enabled,
    scope: flow.enabled ? flow.scope : "all",
    rule: flow.rule,
    cities: flow.scope === "city" || flow.scope === "sub_district" ? flow.cities : [],
    pincodes: flow.scope === "pincode" ? flow.pincodes.map((p) => String(p).trim()) : [],
    subDistricts: flow.scope === "sub_district" ? flow.subDistricts : [],
  };
}

function validateEcomFlow(flow) {
  if (!flow.enabled || flow.scope === "all") return null;
  if (flow.scope === "city" && flow.rule === "allow" && flow.cities.length === 0) {
    return { tab: "ecom-flow", text: "Select at least one city when showing e-commerce only in selected cities." };
  }
  if (flow.scope === "pincode" && flow.rule === "allow" && flow.pincodes.length === 0) {
    return { tab: "ecom-flow", text: "Add at least one pincode when showing e-commerce only in selected pincodes." };
  }
  if (
    flow.scope === "sub_district" &&
    flow.rule === "allow" &&
    flow.subDistricts.length === 0 &&
    flow.cities.length === 0
  ) {
    return {
      tab: "ecom-flow",
      text: "Select at least one sub-district or city when showing e-commerce only in selected areas.",
    };
  }
  return null;
}

function ecomScopeLabel(scope) {
  if (scope === "city") return "cities";
  if (scope === "pincode") return "pincodes";
  if (scope === "sub_district") return "sub-districts / cities";
  return "locations";
}

function emptyQuickCityForm() {
  return { state: "", name: "", pincode: "" };
}

function emptyQuickSubDistrictForm() {
  return { city: "", name: "" };
}

function EcomInlinePanel({ title, children }) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#f9fafb",
      }}
    >
      <span className="user-field__label" style={{ display: "block", marginBottom: 10 }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function SettingsToggle({ checked, onChange, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      className={`settings-switch${checked ? " settings-switch--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch__knob" aria-hidden />
    </button>
  );
}

export function BusinessSetting() {
  const dispatch = useDispatch();
  const baseId = useId();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [tab, setTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Config row exists (GET returned a document). */
  const [hasDoc, setHasDoc] = useState(false);
  const [scalars, setScalars] = useState(() =>
    Object.fromEntries(SCALAR_KEYS.map((k) => [k, ""])),
  );
  const [paymentMethods, setPaymentMethods] = useState(() => normalizePaymentMethods([]));
  const [paymentGateways, setPaymentGateways] = useState(() => normalizeGateways([]));
  const [documents, setDocuments] = useState(() => normalizeDocuments([]));
  const [commissions, setCommissions] = useState(() => normalizeCommissions([]));
  const [vendorApprovalRequired, setVendorApprovalRequired] = useState(true);
  const [ecomFlow, setEcomFlow] = useState(() => defaultEcomFlowState());
  const [cityOptions, setCityOptions] = useState([]);
  const [subDistrictOptions, setSubDistrictOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);
  const [pincodeDraft, setPincodeDraft] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [subDistrictSearch, setSubDistrictSearch] = useState("");
  const [quickCityForm, setQuickCityForm] = useState(emptyQuickCityForm);
  const [quickSubDistrictForm, setQuickSubDistrictForm] = useState(emptyQuickSubDistrictForm);
  const [addingQuickCity, setAddingQuickCity] = useState(false);
  const [addingQuickSubDistrict, setAddingQuickSubDistrict] = useState(false);

  const [adminLogoFile, setAdminLogoFile] = useState(null);
  const [userLogoFile, setUserLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [adminLogoPreview, setAdminLogoPreview] = useState("");
  const [userLogoPreview, setUserLogoPreview] = useState("");
  const [faviconPreview, setFaviconPreview] = useState("");
  const [serverMedia, setServerMedia] = useState({ admin: "", user: "", fav: "" });
  const lat = Number.parseFloat((scalars.latitude || "").trim());
  const lng = Number.parseFloat((scalars.longitude || "").trim());
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const mapSrc = hasValidCoords
    ? `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=15&output=embed`
    : "";

  const applyConfig = useCallback((doc) => {
    if (!doc) {
      setHasDoc(false);
      setScalars(Object.fromEntries(SCALAR_KEYS.map((k) => [k, ""])));
      setPaymentMethods(normalizePaymentMethods([]));
      setPaymentGateways(normalizeGateways([]));
      setDocuments(normalizeDocuments([]));
      setCommissions(normalizeCommissions([]));
      setVendorApprovalRequired(true);
      setEcomFlow(defaultEcomFlowState());
      setPincodeDraft("");
      setCitySearch("");
      setAdminLogoPreview("");
      setUserLogoPreview("");
      setFaviconPreview("");
      setServerMedia({ admin: "", user: "", fav: "" });
      return;
    }
    setHasDoc(true);
    const next = Object.fromEntries(
      SCALAR_KEYS.map((k) => {
        if (k === "shipping_charge") {
          return [k, doc[k] != null ? String(doc[k]) : "40"];
        }
        return [k, doc[k] != null ? String(doc[k]) : ""];
      }),
    );
    setScalars(next);
    setPaymentMethods(normalizePaymentMethods(doc.payment_methods));
    setPaymentGateways(normalizeGateways(doc.payment_gateways));
    setDocuments(normalizeDocuments(doc.documents));
    setCommissions(normalizeCommissions(doc.commissions));
    setVendorApprovalRequired(
      doc.vendor_approval_required !== false && doc.vendor_product_approval_required !== false
    );
    setEcomFlow(normalizeEcomFlowFromDoc(doc));
    setPincodeDraft("");
    const bust = doc.updatedAt || doc._id || Date.now();
    const withBust = (url) => (url ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(bust))}` : "");
    const a = withBust(doc.admin_logo ? mediaUrl(doc.admin_logo) : "");
    const u = withBust(doc.user_logo ? mediaUrl(doc.user_logo) : "");
    const f = withBust(doc.favicon ? mediaUrl(doc.favicon) : "");
    setServerMedia({ admin: a, user: u, fav: f });
    setAdminLogoPreview(a);
    setUserLogoPreview(u);
    setFaviconPreview(f);
  }, []);

  useEffect(() => {
    if (!adminToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const body = await getAppConfig(adminToken);
        if (cancelled) return;
        const doc = Array.isArray(body?.data) ? body.data[0] : body?.data;
        if (doc) {
          applyConfig(doc);
        } else {
          // No AppConfig document in DB yet — open empty form so admin can create it.
          applyConfig(null);
        }
      } catch (e) {
        if (!cancelled) {
          if (e?.status === 401) {
            dispatch(logout());
            return;
          }
          await Swal.fire({
            icon: "error",
            title: "Load failed",
            text: e.message || "Failed to load app configuration.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, applyConfig, dispatch]);

  useEffect(() => {
    if (!adminToken) {
      setCityOptions([]);
      setSubDistrictOptions([]);
      setStateOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [{ cities }, { subDistricts }, { states }] = await Promise.all([
          adminListCities(adminToken, { all: true, status: "active", limit: 500 }),
          adminListSubDistricts(adminToken, { all: true, status: "active", limit: 500 }),
          adminListStates(adminToken, { all: true, status: "active", limit: 500 }),
        ]);
        if (!cancelled) {
          setCityOptions(cities ?? []);
          setSubDistrictOptions(subDistricts ?? []);
          setStateOptions(states ?? []);
        }
      } catch {
        if (!cancelled) {
          setCityOptions([]);
          setSubDistrictOptions([]);
          setStateOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken]);

  const reloadLocationOptions = useCallback(async () => {
    if (!adminToken) return;
    const [{ cities }, { subDistricts }] = await Promise.all([
      adminListCities(adminToken, { all: true, status: "active", limit: 500 }),
      adminListSubDistricts(adminToken, { all: true, status: "active", limit: 500 }),
    ]);
    setCityOptions(cities ?? []);
    setSubDistrictOptions(subDistricts ?? []);
  }, [adminToken]);

  const handleQuickAddCity = async () => {
    if (!adminToken) return;
    const name = quickCityForm.name.trim();
    const state = quickCityForm.state;
    const pincode = quickCityForm.pincode.trim();
    if (!name || !state) {
      await Swal.fire({ icon: "error", title: "Validation", text: "State and city name are required." });
      return;
    }
    setAddingQuickCity(true);
    try {
      const created = await adminCreateCity(adminToken, {
        name,
        state,
        pincode: pincode || undefined,
        status: "active",
      });
      await reloadLocationOptions();
      const newId = String(created._id);
      setEcomFlow((prev) => ({
        ...prev,
        cities: prev.cities.includes(newId) ? prev.cities : [...prev.cities, newId],
      }));
      setQuickCityForm(emptyQuickCityForm());
      setQuickSubDistrictForm((prev) => ({ ...prev, city: newId }));
      await Swal.fire({ icon: "success", title: "City added", timer: 1200, showConfirmButton: false });
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Add failed", text: err.message || "Could not add city." });
    } finally {
      setAddingQuickCity(false);
    }
  };

  const handleQuickAddSubDistrict = async () => {
    if (!adminToken) return;
    const name = quickSubDistrictForm.name.trim();
    const city = quickSubDistrictForm.city;
    if (!name || !city) {
      await Swal.fire({ icon: "error", title: "Validation", text: "City and sub-district name are required." });
      return;
    }
    setAddingQuickSubDistrict(true);
    try {
      const created = await adminCreateSubDistrict(adminToken, {
        name,
        city,
        status: "active",
      });
      await reloadLocationOptions();
      const newId = String(created._id);
      setEcomFlow((prev) => ({
        ...prev,
        subDistricts: prev.subDistricts.includes(newId) ? prev.subDistricts : [...prev.subDistricts, newId],
      }));
      setQuickSubDistrictForm(emptyQuickSubDistrictForm());
      await Swal.fire({ icon: "success", title: "Sub-district added", timer: 1200, showConfirmButton: false });
    } catch (err) {
      if (err?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Add failed", text: err.message || "Could not add sub-district." });
    } finally {
      setAddingQuickSubDistrict(false);
    }
  };

  const filteredCityOptions = cityOptions.filter((city) => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return true;
    const stateName = city.state?.name || "";
    return (
      String(city.name || "").toLowerCase().includes(q) ||
      String(stateName).toLowerCase().includes(q) ||
      String(city.pincode || "").includes(q)
    );
  });

  const filteredSubDistrictOptions = subDistrictOptions.filter((row) => {
    const q = subDistrictSearch.trim().toLowerCase();
    if (!q) return true;
    const cityName = row.city?.name || "";
    const stateName = row.city?.state?.name || "";
    return (
      String(row.name || "").toLowerCase().includes(q) ||
      String(cityName).toLowerCase().includes(q) ||
      String(stateName).toLowerCase().includes(q)
    );
  });

  const buildFormData = () => {
    const fd = new FormData();
    for (const k of SCALAR_KEYS) {
      fd.append(k, scalars[k] ?? "");
    }
    fd.append("payment_methods", JSON.stringify(methodsForApi(paymentMethods)));
    fd.append("payment_gateways", JSON.stringify(gatewaysForApi(paymentGateways, paymentMethods)));
    fd.append("documents", JSON.stringify(documentsForApi(documents)));
    fd.append("commissions", JSON.stringify(commissionsForApi(commissions)));
    fd.append("vendor_approval_required", vendorApprovalRequired ? "true" : "false");
    fd.append("vendor_product_approval_required", vendorApprovalRequired ? "true" : "false");
    fd.append("ecom_flow", JSON.stringify(ecomFlowForApi(ecomFlow)));
    if (adminLogoFile) fd.append("admin_logo", adminLogoFile);
    if (userLogoFile) fd.append("user_logo", userLogoFile);
    if (faviconFile) fd.append("favicon", faviconFile);
    return fd;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!adminToken) {
      await Swal.fire({ icon: "error", title: "Not signed in", text: "You are not signed in." });
      return;
    }
    const validationError = validateSettingsForm({ scalars, paymentMethods, paymentGateways, commissions, ecomFlow });
    if (validationError) {
      setTab(validationError.tab);
      await Swal.fire({ icon: "error", title: "Validation error", text: validationError.text });
      return;
    }
    setSaving(true);
    try {
      const fd = buildFormData();
      if (hasDoc) {
        await patchAppConfig(adminToken, fd);
      } else {
        await postAppConfig(adminToken, fd);
      }
      await Swal.fire({
        icon: "success",
        title: hasDoc ? "Settings saved" : "Settings created",
        timer: 1500,
      });
      dispatch(fetchAppConfig(adminToken));
      const refreshed = await getAppConfig(adminToken);
      const doc = Array.isArray(refreshed?.data) ? refreshed.data[0] : refreshed?.data;
      applyConfig(doc);
      setAdminLogoFile(null);
      setUserLogoFile(null);
      setFaviconFile(null);
    } catch (err) {
      if (err?.status === 401) {
        dispatch(logout());
        return;
      }
      await Swal.fire({
        icon: "error",
        title: hasDoc ? "Save failed" : "Create failed",
        text: err.message || "Request failed.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!adminToken) {
    return (
      <div className="page-card">
        <p className="page-card__desc">Sign in to manage app configuration.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-card ">
        <div className="page-card__head">
          <h2 className="page-card__title">Application settings</h2>
        </div>
        <div>
        <div className="d-flex justify-content-center  h-full">
          <FadeLoader height={15} margin={0} radius={35} width={5} color="#6366f1" />
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-card page-card--settings-form">
      <div className="page-card__head">
        <div>
          <h2 className="page-card__title">Application settings</h2>
          <p className="page-card__desc">
            {hasDoc ? "Business Setting" : "No settings found yet — fill the form and create them."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} noValidate>
        <div className="settings-tabs" role="tablist" aria-label="Application settings sections">
          {SETTINGS_TABS.map((t) => {
            const tabId = `${baseId}-tab-${t.id}`;
            const panelId = `${baseId}-panel-${t.id}`;
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={tabId}
                className={`settings-tabs__tab${selected ? " settings-tabs__tab--active" : ""}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {SETTINGS_TABS.map((t) => {
          const panelId = `${baseId}-panel-${t.id}`;
          const tabId = `${baseId}-tab-${t.id}`;
          if (tab !== t.id) return null;
          return (
            <div
              key={t.id}
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId}
              className="settings-tab-panel"
            >
              {t.id === "general" && (
                <>
                  {/* <p className="settings-panel-hint">Core identity fields (required; cannot be left blank on save).</p> */}
                  <div className="user-form__grid">
                    <div className="user-field ">
                      <span className="user-field__label">App name <span className="required-dot">*</span></span>
                      <input
                        className="user-field__input"
                        value={scalars.app_name}
                        onChange={(e) => setScalars((s) => ({ ...s, app_name: e.target.value }))}
                        required
                        maxLength={LIMITS.appName}
                        autoComplete="organization"
                      />
                      <span className="settings-char-count">{charCount(scalars.app_name, LIMITS.appName)}</span>
                    </div>
                    {commissions.map((row) => (
                      <div className="user-field" key={row.type}>
                        <span className="user-field__label">
                          {row.label}(%) <span className="required-dot">*</span>
                        </span>
                        <input
                          type="number"
                          className="user-field__input"
                          min={0}
                          max={100}
                          step={0.01}
                          value={row.percentage}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") {
                              setCommissions((prev) =>
                                prev.map((c) => (c.type === row.type ? { ...c, percentage: 0 } : c)),
                              );
                              return;
                            }
                            const n = Number.parseFloat(v);
                            if (!Number.isFinite(n)) return;
                            setCommissions((prev) =>
                              prev.map((c) =>
                                c.type === row.type
                                  ? { ...c, percentage: Math.min(100, Math.max(0, n)) }
                                  : c,
                              ),
                            );
                          }}
                          inputMode="decimal"
                          aria-label={`${row.label} percentage`}
                        />
                      </div>
                    ))}

                    <div className="user-field">
                      <span className="user-field__label">
                        Shipping charge (₹) <span className="required-dot">*</span>
                      </span>
                      <input
                        type="number"
                        className="user-field__input"
                        min={0}
                        step={1}
                        value={scalars.shipping_charge}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setScalars((s) => ({ ...s, shipping_charge: "0" }));
                            return;
                          }
                          const n = Number.parseFloat(v);
                          if (!Number.isFinite(n) || n < 0) return;
                          setScalars((s) => ({ ...s, shipping_charge: String(n) }));
                        }}
                        inputMode="decimal"
                        aria-label="Shipping charge in rupees"
                      />
                      <span className="settings-panel-hint">Flat delivery fee added to cart checkout total.</span>
                    </div>

                    <div className="user-field">
                      <span className="user-field__label">Support email <span className="required-dot">*</span></span>
                      <input
                        type="email"
                        className="user-field__input"
                        value={scalars.app_email}
                        onChange={(e) => setScalars((s) => ({ ...s, app_email: e.target.value }))}
                        required
                        maxLength={LIMITS.appEmail}
                        autoComplete="email"
                      />
                      <span className="settings-char-count">{charCount(scalars.app_email, LIMITS.appEmail)}</span>
                    </div>
                    <div className="user-field">
                      <span className="user-field__label">Support mobile <span className="required-dot">*</span></span>
                      <input
                        className="user-field__input"
                        value={scalars.app_mobile}
                        onChange={(e) =>
                          setScalars((s) => ({ ...s, app_mobile: sanitizePhoneInput(e.target.value) }))
                        }
                        required
                        maxLength={10}
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="user-field">
                      <span className="user-field__label">Short app detail</span>
                      <input
                        className="user-field__input"
                        value={scalars.app_detail}
                        onChange={(e) => setScalars((s) => ({ ...s, app_detail: e.target.value }))}
                        maxLength={LIMITS.appDetail}
                      />
                      <span className="settings-char-count">{charCount(scalars.app_detail, LIMITS.appDetail)}</span>
                    </div>
                    <div className="user-field ">
                      <span className="user-field__label">Footer text <span className="required-dot">*</span></span>
                      <textarea
                        className="user-field__input"
                        rows={3}
                        value={scalars.app_footer_text}
                        onChange={(e) => setScalars((s) => ({ ...s, app_footer_text: e.target.value }))}
                        maxLength={LIMITS.footerText}
                      />
                      <span className="settings-char-count">{charCount(scalars.app_footer_text, LIMITS.footerText)}</span>
                    </div>      
                  </div>
                </>
              )}

              {t.id === "branding" && (
                <>
                  <p className="settings-panel-hint">Uploads replace existing files only when you pick a new file.</p>
                  <div className="settings-media-grid">
                    <div className="settings-media-card">
                      <label className="settings-media-card__label" htmlFor={`${baseId}-admin-logo`}>
                        Admin logo
                        <span className="settings-media-card__hint">Shown in admin UI</span>
                      </label>
                      <input
                        id={`${baseId}-admin-logo`}
                        type="file"
                        accept="image/*"
                        className="settings-media-card__input user-field__input"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setAdminLogoFile(f || null);
                          setAdminLogoPreview(f ? URL.createObjectURL(f) : serverMedia.admin);
                        }}
                      />
                      <div className="settings-media-card__preview">
                        {adminLogoPreview ? <img src={adminLogoPreview} alt="Admin logo preview" /> : null}
                      </div>
                    </div>
                    <div className="settings-media-card">
                      <label className="settings-media-card__label" htmlFor={`${baseId}-user-logo`}>
                        Storefront logo
                        <span className="settings-media-card__hint">Customer-facing app</span>
                      </label>
                      <input
                        id={`${baseId}-user-logo`}
                        type="file"
                        accept="image/*"
                        className="settings-media-card__input user-field__input"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setUserLogoFile(f || null);
                          setUserLogoPreview(f ? URL.createObjectURL(f) : serverMedia.user);
                        }}
                      />
                      <div className="settings-media-card__preview">
                        {userLogoPreview ? <img src={userLogoPreview} alt="Storefront logo preview" /> : null}
                      </div>
                    </div>
                    <div className="settings-media-card">
                      <label className="settings-media-card__label" htmlFor={`${baseId}-favicon`}>
                        Favicon
                        <span className="settings-media-card__hint">ICO or PNG</span>
                      </label>
                      <input
                        id={`${baseId}-favicon`}
                        type="file"
                        accept="image/*,.ico"
                        className="settings-media-card__input user-field__input"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setFaviconFile(f || null);
                          setFaviconPreview(f ? URL.createObjectURL(f) : serverMedia.fav);
                        }}
                      />
                      <div className="settings-media-card__preview settings-media-card__preview--favicon">
                        {faviconPreview ? <img src={faviconPreview} alt="Favicon preview" /> : null}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {t.id === "location" && (
                <>
                  <p className="settings-panel-hint">Physical address and map coordinates (optional).</p>
                  <div className="settings-location">
                    <div className="user-form__grid settings-location__form">
                 
                      <div className="user-field">
                        <span className="user-field__label">Latitude</span>
                        <input
                          className="user-field__input"
                          value={scalars.latitude}
                          onChange={(e) => setScalars((s) => ({ ...s, latitude: e.target.value }))}
                          maxLength={LIMITS.latLng}
                        />
                        <span className="settings-char-count">{charCount(scalars.latitude, LIMITS.latLng)}</span>
                      </div>
                      <div className="user-field">
                        <span className="user-field__label">Longitude</span>
                        <input
                          className="user-field__input"
                          value={scalars.longitude}
                          onChange={(e) => setScalars((s) => ({ ...s, longitude: e.target.value }))}
                          maxLength={LIMITS.latLng}
                        />
                        <span className="settings-char-count">{charCount(scalars.longitude, LIMITS.latLng)}</span>
                      </div>

                      <div className="user-field ">
                        <span className="user-field__label">Address</span>
                        <textarea
                          className="user-field__input"
                          rows={3}
                          value={scalars.address}
                          onChange={(e) => setScalars((s) => ({ ...s, address: e.target.value }))}
                          maxLength={LIMITS.address}
                        />
                        <span className="settings-char-count">{charCount(scalars.address, LIMITS.address)}</span>
                      </div>
                    </div>

                    <div className="settings-location__map-wrap">
                      <span className="user-field__label">Map preview</span>
                      {hasValidCoords ? (
                        <iframe
                          title="Location preview"
                          src={mapSrc}
                          className="settings-location__map"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      ) : (
                        <div className="settings-location__empty">Enter valid latitude and longitude to preview map.</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {t.id === "social" && (
                <>
                  <p className="settings-panel-hint">Full profile or page URLs.</p>
                  <div className="user-form__grid">
                    <div className="user-field ">
                      <span className="user-field__label">Facebook</span>
                      <input
                        className="user-field__input"
                        value={scalars.facebook}
                        onChange={(e) => setScalars((s) => ({ ...s, facebook: e.target.value }))}
                        placeholder="https://"
                        maxLength={LIMITS.socialUrl}
                      />
                      <span className="settings-char-count">{charCount(scalars.facebook, LIMITS.socialUrl)}</span>
                    </div>
                    <div className="user-field">
                      <span className="user-field__label">Twitter / X</span>
                      <input
                        className="user-field__input"
                        value={scalars.twitter}
                        onChange={(e) => setScalars((s) => ({ ...s, twitter: e.target.value }))}
                        placeholder="https://"
                        maxLength={LIMITS.socialUrl}
                      />
                      <span className="settings-char-count">{charCount(scalars.twitter, LIMITS.socialUrl)}</span>
                    </div>
                    <div className="user-field ">
                      <span className="user-field__label">Instagram</span>
                      <input
                        className="user-field__input"
                        value={scalars.instagram}
                        onChange={(e) => setScalars((s) => ({ ...s, instagram: e.target.value }))}
                        placeholder="https://"
                        maxLength={LIMITS.socialUrl}
                      />
                      <span className="settings-char-count">{charCount(scalars.instagram, LIMITS.socialUrl)}</span>
                    </div>
                    <div className="user-field ">
                      <span className="user-field__label">LinkedIn</span>
                      <input
                        className="user-field__input"
                        value={scalars.linkedin}
                        onChange={(e) => setScalars((s) => ({ ...s, linkedin: e.target.value }))}
                        placeholder="https://"
                        maxLength={LIMITS.socialUrl}
                      />
                      <span className="settings-char-count">{charCount(scalars.linkedin, LIMITS.socialUrl)}</span>
                    </div>
                  </div>
                </>
              )}

              {t.id === "content" && (
                <>
                  <p className="settings-panel-hint">Long-form copy shown in app or footer areas.</p>
                  <div className="user-form__grid">
                    <div className="user-field user-field--full">
                      <span className="user-field__label">App details</span>
                      <textarea
                        className="user-field__input"
                        rows={6}
                        value={scalars.app_details}
                        onChange={(e) => setScalars((s) => ({ ...s, app_details: e.target.value }))}
                        maxLength={LIMITS.appDetails}
                      />
                      <span className="settings-char-count">{charCount(scalars.app_details, LIMITS.appDetails)}</span>
                    </div>
                    <div className="user-field ">
                      <span className="user-field__label">Footer text <span className="required-dot">*</span></span>
                      <textarea
                        className="user-field__input"
                        rows={3}
                        value={scalars.app_footer_text}
                        onChange={(e) => setScalars((s) => ({ ...s, app_footer_text: e.target.value }))}
                        maxLength={LIMITS.footerText}
                      />
                      <span className="settings-char-count">{charCount(scalars.app_footer_text, LIMITS.footerText)}</span>
                    </div>
                  </div>
                </>
              )}

              {t.id === "payment-methods" && (
                <>
                  <p className="settings-panel-hint">
                    Choose which checkout options are available. Changes apply after you save at the bottom of the page.
                  </p>
                  <div className="settings-toggle-list">
                    {paymentMethods.map((m) => (
                      <div key={m.type} className="settings-toggle-row">
                        <div>
                          <span className="settings-toggle-row__label">{m.label}</span>
                          <span className="settings-toggle-row__hint">{m.hint}</span>
                        </div>
                        <SettingsToggle
                          id={`${baseId}-pm-${m.type}`}
                          checked={m.isActive}
                          onChange={(next) =>
                            setPaymentMethods((prev) =>
                              prev.map((x) => (x.type === m.type ? { ...x, isActive: next } : x)),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const razorpay = razorpayGatewayFromList(paymentGateways);
                    const onlinePaymentActive = paymentMethods.some((m) => m.type === "online" && m.isActive);
                    return (
                      <div className="settings-gateway-card settings-gateway-card--inline" style={{ marginTop: 20 }}>
                        <div className="settings-gateway-card__head">
                          <div>
                            <h3 className="settings-gateway-card__title">Razorpay</h3>
                            <p className="settings-toggle-row__hint">
                              Used when Online payment is enabled. Key ID is shared with the app; key secret stays on the server only.
                            </p>
                          </div>
                        </div>
                        <div className="settings-gateway-card__fields">
                          <label className="settings-gateway-card__field" htmlFor={`${baseId}-razorpay-keyid`}>
                            <span>Razorpay Key ID {onlinePaymentActive ? <span className="required-dot">*</span> : null}</span>
                            <input
                              id={`${baseId}-razorpay-keyid`}
                              type="text"
                              autoComplete="off"
                              value={razorpay.credentials.key_id}
                              onChange={(e) =>
                                setPaymentGateways((prev) =>
                                  updateRazorpayCredentials(prev, {
                                    key_id: e.target.value.slice(0, LIMITS.gatewayField),
                                  }),
                                )
                              }
                              placeholder="rzp_test_… / rzp_live_…"
                            />
                            <span className="settings-char-count">{charCount(razorpay.credentials.key_id, LIMITS.gatewayField)}</span>
                          </label>
                          <label className="settings-gateway-card__field" htmlFor={`${baseId}-razorpay-secret`}>
                            <span>Razorpay Key secret {onlinePaymentActive ? <span className="required-dot">*</span> : null}</span>
                            <input
                              id={`${baseId}-razorpay-secret`}
                              type="password"
                              autoComplete="new-password"
                              value={razorpay.credentials.key_secret}
                              onChange={(e) =>
                                setPaymentGateways((prev) =>
                                  updateRazorpayCredentials(prev, {
                                    key_secret: e.target.value.slice(0, LIMITS.gatewayField),
                                  }),
                                )
                              }
                              placeholder="••••••••"
                            />
                            <span className="settings-char-count">{charCount(razorpay.credentials.key_secret, LIMITS.gatewayField)}</span>
                          </label>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {t.id === "ecom-flow" && (
                <>
                  <p className="settings-panel-hint">
                    Control whether customers can use the e-commerce flow. Choose all locations, or restrict by sub-district.
                  </p>
                  <div className="settings-toggle-list" style={{ marginBottom: 16 }}>
                    <div className="settings-toggle-row">
                      <div>
                        <span className="settings-toggle-row__label">Enable e-commerce flow</span>
                        <span className="settings-toggle-row__hint">Master switch for shopping, cart, and checkout</span>
                      </div>
                      <SettingsToggle
                        id={`${baseId}-ecom-enabled`}
                        checked={ecomFlow.enabled}
                        onChange={(next) => setEcomFlow((prev) => ({ ...prev, enabled: next }))}
                      />
                    </div>
                  </div>

                  {ecomFlow.enabled ? (
                    <>
                      <div className="user-field" style={{ marginBottom: 16 }}>
                        <span className="user-field__label">Visibility scope</span>
                        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                          {ECOM_VISIBILITY_SCOPE_OPTIONS.map((opt) => (
                            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="radio"
                                name={`${baseId}-ecom-scope`}
                                checked={ecomFlow.scope === opt.value}
                                onChange={() =>
                                  setEcomFlow((prev) => ({
                                    ...prev,
                                    scope: opt.value,
                                    cities:
                                      opt.value === "city" || opt.value === "sub_district" ? prev.cities : [],
                                    pincodes: opt.value === "pincode" ? prev.pincodes : [],
                                    subDistricts: opt.value === "sub_district" ? prev.subDistricts : [],
                                  }))
                                }
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {ecomFlow.scope !== "all" ? (
                        <div className="user-field" style={{ marginBottom: 16 }}>
                          <span className="user-field__label">Rule</span>
                          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="radio"
                                name={`${baseId}-ecom-rule`}
                                checked={ecomFlow.rule === "block"}
                                onChange={() => setEcomFlow((prev) => ({ ...prev, rule: "block" }))}
                              />
                              <span>
                                Hide e-commerce in selected {ecomScopeLabel(ecomFlow.scope)}
                              </span>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="radio"
                                name={`${baseId}-ecom-rule`}
                                checked={ecomFlow.rule === "allow"}
                                onChange={() => setEcomFlow((prev) => ({ ...prev, rule: "allow" }))}
                              />
                              <span>
                                Show e-commerce only in selected {ecomScopeLabel(ecomFlow.scope)}
                              </span>
                            </label>
                          </div>
                        </div>
                      ) : null}

                      {ecomFlow.scope === "city" ? (
                        <div className="user-field">
                          <span className="user-field__label">Cities</span>
                          <EcomInlinePanel title="Add city">
                            <div className="row g-2 align-items-end">
                              <label className="user-field col-12 col-md-3">
                                <span className="user-field__label">State</span>
                                <select
                                  className="user-field__input"
                                  value={quickCityForm.state}
                                  onChange={(e) => setQuickCityForm((p) => ({ ...p, state: e.target.value }))}
                                >
                                  <option value="">Select state</option>
                                  {stateOptions.map((s) => (
                                    <option key={s._id} value={s._id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="user-field col-12 col-md-3">
                                <span className="user-field__label">City name</span>
                                <input
                                  className="user-field__input"
                                  value={quickCityForm.name}
                                  onChange={(e) => setQuickCityForm((p) => ({ ...p, name: e.target.value }))}
                                  placeholder="e.g. Bhopal"
                                />
                              </label>
                              <label className="user-field col-12 col-md-3">
                                <span className="user-field__label">Pincode (optional)</span>
                                <input
                                  className="user-field__input"
                                  value={quickCityForm.pincode}
                                  onChange={(e) => setQuickCityForm((p) => ({ ...p, pincode: e.target.value }))}
                                  placeholder="462001"
                                />
                              </label>
                              <div className="col-12 col-md-3">
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  style={{ width: "100%" }}
                                  disabled={addingQuickCity}
                                  onClick={() => void handleQuickAddCity()}
                                >
                                  {addingQuickCity ? "Adding…" : "Add city"}
                                </button>
                              </div>
                            </div>
                          </EcomInlinePanel>
                          <AdminSearchField
                            placeholder="Search city, state, or pincode"
                            value={citySearch}
                            onChange={(e) => setCitySearch(e.target.value)}
                            style={{ marginBottom: 10, width: "100%", minWidth: 0 }}
                            aria-label="Search cities"
                          />
                          <div
                            style={{
                              maxHeight: 260,
                              overflowY: "auto",
                              border: "1px solid #e5e7eb",
                              borderRadius: 8,
                              padding: 10,
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            {filteredCityOptions.length === 0 ? (
                              <span className="settings-panel-hint">No active cities found. Use the form above to add one.</span>
                            ) : (
                              filteredCityOptions.map((city) => {
                                const id = String(city._id);
                                const checked = ecomFlow.cities.includes(id);
                                return (
                                  <label key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setEcomFlow((prev) => ({
                                          ...prev,
                                          cities: checked
                                            ? prev.cities.filter((x) => x !== id)
                                            : [...prev.cities, id],
                                        }))
                                      }
                                    />
                                    <span>
                                      {city.name}
                                      {city.state?.name ? `, ${city.state.name}` : ""}
                                      {city.pincode ? ` (${city.pincode})` : ""}
                                    </span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                          <span className="settings-panel-hint" style={{ marginTop: 8, display: "block" }}>
                            Selected: {ecomFlow.cities.length} city{ecomFlow.cities.length === 1 ? "" : "ies"}
                          </span>
                        </div>
                      ) : null}

                      {ecomFlow.scope === "sub_district" ? (
                        <>
                          <div className="user-field" style={{ marginBottom: 16 }}>
                            <span className="user-field__label">Sub-Districts</span>
                            <EcomInlinePanel title="Add sub-district">
                              <div className="row g-2 align-items-end">
                                <label className="user-field col-12 col-md-4">
                                  <span className="user-field__label">City</span>
                                  <select
                                    className="user-field__input"
                                    value={quickSubDistrictForm.city}
                                    onChange={(e) =>
                                      setQuickSubDistrictForm((p) => ({ ...p, city: e.target.value }))
                                    }
                                  >
                                    <option value="">Select city</option>
                                    {cityOptions.map((c) => (
                                      <option key={c._id} value={c._id}>
                                        {c.name}
                                        {c.state?.name ? `, ${c.state.name}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="user-field col-12 col-md-4">
                                  <span className="user-field__label">Sub-district name</span>
                                  <input
                                    className="user-field__input"
                                    value={quickSubDistrictForm.name}
                                    onChange={(e) =>
                                      setQuickSubDistrictForm((p) => ({ ...p, name: e.target.value }))
                                    }
                                    placeholder="e.g. Huzur"
                                  />
                                </label>
                                <div className="col-12 col-md-4">
                                  <button
                                    type="button"
                                    className="btn btn--ghost"
                                    style={{ width: "100%" }}
                                    disabled={addingQuickSubDistrict}
                                    onClick={() => void handleQuickAddSubDistrict()}
                                  >
                                    {addingQuickSubDistrict ? "Adding…" : "Add sub-district"}
                                  </button>
                                </div>
                              </div>
                            </EcomInlinePanel>
                            <AdminSearchField
                              placeholder="Search sub-district, city, or state"
                              value={subDistrictSearch}
                              onChange={(e) => setSubDistrictSearch(e.target.value)}
                              style={{ marginBottom: 10, width: "100%", minWidth: 0 }}
                              aria-label="Search sub-districts"
                            />
                            <div
                              style={{
                                maxHeight: 220,
                                overflowY: "auto",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                padding: 10,
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              {filteredSubDistrictOptions.length === 0 ? (
                                <span className="settings-panel-hint">
                                  No active sub-districts found. Use the form above to add one.
                                </span>
                              ) : (
                                filteredSubDistrictOptions.map((row) => {
                                  const id = String(row._id);
                                  const checked = ecomFlow.subDistricts.includes(id);
                                  return (
                                    <label key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setEcomFlow((prev) => ({
                                            ...prev,
                                            subDistricts: checked
                                              ? prev.subDistricts.filter((x) => x !== id)
                                              : [...prev.subDistricts, id],
                                          }))
                                        }
                                      />
                                      <span>
                                        {row.name}
                                        {row.city?.name ? ` · ${row.city.name}` : ""}
                                        {row.city?.state?.name ? `, ${row.city.state.name}` : ""}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                            <span className="settings-panel-hint" style={{ marginTop: 8, display: "block" }}>
                              Selected: {ecomFlow.subDistricts.length} sub-district
                              {ecomFlow.subDistricts.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          {SHOW_ECOM_OPTIONAL_CITY_RULE ? (
                          <div className="user-field">
                            <span className="user-field__label">Cities (optional whole-city rule)</span>
                            <EcomInlinePanel title="Add city">
                              <div className="row g-2 align-items-end">
                                <label className="user-field col-12 col-md-3">
                                  <span className="user-field__label">State</span>
                                  <select
                                    className="user-field__input"
                                    value={quickCityForm.state}
                                    onChange={(e) => setQuickCityForm((p) => ({ ...p, state: e.target.value }))}
                                  >
                                    <option value="">Select state</option>
                                    {stateOptions.map((s) => (
                                      <option key={s._id} value={s._id}>
                                        {s.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="user-field col-12 col-md-3">
                                  <span className="user-field__label">City name</span>
                                  <input
                                    className="user-field__input"
                                    value={quickCityForm.name}
                                    onChange={(e) => setQuickCityForm((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Bhopal"
                                  />
                                </label>
                                <label className="user-field col-12 col-md-3">
                                  <span className="user-field__label">Pincode (optional)</span>
                                  <input
                                    className="user-field__input"
                                    value={quickCityForm.pincode}
                                    onChange={(e) => setQuickCityForm((p) => ({ ...p, pincode: e.target.value }))}
                                  />
                                </label>
                                <div className="col-12 col-md-3">
                                  <button
                                    type="button"
                                    className="btn btn--ghost"
                                    style={{ width: "100%" }}
                                    disabled={addingQuickCity}
                                    onClick={() => void handleQuickAddCity()}
                                  >
                                    {addingQuickCity ? "Adding…" : "Add city"}
                                  </button>
                                </div>
                              </div>
                            </EcomInlinePanel>
                            <AdminSearchField
                              placeholder="Search city, state, or pincode"
                              value={citySearch}
                              onChange={(e) => setCitySearch(e.target.value)}
                              style={{ marginBottom: 10, width: "100%", minWidth: 0 }}
                              aria-label="Search cities by pincode"
                            />
                            <div
                              style={{
                                maxHeight: 220,
                                overflowY: "auto",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                padding: 10,
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              {filteredCityOptions.length === 0 ? (
                                <span className="settings-panel-hint">No active cities found.</span>
                              ) : (
                                filteredCityOptions.map((city) => {
                                  const id = String(city._id);
                                  const checked = ecomFlow.cities.includes(id);
                                  return (
                                    <label key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setEcomFlow((prev) => ({
                                            ...prev,
                                            cities: checked
                                              ? prev.cities.filter((x) => x !== id)
                                              : [...prev.cities, id],
                                          }))
                                        }
                                      />
                                      <span>
                                        {city.name}
                                        {city.state?.name ? `, ${city.state.name}` : ""}
                                        {city.pincode ? ` (${city.pincode})` : ""}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                            <span className="settings-panel-hint" style={{ marginTop: 8, display: "block" }}>
                              Selected: {ecomFlow.cities.length} city{ecomFlow.cities.length === 1 ? "" : "ies"}. Selecting a city applies the rule to all sub-districts in that city.
                            </span>
                          </div>
                          ) : null}
                        </>
                      ) : null}

                      {ecomFlow.scope === "pincode" ? (
                        <div className="user-field">
                          <span className="user-field__label">Pincodes</span>
                          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            <input
                              className="user-field__input"
                              placeholder="Enter pincode"
                              value={pincodeDraft}
                              onChange={(e) => setPincodeDraft(e.target.value.replace(/\s+/g, "").slice(0, 10))}
                              maxLength={10}
                            />
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => {
                                const next = pincodeDraft.trim();
                                if (!/^[a-zA-Z0-9-]{4,10}$/.test(next)) {
                                  void Swal.fire({
                                    icon: "error",
                                    title: "Invalid pincode",
                                    text: "Pincode must be 4-10 characters (letters, numbers, dash).",
                                  });
                                  return;
                                }
                                if (ecomFlow.pincodes.includes(next)) {
                                  setPincodeDraft("");
                                  return;
                                }
                                setEcomFlow((prev) => ({ ...prev, pincodes: [...prev.pincodes, next] }));
                                setPincodeDraft("");
                              }}
                            >
                              Add
                            </button>
                          </div>
                          {ecomFlow.pincodes.length ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {ecomFlow.pincodes.map((pin) => (
                                <span
                                  key={pin}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    background: "#f3f4f6",
                                  }}
                                >
                                  {pin}
                                  <button
                                    type="button"
                                    aria-label={`Remove ${pin}`}
                                    onClick={() =>
                                      setEcomFlow((prev) => ({
                                        ...prev,
                                        pincodes: prev.pincodes.filter((x) => x !== pin),
                                      }))
                                    }
                                    style={{ border: 0, background: "transparent", cursor: "pointer" }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="settings-panel-hint">No pincodes added yet.</span>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="settings-panel-hint">E-commerce is disabled for all users until you turn it back on.</p>
                  )}
                </>
              )}

              {t.id === "payment-gateways" && (
                <>
                  <p className="settings-panel-hint">
                    Turn a gateway on only when credentials are correct. Key ID and key secret are required for most
                    providers; webhook and merchant fields are optional depending on your integration.
                  </p>
                  <div className="settings-gateway-grid">
                    {paymentGateways.map((g) => {
                      const def = GATEWAY_DEFS.find((d) => d.provider === g.provider);
                      const title = (def?.title ?? g.provider).toUpperCase();
                      return (
                        <div key={g.provider} className="settings-gateway-card">
                          <div className="settings-gateway-card__head">
                            <h3 className="settings-gateway-card__title">{title}</h3>
                            <SettingsToggle
                              id={`${baseId}-gw-${g.provider}`}
                              checked={g.isActive}
                              onChange={(next) =>
                                setPaymentGateways((prev) =>
                                  prev.map((x) => (x.provider === g.provider ? { ...x, isActive: next } : x)),
                                )
                              }
                            />
                          </div>
                          <div className="settings-gateway-card__fields">
                            <label className="settings-gateway-card__field" htmlFor={`${baseId}-${g.provider}-keyid`}>
                              <span>Key ID {g.isActive ? <span className="required-dot">*</span> : null}</span>
                              <input
                                id={`${baseId}-${g.provider}-keyid`}
                                type="text"
                                autoComplete="off"
                                value={g.credentials.key_id}
                                onChange={(e) =>
                                  setPaymentGateways((prev) =>
                                    prev.map((x) =>
                                      x.provider === g.provider
                                        ? {
                                            ...x,
                                            credentials: { ...x.credentials, key_id: e.target.value.slice(0, LIMITS.gatewayField) },
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                placeholder="pk_… / rzp_… / client id"
                              />
                              <span className="settings-char-count">{charCount(g.credentials.key_id, LIMITS.gatewayField)}</span>
                            </label>
                            <label className="settings-gateway-card__field" htmlFor={`${baseId}-${g.provider}-secret`}>
                              <span>Key secret {g.isActive ? <span className="required-dot">*</span> : null}</span>
                              <input
                                id={`${baseId}-${g.provider}-secret`}
                                type="password"
                                autoComplete="new-password"
                                value={g.credentials.key_secret}
                                onChange={(e) =>
                                  setPaymentGateways((prev) =>
                                    prev.map((x) =>
                                      x.provider === g.provider
                                        ? {
                                            ...x,
                                            credentials: { ...x.credentials, key_secret: e.target.value.slice(0, LIMITS.gatewayField) },
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                placeholder="••••••••"
                              />
                              <span className="settings-char-count">{charCount(g.credentials.key_secret, LIMITS.gatewayField)}</span>
                            </label>
                          </div>
                          <div className="settings-gateway-card__extras">
                            <label className="settings-gateway-card__field" htmlFor={`${baseId}-${g.provider}-wh`}>
                              <span>Webhook secret (optional)</span>
                              <input
                                id={`${baseId}-${g.provider}-wh`}
                                type="password"
                                autoComplete="new-password"
                                value={g.credentials.webhook_secret}
                                onChange={(e) =>
                                  setPaymentGateways((prev) =>
                                    prev.map((x) =>
                                      x.provider === g.provider
                                        ? {
                                            ...x,
                                            credentials: { ...x.credentials, webhook_secret: e.target.value.slice(0, LIMITS.gatewayField) },
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                placeholder="whsec_…"
                              />
                              <span className="settings-char-count">{charCount(g.credentials.webhook_secret, LIMITS.gatewayField)}</span>
                            </label>
                            <label className="settings-gateway-card__field" htmlFor={`${baseId}-${g.provider}-mid`}>
                              <span>Merchant ID (optional)</span>
                              <input
                                id={`${baseId}-${g.provider}-mid`}
                                type="text"
                                autoComplete="off"
                                value={g.credentials.merchant_id}
                                onChange={(e) =>
                                  setPaymentGateways((prev) =>
                                    prev.map((x) =>
                                      x.provider === g.provider
                                        ? {
                                            ...x,
                                            credentials: { ...x.credentials, merchant_id: e.target.value.slice(0, LIMITS.gatewayField) },
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                placeholder="Paytm / PayPal merchant id"
                              />
                              <span className="settings-char-count">{charCount(g.credentials.merchant_id, LIMITS.gatewayField)}</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {t.id === "documents" && (
                <>
                  <p className="settings-panel-hint">
                    Control which document types vendors can submit for verification.
                  </p>
                  <div className="settings-toggle-list">
                    {documents.map((d) => (
                      <div key={d.type} className="settings-toggle-row">
                        <div>
                          <span className="settings-toggle-row__label">{d.label}</span>
                          <span className="settings-toggle-row__hint">
                            {d.hint} · <code>{d.type}</code>
                          </span>
                        </div>
                        <SettingsToggle
                          id={`${baseId}-doc-${d.type.replace(/\s+/g, "-")}`}
                          checked={d.isActive}
                          onChange={(next) =>
                            setDocuments((prev) =>
                              prev.map((x) => (x.type === d.type ? { ...x, isActive: next } : x)),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {t.id === "approvals" && (
                <>
                  <p className="settings-panel-hint">
                    When enabled, vendor and service-vendor submissions stay pending until an admin approves them.
                  </p>
                  <div className="settings-toggle-list">
                    <div className="settings-toggle-row">
                      <div>
                        <span className="settings-toggle-row__label">Require admin approval</span>
                        <span className="settings-toggle-row__hint">
                          Registration, products, services, categories, sub-categories, and child categories.
                        </span>
                      </div>
                      <SettingsToggle
                        id={`${baseId}-vendor-approval`}
                        checked={vendorApprovalRequired}
                        onChange={setVendorApprovalRequired}
                      />
                    </div>
                  </div>
                  <p className="settings-panel-hint mt-3">
                    {vendorApprovalRequired
                      ? "On: vendor registration, catalog items, products, and service listings need admin approval."
                      : "Off: all of the above are auto-approved when vendors submit them."}
                  </p>
                </>
              )}
            </div>
          );
        })}

        <div className="settings-form-footer settings-form-footer--centered">
          <button type="submit" className="btn--settings-save" disabled={saving}>
            {saving ? "Saving…" : hasDoc ? "Save settings" : "Create settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
