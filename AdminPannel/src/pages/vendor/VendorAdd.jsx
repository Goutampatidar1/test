import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { adminCreateVendor, adminUpdateVendor } from "../../api/adminVendors.js";
import { adminListCities } from "../../api/adminCities.js";
import { adminListSubDistricts } from "../../api/adminSubDistricts.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { isValidEmail, sanitizePhoneInput, validateIndianMobileMessage } from "../../utils/validation.js";

const NAME_REGEX = /^[A-Za-z ]{2,80}$/;
const ACCOUNT_NO_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
/** Per file-picker batch and per save (matches multer `shopImages` maxCount in authMultipart.js). Not a total gallery cap—save, then add another batch. */
const MAX_SHOP_IMAGES_PER_BATCH = 20;
/** Per file-picker batch and per save (matches multer `shopVideos` maxCount in authMultipart.js). */
const MAX_SHOP_VIDEOS_PER_BATCH = 10;

function revokeIfBlob(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function trimVendorValues(values) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    businessName: values.businessName.trim(),
    bankName: values.bankName.trim(),
    accountNo: values.accountNo.trim(),
    ifsc: values.ifsc.trim().toUpperCase(),
    businessPhone: values.businessPhone.trim(),
    gstin: values.gstin.trim().toUpperCase(),
    panCardNumber: values.panCardNumber.trim().toUpperCase(),
  };
}

function collectPersonalTabErrors(values) {
  const errors = [];
  const trimmed = trimVendorValues(values);

  if (!trimmed.name) errors.push("Full name");
  else if (!NAME_REGEX.test(trimmed.name)) errors.push("Valid full name");
  if (trimmed.email && !isValidEmail(trimmed.email)) errors.push("Valid email address");
  if (!trimmed.phone) errors.push("Mobile number");
  else {
    const phoneError = validateIndianMobileMessage(trimmed.phone, { required: true, label: "Mobile number" });
    if (phoneError) errors.push(phoneError);
  }
  if (!values.cityId) errors.push("City");

  return errors;
}

function collectBusinessTabErrors(values) {
  const errors = [];
  const trimmed = trimVendorValues(values);

  if (!trimmed.businessName) errors.push("Shop name");
  if (!trimmed.businessPhone) errors.push("Business mobile number");
  else {
    const businessPhoneError = validateIndianMobileMessage(trimmed.businessPhone, {
      required: true,
      label: "Business mobile number",
    });
    if (businessPhoneError) errors.push(businessPhoneError);
  }
  if (!String(values.businessAddress || "").trim()) errors.push("Address");
  if (trimmed.gstin && !GSTIN_REGEX.test(trimmed.gstin)) errors.push("Valid GSTIN");
  if (trimmed.panCardNumber && !PAN_REGEX.test(trimmed.panCardNumber)) errors.push("Valid PAN number");
  if (String(values.shopDescription || "").trim().length > 100) {
    errors.push("Shop description (max 100 characters)");
  }

  return errors;
}

function collectMediaTabErrors(values, extras = {}) {
  const errors = [];
  const hasBanner = Boolean(String(values.shopBanner || "").trim() || extras.shopBannerFile);
  if (!hasBanner) errors.push("Shop banner image");
  return errors;
}

function collectBankTabErrors(values) {
  const errors = [];
  const trimmed = trimVendorValues(values);

  if (trimmed.accountNo && !ACCOUNT_NO_REGEX.test(trimmed.accountNo)) {
    errors.push("Valid account number (9–18 digits)");
  }
  if (trimmed.ifsc && !IFSC_REGEX.test(trimmed.ifsc)) errors.push("Valid IFSC code");

  return errors;
}

function tabValidationFailure(tabId, errors) {
  const list = errors.map((field) => `• ${field}`).join("\n");
  return {
    tab: tabId,
    message: errors[0],
    errors,
    blockedMessage: `Can't move to the next step. Please complete the required fields on this tab:\n\n${list}`,
  };
}

function validatePersonalTab(values) {
  const errors = collectPersonalTabErrors(values);
  return errors.length ? tabValidationFailure("personal", errors) : null;
}

function validateBusinessTab(values) {
  const errors = collectBusinessTabErrors(values);
  return errors.length ? tabValidationFailure("business", errors) : null;
}

function validateBankTab(values) {
  const errors = collectBankTabErrors(values);
  return errors.length ? tabValidationFailure("bank", errors) : null;
}

function validateMediaTab(values, options = {}) {
  const errors = collectMediaTabErrors(values, options);
  return errors.length ? tabValidationFailure("media", errors) : null;
}

function validateVendorTab(values, tabId, options = {}) {
  if (tabId === "personal") return validatePersonalTab(values);
  if (tabId === "business") return validateBusinessTab(values);
  if (tabId === "bank") return validateBankTab(values);
  if (tabId === "media") return validateMediaTab(values, options);
  return null;
}

function validateVendorForm(values, options = {}) {
  for (const tabId of ["personal", "business", "bank", "media"]) {
    const error = validateVendorTab(values, tabId, options);
    if (error) return error;
  }
  return null;
}

function emptyVendorForm() {
  return {
    name: "",
    email: "",
    phone: "",
    businessName: "",
    businessPhone: "",
    gstin: "",
    panCardNumber: "",
    businessAddress: "",
    shopDescription: "",
    aadhaarCardFront: "",
    aadhaarCardBack: "",
    panCard: "",
    shopLogo: "",
    shopImages: [],
    shopVideos: [],
    shopBanner: "",
    bankName: "",
    branchName: "",
    accountNo: "",
    ifsc: "",
    accountType: "Current",
    fcm_id: "",
    status: "active",
    approvalStatus: "pending",
    cityId: "",
    subDistrictId: "",
  };
}

function vendorToFormValues(vendor) {
  if (!vendor) return emptyVendorForm();
  return {
    ...emptyVendorForm(),
    name: vendor.name ?? "",
    email: vendor.email ?? "",
    phone: vendor.phone ?? "",
    businessName: vendor.businessName ?? "",
    businessPhone: vendor.businessPhone ?? "",
    gstin: vendor.gstin ?? "",
    panCardNumber: vendor.panCardNumber ?? "",
    businessAddress: vendor.businessAddress ?? "",
    shopDescription: vendor.shopDescription ?? "",
    aadhaarCardFront: vendor.aadhaarCardFront ?? "",
    aadhaarCardBack: vendor.aadhaarCardBack ?? "",
    panCard: vendor.panCardFront ?? vendor.panCard ?? "",
    shopLogo: vendor.shopLogo ?? "",
    shopImages: Array.isArray(vendor.shopImages)
      ? [...vendor.shopImages]
      : vendor.shopImage
        ? [vendor.shopImage]
        : [],
    shopVideos: Array.isArray(vendor.shopVideos) ? [...vendor.shopVideos] : [],
    shopBanner: vendor.shopBanner ?? "",
    bankName: vendor.bankName ?? "",
    branchName: vendor.branchName ?? "",
    accountNo: vendor.accountNo ?? "",
    ifsc: vendor.ifsc ?? "",
    accountType: vendor.accountType ?? "Current",
    fcm_id: vendor.fcm_id ?? "",
    status: vendor.status ?? "active",
    approvalStatus: vendor.approvalStatus ?? "pending",
    cityId: "",
    subDistrictId: "",
  };
}

export function VendorProfileForm({ mode = "create", vendorId = "", initialVendor = null, onCancel, onSuccess }) {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [values, setValues] = useState(() => (initialVendor ? vendorToFormValues(initialVendor) : emptyVendorForm()));
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const fileInputId = useId();
  const shopImagesInputId = useId();
  const shopVideosInputId = useId();
  const [docPreviews, setDocPreviews] = useState({
    aadhaarCardFront: "",
    aadhaarCardBack: "",
    panCard: "",
    shopLogo: "",
    shopBanner: "",
  });
  const [docFiles, setDocFiles] = useState({
    aadhaarCardFront: null,
    aadhaarCardBack: null,
    panCard: null,
    shopLogo: null,
    shopBanner: null,
  });
  const [pendingShopImages, setPendingShopImages] = useState([]);
  const [pendingShopVideos, setPendingShopVideos] = useState([]);
  const [docFieldError, setDocFieldError] = useState("");
  const [tab, setTab] = useState("personal");
  const [cityOptions, setCityOptions] = useState([]);
  const [subDistrictOptions, setSubDistrictOptions] = useState([]);
  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "business", label: "Business Info" },
    { id: "bank", label: "Bank Details" },
    // { id: "documents", label: "Documents" },
    { id: "media", label: "Media" },
  ];
  const tabIndex = tabs.findIndex((t) => t.id === tab);
  const isFirstTab = tabIndex <= 0;
  const isLastTab = tabIndex === tabs.length - 1;

  useEffect(() => {
    if (!initialVendor) {
      setValues(emptyVendorForm());
      setDocPreviews({
        aadhaarCardFront: "",
        aadhaarCardBack: "",
        panCard: "",
        shopLogo: "",
        shopBanner: "",
      });
      setDocFiles({
        aadhaarCardFront: null,
        aadhaarCardBack: null,
        panCard: null,
        shopLogo: null,
        shopBanner: null,
      });
      setPendingShopImages([]);
      setPendingShopVideos([]);
      setDocFieldError("");
      return;
    }
    setValues(vendorToFormValues(initialVendor));
    setProfileFile(null);
    setPreviewUrl(null);
    setDocPreviews({
      aadhaarCardFront: mediaUrl(initialVendor.aadhaarCardFront),
      aadhaarCardBack: mediaUrl(initialVendor.aadhaarCardBack),
      panCard: mediaUrl(initialVendor.panCardFront || initialVendor.panCard),
      shopLogo: mediaUrl(initialVendor.shopLogo),
      shopBanner: mediaUrl(initialVendor.shopBanner),
    });
    setDocFiles({
      aadhaarCardFront: null,
      aadhaarCardBack: null,
      panCard: null,
      shopLogo: null,
      shopBanner: null,
    });
    setPendingShopImages([]);
    setPendingShopVideos([]);
    setDocFieldError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialVendor]);

  useEffect(() => {
    if (!profileFile) return;
    const url = URL.createObjectURL(profileFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);

  useEffect(() => {
    if (!adminToken) {
      setCityOptions([]);
      setSubDistrictOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [{ cities }, { subDistricts }] = await Promise.all([
          adminListCities(adminToken, { all: true, status: "active", limit: 500 }),
          adminListSubDistricts(adminToken, { all: true, status: "active", limit: 500 }),
        ]);
        if (!cancelled) {
          setCityOptions(cities ?? []);
          setSubDistrictOptions(subDistricts ?? []);
        }
      } catch {
        if (!cancelled) {
          setCityOptions([]);
          setSubDistrictOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken]);

  useEffect(() => {
    if (!initialVendor || (!cityOptions.length && !subDistrictOptions.length)) return;
    const subName = String(initialVendor.subDistrict || "").trim();
    const cityName = String(initialVendor.city || "").trim();
    if (!subName && !cityName) return;

    let matchedSubDistrictId = "";
    let matchedCityId = "";

    if (subName) {
      const row = subDistrictOptions.find((s) => {
        if (String(s.name || "").toLowerCase() !== subName.toLowerCase()) return false;
        if (!cityName) return true;
        return String(s.city?.name || "").toLowerCase() === cityName.toLowerCase();
      });
      if (row) {
        matchedSubDistrictId = String(row._id);
        matchedCityId = row.city?._id ? String(row.city._id) : "";
      }
    }
    if (!matchedCityId && cityName) {
      const city = cityOptions.find((c) => String(c.name || "").toLowerCase() === cityName.toLowerCase());
      if (city) matchedCityId = String(city._id);
    }

    setValues((prev) => {
      if (prev.subDistrictId === matchedSubDistrictId && prev.cityId === matchedCityId) return prev;
      return { ...prev, subDistrictId: matchedSubDistrictId, cityId: matchedCityId };
    });
  }, [initialVendor, cityOptions, subDistrictOptions]);

  const filteredSubDistrictOptions = values.cityId
    ? subDistrictOptions.filter((row) => String(row.city?._id || row.city || "") === values.cityId)
    : subDistrictOptions;

  const handleChange = (field) => (e) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleNameInput = (e) => {
    const value = e.target.value.replace(/[^A-Za-z ]+/g, "").replace(/\s{2,}/g, " ");
    setValues((prev) => ({ ...prev, name: value }));
  };

  const handlePhoneInput = (field) => (e) => {
    setValues((prev) => ({ ...prev, [field]: sanitizePhoneInput(e.target.value) }));
  };

  const handleAccountNoInput = (e) => {
    const value = e.target.value.replace(/\D+/g, "").slice(0, 18);
    setValues((prev) => ({ ...prev, accountNo: value }));
  };

  const handleIfscInput = (e) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 11);
    setValues((prev) => ({ ...prev, ifsc: value }));
  };

  const handleGstinInput = (e) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 15);
    setValues((prev) => ({ ...prev, gstin: value }));
  };

  const handlePanCardNumberInput = (e) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
    setValues((prev) => ({ ...prev, panCardNumber: value }));
  };

  const handleCityChange = (e) => {
    const cityId = e.target.value;
    setValues((prev) => {
      const next = { ...prev, cityId };
      if (cityId && prev.subDistrictId) {
        const sd = subDistrictOptions.find((s) => String(s._id) === prev.subDistrictId);
        const sdCityId = String(sd?.city?._id || sd?.city || "");
        if (sdCityId && sdCityId !== cityId) {
          next.subDistrictId = "";
        }
      }
      return next;
    });
  };

  const handleSubDistrictChange = (e) => {
    const subDistrictId = e.target.value;
    setValues((prev) => {
      const next = { ...prev, subDistrictId };
      if (subDistrictId) {
        const sd = subDistrictOptions.find((s) => String(s._id) === subDistrictId);
        const parentCityId = sd?.city?._id ? String(sd.city._id) : "";
        if (parentCityId) next.cityId = parentCityId;
      }
      return next;
    });
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFile(file);
    setFormError("");
  };

  const handleDocFile = (field, file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const text = "Image size must be 5 MB or less.";
      setDocFieldError(text);
      void Swal.fire({ icon: "error", title: "File too large", text });
      return;
    }
    const url = URL.createObjectURL(file);
    setDocFiles((prev) => ({ ...prev, [field]: file }));
    setDocPreviews((prev) => {
      revokeIfBlob(prev[field]);
      return { ...prev, [field]: url };
    });
    setDocFieldError("");
  };

  const handleRemoveDoc = (field) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDocFiles((prev) => ({ ...prev, [field]: null }));
    setDocPreviews((prev) => {
      revokeIfBlob(prev[field]);
      return { ...prev, [field]: "" };
    });
    setValues((prev) => ({ ...prev, [field]: "" }));
    setDocFieldError("");
  };

  const handleShopImagesInput = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;

    const roomForThisSave = MAX_SHOP_IMAGES_PER_BATCH - pendingShopImages.length;
    if (roomForThisSave <= 0) {
      const text = `You already have ${MAX_SHOP_IMAGES_PER_BATCH} new photos waiting to upload. Save first, then you can add up to ${MAX_SHOP_IMAGES_PER_BATCH} more.`;
      setDocFieldError(text);
      void Swal.fire({ icon: "warning", title: "Save before adding more", text });
      return;
    }

    const fromPicker = files.slice(0, MAX_SHOP_IMAGES_PER_BATCH);
    const toAdd = fromPicker.slice(0, roomForThisSave);

    if (fromPicker.length > roomForThisSave) {
      const text = `Only ${roomForThisSave} more new photo(s) added (max ${MAX_SHOP_IMAGES_PER_BATCH} new per save). Save, then edit again to add another batch.`;
      setDocFieldError(text);
      void Swal.fire({ icon: "warning", title: "Batch limit", text });
    } else if (files.length > MAX_SHOP_IMAGES_PER_BATCH) {
      const text = `Only the first ${MAX_SHOP_IMAGES_PER_BATCH} images from this selection are used (max ${MAX_SHOP_IMAGES_PER_BATCH} per pick).`;
      setDocFieldError(text);
      void Swal.fire({ icon: "warning", title: "Too many files selected", text });
    } else {
      setDocFieldError("");
    }

    const next = [];
    for (const file of toAdd) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        const text = "Each shop photo must be 5 MB or less.";
        setDocFieldError(text);
        next.forEach(({ preview }) => revokeIfBlob(preview));
        void Swal.fire({ icon: "error", title: "File too large", text });
        return;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setPendingShopImages((prev) => [...prev, ...next]);
  };

  const handleShopVideosInput = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;

    const roomForThisSave = MAX_SHOP_VIDEOS_PER_BATCH - pendingShopVideos.length;
    if (roomForThisSave <= 0) {
      const text = `You already have ${MAX_SHOP_VIDEOS_PER_BATCH} new videos waiting to upload. Save first, then you can add up to ${MAX_SHOP_VIDEOS_PER_BATCH} more.`;
      setDocFieldError(text);
      void Swal.fire({ icon: "warning", title: "Save before adding more", text });
      return;
    }

    const fromPicker = files.slice(0, MAX_SHOP_VIDEOS_PER_BATCH);
    const toAdd = fromPicker.slice(0, roomForThisSave);

    if (fromPicker.length > roomForThisSave) {
      const text = `Only ${roomForThisSave} more new video(s) added (max ${MAX_SHOP_VIDEOS_PER_BATCH} new per save). Save, then edit again to add another batch.`;
      setDocFieldError(text);
      void Swal.fire({ icon: "warning", title: "Batch limit", text });
    } else if (files.length > MAX_SHOP_VIDEOS_PER_BATCH) {
      const text = `Only the first ${MAX_SHOP_VIDEOS_PER_BATCH} videos from this selection are used (max ${MAX_SHOP_VIDEOS_PER_BATCH} per pick).`;
      setDocFieldError(text);
      void Swal.fire({ icon: "warning", title: "Too many files selected", text });
    } else {
      setDocFieldError("");
    }

    const next = [];
    for (const file of toAdd) {
      if (file.size > MAX_VIDEO_SIZE_BYTES) {
        const text = "Each shop video must be 50 MB or less.";
        setDocFieldError(text);
        next.forEach(({ preview }) => revokeIfBlob(preview));
        void Swal.fire({ icon: "error", title: "File too large", text });
        return;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setPendingShopVideos((prev) => [...prev, ...next]);
  };

  const removeSavedShopImage = (path) => {
    setValues((prev) => ({ ...prev, shopImages: (prev.shopImages || []).filter((p) => p !== path) }));
  };

  const removePendingShopImage = (index) => {
    setPendingShopImages((prev) => {
      const row = prev[index];
      if (row?.preview) revokeIfBlob(row.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const removeSavedShopVideo = (path) => {
    setValues((prev) => ({ ...prev, shopVideos: (prev.shopVideos || []).filter((p) => p !== path) }));
  };

  const removePendingShopVideo = (index) => {
    setPendingShopVideos((prev) => {
      const row = prev[index];
      if (row?.preview) revokeIfBlob(row.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!adminToken) return setFormError("You are not signed in.");
    const validationError = validateVendorForm(values, { shopBannerFile: docFiles.shopBanner });
    if (validationError) {
      setTab(validationError.tab);
      setFormError(validationError.blockedMessage || validationError.message);
      await Swal.fire({
        icon: "warning",
        title: "Can't move to next",
        text: validationError.blockedMessage || validationError.message,
      });
      return;
    }

    if (pendingShopImages.length > MAX_SHOP_IMAGES_PER_BATCH) {
      setTab("media");
      setDocFieldError(
        `Too many new shop photos for one save (max ${MAX_SHOP_IMAGES_PER_BATCH}). Remove some from the queue or save in smaller batches.`
      );
      await Swal.fire({
        icon: "error",
        title: "Too many new shop photos",
        text: `You can upload at most ${MAX_SHOP_IMAGES_PER_BATCH} new shop photos per save. Save, then add more.`,
      });
      return;
    }

    if (pendingShopVideos.length > MAX_SHOP_VIDEOS_PER_BATCH) {
      setTab("media");
      setDocFieldError(
        `Too many new shop videos for one save (max ${MAX_SHOP_VIDEOS_PER_BATCH}). Remove some from the queue or save in smaller batches.`
      );
      await Swal.fire({
        icon: "error",
        title: "Too many new shop videos",
        text: `You can upload at most ${MAX_SHOP_VIDEOS_PER_BATCH} new shop videos per save. Save, then add more.`,
      });
      return;
    }

    const selectedSubDistrict = subDistrictOptions.find((s) => String(s._id) === values.subDistrictId);
    const selectedCity = values.cityId
      ? cityOptions.find((c) => String(c._id) === values.cityId)
      : null;

    const payload = {
      ...values,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      businessName: values.businessName.trim(),
      businessPhone: values.businessPhone.trim(),
      gstin: values.gstin.trim().toUpperCase(),
      panCardNumber: values.panCardNumber.trim().toUpperCase(),
      businessAddress: values.businessAddress.trim(),
      shopDescription: values.shopDescription.trim().slice(0, 100),
      bankName: values.bankName.trim(),
      accountNo: values.accountNo.trim(),
      ifsc: values.ifsc.trim().toUpperCase(),
      subDistrict: selectedSubDistrict?.name || "",
      city: selectedCity?.name || selectedSubDistrict?.city?.name || "",
    };
    if (mode === "edit") delete payload.approvalStatus;

    setSubmitting(true);
    try {
      let vendor;
      const uploadFiles = {
        file: profileFile,
        aadhaarCardFront: docFiles.aadhaarCardFront,
        aadhaarCardBack: docFiles.aadhaarCardBack,
        panCard: docFiles.panCard,
        shopLogo: docFiles.shopLogo,
        shopBanner: docFiles.shopBanner,
        shopImages: pendingShopImages.map((x) => x.file),
        shopVideos: pendingShopVideos.map((x) => x.file),
      };
      if (mode === "create") vendor = await adminCreateVendor(adminToken, payload, uploadFiles);
      else vendor = await adminUpdateVendor(adminToken, vendorId, payload, uploadFiles);
      onSuccess?.(vendor);
    } catch (err) {
      if (err?.status === 401) {
        dispatch(logout());
        return;
      }
      const message = err.message || "Request failed.";
      setFormError(message);
      await Swal.fire({ icon: "error", title: "Request failed", text: message });
    } finally {
      setSubmitting(false);
    }
  };

  const avatar = previewUrl || mediaUrl(initialVendor?.profileImage);
  const goToPreviousTab = () => {
    if (isFirstTab) return;
    setTab(tabs[tabIndex - 1].id);
  };
  const goToTab = async (targetTabId) => {
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId);
    if (targetIndex < 0 || targetIndex === tabIndex) return;

    if (targetIndex < tabIndex) {
      setFormError("");
      setTab(targetTabId);
      return;
    }

    for (let i = tabIndex; i < targetIndex; i += 1) {
      const validationError = validateVendorTab(values, tabs[i].id, { shopBannerFile: docFiles.shopBanner });
      if (validationError) {
        setTab(tabs[i].id);
        setFormError(validationError.blockedMessage || validationError.message);
        await Swal.fire({
          icon: "warning",
          title: "Can't move to next",
          text: validationError.blockedMessage || validationError.message,
        });
        return;
      }
    }

    setFormError("");
    setTab(targetTabId);
  };
  const goToNextTab = async () => {
    if (isLastTab) return;
    await goToTab(tabs[tabIndex + 1].id);
  };
  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  };

  const savedShopImageCount = (values.shopImages || []).length;
  const pendingShopImageCount = pendingShopImages.length;
  const savedShopVideoCount = (values.shopVideos || []).length;
  const pendingShopVideoCount = pendingShopVideos.length;

  return (
    <form className="user-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>


      <div className="vendor-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`vendor-tabs__tab${tab === t.id ? " vendor-tabs__tab--active" : ""}`}
            onClick={() => void goToTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "personal" ? (
        
      <section className="vendor-read-section">
        {/* <h3 className="vendor-read-section__title">Personal Information</h3> */}

        <section className="vendor-read-section">
        <h3 className="vendor-read-section__title">Profile Image</h3>
    
        <div className="user-form__upload-row">
          <div className="user-upload user-upload--with-preview">
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
              className="user-upload__input"
              onChange={handleFile}
            />
            <label htmlFor={fileInputId} className="user-upload__circle-wrap">
              <span className="user-upload__circle">
                {avatar ? (
                  <img src={avatar} alt="" className="user-upload__preview-img" width={112} height={112} />
                ) : (
                  <ProfileImagePlaceholder size={40} />
                )}
              </span>
              <span className="user-upload__tap-hint">Choose image</span>
            </label>
          </div>
        </div>
      </section>
        <div className="user-form__grid">
          <label className="user-field"><span className="user-field__label">Full Name <span className="required-dot">*</span></span><input value={values.name} onChange={handleNameInput} placeholder="Full name" required /></label>
          <label className="user-field">
            <span className="user-field__label">Email ID</span>
            <input
              type="email"
              value={values.email}
              onChange={handleChange("email")}
              placeholder="email@example.com"
            />
          </label>
          <label className="user-field"><span className="user-field__label">Mobile Number <span className="required-dot">*</span></span><input value={values.phone} onChange={handlePhoneInput("phone")} placeholder="9876543210" maxLength={10} inputMode="numeric" required /></label>
          <label className="user-field"><span className="user-field__label">Status</span><select value={values.status} onChange={handleChange("status")}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label className="user-field">
            <span className="user-field__label">Approval Status</span>
            <select
              value={values.approvalStatus}
              onChange={handleChange("approvalStatus")}
              disabled={mode === "edit"}
              aria-readonly={mode === "edit"}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="user-field">
            <span className="user-field__label">Sub-district</span>
            <select value={values.subDistrictId} onChange={handleSubDistrictChange}>
              <option value="">Select sub-district (optional)</option>
              {filteredSubDistrictOptions.map((row) => (
                <option key={row._id} value={row._id}>
                  {row.name}
                  {row.city?.name ? ` · ${row.city.name}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="user-field">
            <span className="user-field__label">City <span className="required-dot">*</span></span>
            <select value={values.cityId} onChange={handleCityChange} required>
              <option value="">Select city</option>
              {cityOptions.map((city) => (
                <option key={city._id} value={city._id}>
                  {city.name}
                  {city.state?.name ? `, ${city.state.name}` : ""}
                </option>
              ))}
            </select>
          </label>
          
        </div>
      </section>
      ) : null}

      {tab === "business" ? (
      <section className="vendor-read-section">
        <div className="user-form__grid">
          <label className="user-field"><span className="user-field__label">Shop Name <span className="required-dot">*</span></span><input value={values.businessName} onChange={handleChange("businessName")} placeholder="Shop name" required /></label>
          <label className="user-field"><span className="user-field__label">Business Mobile Number <span className="required-dot">*</span></span><input value={values.businessPhone} onChange={handlePhoneInput("businessPhone")} placeholder="1122334455" maxLength={10} inputMode="numeric" required /></label>
          <label className="user-field"><span className="user-field__label">GSTIN</span><input value={values.gstin} onChange={handleGstinInput} placeholder="22AAAAA0000A1Z5" maxLength={15} /></label>
          <label className="user-field"><span className="user-field__label">PAN Number</span><input value={values.panCardNumber} onChange={handlePanCardNumberInput} placeholder="ABCDE1234F" maxLength={10} /></label>
          <label className="user-field user-field--full"><span className="user-field__label">Address <span className="required-dot">*</span></span><textarea className="user-field__input" rows={3} value={values.businessAddress} onChange={handleChange("businessAddress")} placeholder="12 Tech Park, Andheri, Mumbai 400053" required /></label>
          <label className="user-field user-field--full">
            <span className="user-field__label">
              Shop Description <span className="text-muted fw-normal">(optional, max 100)</span>
            </span>
            <textarea
              className="user-field__input"
              rows={3}
              maxLength={100}
              value={values.shopDescription}
              onChange={handleChange("shopDescription")}
              placeholder="Short description of your shop"
            />
            <span className="user-field__hint text-muted small">
              {String(values.shopDescription || "").length}/100
            </span>
          </label>
        </div>
      </section>
      ) : null}

      {tab === "bank" ? (
      <section className="vendor-read-section">
        <div className="user-form__grid">
          <label className="user-field"><span className="user-field__label">Bank Name</span><input value={values.bankName} onChange={handleChange("bankName")} placeholder="Bank name" /></label>
          <label className="user-field"><span className="user-field__label">Branch Name</span><input value={values.branchName} onChange={handleChange("branchName")} placeholder="Branch" /></label>
          <label className="user-field"><span className="user-field__label">Account Number</span><input value={values.accountNo} onChange={handleAccountNoInput} placeholder="Account number" maxLength={18} inputMode="numeric" /></label>
          <label className="user-field"><span className="user-field__label">IFSC Code</span><input value={values.ifsc} onChange={handleIfscInput} placeholder="IFSC" maxLength={11} /></label>
          <label className="user-field"><span className="user-field__label">Account Type</span><select value={values.accountType} onChange={handleChange("accountType")}><option>Current</option><option>Savings</option></select></label>
          
        </div>
      </section>
      ) : null}

      {tab === "media" ? (
      <>
      <section className="vendor-read-section">
        <div className="vendor-doc-grid">
          {[
                { key: "aadhaarCardFront", label: "Aadhaar Front (up to 5 MB)" },
                { key: "aadhaarCardBack", label: "Aadhaar Back (up to 5 MB)" },
            { key: "panCard", label: "PAN Card (up to 5 MB)" },
            { key: "shopLogo", label: "Shop Logo (up to 5 MB)" },
            { key: "shopBanner", label: "Shop Banner (up to 5 MB)", required: true },
          ].map((doc) => (
            <label key={doc.key} className="vendor-doc-slot">
              <span className="vendor-doc-slot__label">
                {doc.label}
                {doc.required ? <span className="required-dot"> *</span> : null}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                className="user-upload__input"
                onChange={(e) => handleDocFile(doc.key, e.target.files?.[0])}
              />
              <span className="vendor-doc-slot__box">
                {docPreviews[doc.key] ? (
                  <button
                    type="button"
                    className="vendor-doc-slot__remove"
                    aria-label={`Remove ${doc.label}`}
                    onClick={handleRemoveDoc(doc.key)}
                  >
                    ×
                  </button>
                ) : null}
                {docPreviews[doc.key] ? (
                  <img src={docPreviews[doc.key]} alt={doc.label} className="user-upload__preview-img" />
                ) : (
                  <span className="vendor-doc-slot__inner">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 16V4M7 9l5-5 5 5" />
                      <path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3" />
                      <path d="M8 20h8" />
                    </svg>
                    Upload
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="vendor-multi-picker-block">
          <div className="vendor-multi-picker-block__head">
            <span className="vendor-doc-slot__label">
              Shop photos (5 MB each) · {savedShopImageCount} saved
              {pendingShopImageCount > 0 ? ` · ${pendingShopImageCount} new (max ${MAX_SHOP_IMAGES_PER_BATCH} new per save)` : ""}
            </span>
            <p className="vendor-multi-picker-block__hint">
              Up to {MAX_SHOP_IMAGES_PER_BATCH} images per pick and per save (server limit). There is no fixed total—after you save, open edit again to add another{" "}
              {MAX_SHOP_IMAGES_PER_BATCH}. Use Ctrl/Shift in the file dialog to multi-select.
            </p>
          </div>
          <label className="vendor-doc-slot vendor-multi-picker-block__trigger" htmlFor={shopImagesInputId}>
            <input
              id={shopImagesInputId}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
              multiple
              className="user-upload__input"
              onChange={handleShopImagesInput}
            />
            <span className="vendor-doc-slot__box vendor-multi-picker-block__drop">
              <span className="vendor-doc-slot__inner">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15 16 10 5 21" />
                </svg>
                Add shop photos
              </span>
            </span>
          </label>
          <div className="vendor-multi-picker-block__thumbs" aria-live="polite">
            {(values.shopImages || []).map((path) => (
              <div key={path} className="vendor-multi-picker-block__thumb">
                <button
                  type="button"
                  className="vendor-doc-slot__remove"
                  aria-label="Remove shop photo"
                  onClick={() => removeSavedShopImage(path)}
                >
                  ×
                </button>
                <img src={mediaUrl(path)} alt="" className="vendor-multi-picker-block__thumb-media" />
              </div>
            ))}
            {pendingShopImages.map((row, i) => (
              <div key={`pending-img-${i}`} className="vendor-multi-picker-block__thumb">
                <button
                  type="button"
                  className="vendor-doc-slot__remove"
                  aria-label="Remove new shop photo"
                  onClick={() => removePendingShopImage(i)}
                >
                  ×
                </button>
                <img src={row.preview} alt="" className="vendor-multi-picker-block__thumb-media" />
              </div>
            ))}
          </div>
        </div>

        <div className="vendor-multi-picker-block">
          <div className="vendor-multi-picker-block__head">
            <span className="vendor-doc-slot__label">
              Shop videos (50 MB each) · {savedShopVideoCount} saved
              {pendingShopVideoCount > 0 ? ` · ${pendingShopVideoCount} new (max ${MAX_SHOP_VIDEOS_PER_BATCH} new per save)` : ""}
            </span>
            <p className="vendor-multi-picker-block__hint">
              Up to {MAX_SHOP_VIDEOS_PER_BATCH} videos per pick and per save (server limit). No fixed total—after you save, edit again to add another{" "}
              {MAX_SHOP_VIDEOS_PER_BATCH}. Use Ctrl/Shift in the file dialog to multi-select.
            </p>
          </div>
          <label className="vendor-doc-slot vendor-multi-picker-block__trigger" htmlFor={shopVideosInputId}>
            <input
              id={shopVideosInputId}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              multiple
              className="user-upload__input"
              onChange={handleShopVideosInput}
            />
            <span className="vendor-doc-slot__box vendor-multi-picker-block__drop">
              <span className="vendor-doc-slot__inner">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 10 23 5v14l-8-5V10Z" />
                  <rect x="1" y="5" width="12" height="14" rx="2" />
                </svg>
                Add shop videos
              </span>
            </span>
          </label>
          <div className="vendor-multi-picker-block__thumbs" aria-live="polite">
            {(values.shopVideos || []).map((path) => (
              <div key={path} className="vendor-multi-picker-block__thumb vendor-multi-picker-block__thumb--video">
                <button
                  type="button"
                  className="vendor-doc-slot__remove"
                  aria-label="Remove shop video"
                  onClick={() => removeSavedShopVideo(path)}
                >
                  ×
                </button>
                <video src={mediaUrl(path)} className="vendor-multi-picker-block__thumb-media" controls muted playsInline />
              </div>
            ))}
            {pendingShopVideos.map((row, i) => (
              <div key={`pending-vid-${i}`} className="vendor-multi-picker-block__thumb vendor-multi-picker-block__thumb--video">
                <button
                  type="button"
                  className="vendor-doc-slot__remove"
                  aria-label="Remove new shop video"
                  onClick={() => removePendingShopVideo(i)}
                >
                  ×
                </button>
                <video src={row.preview} className="vendor-multi-picker-block__thumb-media" controls muted playsInline />
              </div>
            ))}
          </div>
        </div>
      </section>

      </>
      ) : null}

      {formError ? (
        <p className="user-form__error vendor-editor-page__form-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="user-form__actions vendor-editor-page__footer">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={goToPreviousTab}
          disabled={submitting || isFirstTab}
        >
          Back
        </button>
        {isLastTab ? (
          <button key="submit-btn" type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create Vendor" : "Save Changes"}
          </button>
        ) : (
          <button key="next-btn" type="button" className="btn btn--primary" onClick={goToNextTab} disabled={submitting}>
            Next
          </button>
        )}
      </div>
    </form>
  );
}

export function VendorAdd() {
  const navigate = useNavigate();

  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <div>
          <p className="vendor-editor-page__eyebrow">Add Vendor</p>
          <h2 className="user-page__title">Add New Vendor</h2>
          <p className="user-page__subtitle">Register a new vendor</p>
        </div>
      </div>

      <div className="user-page__card vendor-editor-page__card">
        <VendorProfileForm
          mode="create"
          onCancel={() => navigate(-1)}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Vendor created", timer: 1500 });
            navigate(-1);
          }}
        />
      </div>
    </div>
  );
}
