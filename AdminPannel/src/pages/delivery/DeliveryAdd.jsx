import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { IoEyeOffOutline, IoEyeOutline } from "react-icons/io5";
import { adminCreateDeliveryBoy, adminUpdateDeliveryBoy } from "../../api/adminDeliveryBoys.js";
import { adminListCities } from "../../api/adminCities.js";
import { adminListSubDistricts } from "../../api/adminSubDistricts.js";
import { ProfileImagePlaceholder } from "../../components/ProfileImagePlaceholder.jsx";
import { mediaUrl } from "../../media.js";
import { logout } from "../../store/authSlice.js";
import { reportSectionsValidity, reportStepValidity } from "../../utils/formValidation.js";
import { sanitizePhoneInput, validateIndianMobileMessage, validateDateOfBirthMessage, validateIndianVehicleRegistrationMessage, validateIndianDrivingLicenseMessage, validateVehicleTypeMessage, yearsAgoDateInputValue, todayDateInputValue } from "../../utils/validation.js";

const NAME_MAX = 80;
const EMAIL_MAX = 120;
const ADDRESS_MAX = 240;
const VEHICLE_REG_MAX = 24;
const LICENSE_MAX = 30;
const VEHICLE_TYPE_MAX = 40;
const BANK_NAME_MAX = 80;
const BANK_ACCOUNT_NAME_MAX = 80;
const BRANCH_MAX = 80;
const ACCOUNT_NO_MAX = 18;
const IFSC_MAX = 11;
const FILE_MAX_BYTES = 5 * 1024 * 1024;

function sameId(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a) === String(b);
}

function refId(ref) {
  if (!ref) return "";
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
}

function emptyForm() {
  return {
    name: "",
    email: "",
    password: "",
    phone: "",
    cityId: "",
    city: "",
    subDistrict: "",
    subDistrictId: "",
    address: "",
    dob: "",
    gender: "male",
    vehicleRegistrationNumber: "",
    licenseNumber: "",
    vehicleType: "",
    bankAccountName: "",
    accountNumber: "",
    bankName: "",
    branchName: "",
    ifscCode: "",
    status: "active",
    approvalStatus: "pending",
  };
}

function deliveryToFormValues(delivery) {
  if (!delivery) return emptyForm();
  let dob = "";
  if (delivery.dob) {
    const d = new Date(delivery.dob);
    if (!Number.isNaN(d.getTime())) dob = d.toISOString().slice(0, 10);
  }
  const cityId = delivery.cityId ? String(delivery.cityId) : "";
  const subDistrictId = delivery.subDistrictId ? String(delivery.subDistrictId) : "";
  return {
    ...emptyForm(),
    ...delivery,
    cityId,
    subDistrictId,
    dob,
    password: "",
  };
}

function trimDeliveryValues(values) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
    vehicleRegistrationNumber: values?.vehicleRegistrationNumber?.trim() ?? "",
    licenseNumber: values?.licenseNumber?.trim() ?? "",
    vehicleType: values?.vehicleType?.trim() ?? "",
    bankAccountName: values?.bankAccountName?.trim() ?? "",
    accountNumber: values?.accountNumber?.trim() ?? "",
    bankName: values?.bankName?.trim() ?? "",
    branchName: values?.branchName?.trim() ?? "",
    ifscCode: values?.ifscCode?.trim().toUpperCase() ?? "",
    password: values?.password?.trim() ?? "",
  };
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

function collectPersonalTabErrors(values, { mode = "create" } = {}) {
  const errors = [];
  const trimmed = trimDeliveryValues(values);

  if (!trimmed.name) errors.push("Name");
  else if (!/^[A-Za-z ]+$/.test(trimmed.name)) errors.push("Valid name (letters and spaces only)");
  if (!trimmed.email) errors.push("Email");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) errors.push("Valid email address");
  if (!trimmed.phone) errors.push("Phone");
  else {
    const phoneError = validateIndianMobileMessage(trimmed.phone, { required: true, label: "Phone number" });
    if (phoneError) errors.push(phoneError);
  }
  if (!values.cityId) errors.push("City");
  if (!values.subDistrictId) errors.push("Sub-district");
  if (mode === "create") {
    if (!trimmed.password) errors.push("Password");
    else if (trimmed.password.length < 8) errors.push("Password must be at least 8 characters");
  } else if (trimmed.password && trimmed.password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (trimmed.address.length > ADDRESS_MAX) {
    errors.push(`Address cannot exceed ${ADDRESS_MAX} characters`);
  }
  if (values.dob) {
    const dobError = validateDateOfBirthMessage(values.dob, { minAgeYears: 0 });
    if (dobError) errors.push(dobError);
  }

  return errors;
}

function collectVehicleTabErrors(values) {
  const errors = [];
  const trimmed = trimDeliveryValues(values);

  const regError = validateIndianVehicleRegistrationMessage(trimmed.vehicleRegistrationNumber, {
    required: true,
  });
  if (regError) errors.push(regError);

  const licenseError = validateIndianDrivingLicenseMessage(trimmed.licenseNumber, { required: true });
  if (licenseError) errors.push(licenseError);

  const typeError = validateVehicleTypeMessage(trimmed.vehicleType, {
    required: true,
    maxLength: VEHICLE_TYPE_MAX,
  });
  if (typeError) errors.push(typeError);

  return errors;
}

function collectDocumentsTabErrors(values, { files = {}, initialDelivery = null } = {}) {
  const errors = [];
  const hasLicenseFront =
    files.licenseFrontFile || values.drivingLicenseFront || initialDelivery?.drivingLicenseFront;
  const hasLicenseBack =
    files.licenseBackFile || values.drivingLicenseBack || initialDelivery?.drivingLicenseBack;
  const hasAadhaarFront =
    files.aadhaarFrontFile ||
    values.aadhaarCardFront ||
    initialDelivery?.aadhaarCardFront ||
    initialDelivery?.aadhaarCard;
  const hasAadhaarBack =
    files.aadhaarBackFile || values.aadhaarCardBack || initialDelivery?.aadhaarCardBack;

  if (!hasLicenseFront) errors.push("Driving license front image");
  if (!hasLicenseBack) errors.push("Driving license back image");
  if (!hasAadhaarFront) errors.push("Aadhaar card front image");
  if (!hasAadhaarBack) errors.push("Aadhaar card back image");

  return errors;
}

function collectBankTabErrors(values) {
  const errors = [];
  const trimmed = trimDeliveryValues(values);

  if (!trimmed.bankAccountName) errors.push("Bank account name");
  else if (trimmed.bankAccountName.length < 2) errors.push("Bank account name must be at least 2 characters");
  else if (trimmed.bankAccountName.length > BANK_ACCOUNT_NAME_MAX) {
    errors.push(`Bank account name cannot exceed ${BANK_ACCOUNT_NAME_MAX} characters`);
  }

  if (!trimmed.accountNumber) errors.push("Account number");
  else if (!/^\d{9,18}$/.test(trimmed.accountNumber)) {
    errors.push("Valid account number (9–18 digits)");
  }

  if (!trimmed.bankName) errors.push("Bank name");
  else if (trimmed.bankName.length < 2) errors.push("Bank name must be at least 2 characters");
  else if (trimmed.bankName.length > BANK_NAME_MAX) {
    errors.push(`Bank name cannot exceed ${BANK_NAME_MAX} characters`);
  }

  if (!trimmed.branchName) errors.push("Branch name");
  else if (trimmed.branchName.length < 2) errors.push("Branch name must be at least 2 characters");
  else if (trimmed.branchName.length > BRANCH_MAX) {
    errors.push(`Branch name cannot exceed ${BRANCH_MAX} characters`);
  }

  if (!trimmed.ifscCode) errors.push("IFSC code");
  else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmed.ifscCode)) {
    errors.push("Valid IFSC code");
  }

  return errors;
}

function validateDeliveryTab(values, tabId, options = {}) {
  if (tabId === "personal") {
    const errors = collectPersonalTabErrors(values, options);
    return errors.length ? tabValidationFailure("personal", errors) : null;
  }
  if (tabId === "vehicle") {
    const errors = collectVehicleTabErrors(values);
    return errors.length ? tabValidationFailure("vehicle", errors) : null;
  }
  if (tabId === "bank") {
    const errors = collectBankTabErrors(values);
    return errors.length ? tabValidationFailure("bank", errors) : null;
  }
  if (tabId === "documents") {
    const errors = collectDocumentsTabErrors(values, options);
    return errors.length ? tabValidationFailure("documents", errors) : null;
  }
  return null;
}

function validate(values, mode, options = {}) {
  for (const tabId of ["personal", "vehicle", "bank", "documents"]) {
    const error = validateDeliveryTab(values, tabId, { mode, ...options });
    if (error) return error.blockedMessage || error.message;
  }
  return "";
}

export function DeliveryForm({
  mode = "create",
  deliveryId = "",
  initialDelivery = null,
  initialCityOptions = null,
  onCancel,
  onSuccess,
}) {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const [values, setValues] = useState(() => (initialDelivery ? deliveryToFormValues(initialDelivery) : emptyForm()));
  const [showPassword, setShowPassword] = useState(false);
  const [profileFile, setProfileFile] = useState(null);
  const [licenseFrontFile, setLicenseFrontFile] = useState(null);
  const [licenseBackFile, setLicenseBackFile] = useState(null);
  const [aadhaarFrontFile, setAadhaarFrontFile] = useState(null);
  const [aadhaarBackFile, setAadhaarBackFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [licenseFrontPreview, setLicenseFrontPreview] = useState("");
  const [licenseBackPreview, setLicenseBackPreview] = useState("");
  const [aadhaarFrontPreview, setAadhaarFrontPreview] = useState("");
  const [aadhaarBackPreview, setAadhaarBackPreview] = useState("");
  const [cityOptions, setCityOptions] = useState(() => initialCityOptions ?? []);
  const [citySubDistrictOptions, setCitySubDistrictOptions] = useState([]);
  const [loadingCities, setLoadingCities] = useState(() => !initialCityOptions?.length);
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [tab, setTab] = useState("personal");
  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "vehicle", label: "Vehicle Info" },
    { id: "bank", label: "Bank Details" },
    { id: "documents", label: "Documents" },
  ];
  const tabIndex = tabs.findIndex((t) => t.id === tab);
  const isFirstTab = tabIndex <= 0;
  const isLastTab = tabIndex === tabs.length - 1;
  const fileInputRef = useRef(null);
  const fileInputId = useId();
  const personalTabRef = useRef(null);
  const vehicleTabRef = useRef(null);
  const bankTabRef = useRef(null);
  const documentsTabRef = useRef(null);
  const tabSectionRefs = {
    personal: personalTabRef,
    vehicle: vehicleTabRef,
    bank: bankTabRef,
    documents: documentsTabRef,
  };

  useEffect(() => {
    if (initialCityOptions?.length) {
      setCityOptions(initialCityOptions);
      setLoadingCities(false);
      return;
    }
    if (!adminToken) return;
    let cancelled = false;
    setLoadingCities(true);
    (async () => {
      try {
        const { cities } = await adminListCities(adminToken, { all: true, limit: 500, status: "active" });
        if (!cancelled) setCityOptions(cities ?? []);
      } catch {
        if (!cancelled) setCityOptions([]);
      } finally {
        if (!cancelled) setLoadingCities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, initialCityOptions]);

  useEffect(() => {
    if (!adminToken || !values.cityId) {
      setCitySubDistrictOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingSubDistricts(true);
    (async () => {
      try {
        const { subDistricts } = await adminListSubDistricts(adminToken, {
          all: true,
          limit: 500,
          status: "active",
          city: values.cityId,
        });
        if (!cancelled) setCitySubDistrictOptions(subDistricts ?? []);
      } catch {
        if (!cancelled) setCitySubDistrictOptions([]);
      } finally {
        if (!cancelled) setLoadingSubDistricts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken, values.cityId]);

  useEffect(() => {
    if (!initialDelivery || values.cityId || !cityOptions.length) return;
    const cityName = String(initialDelivery.city || "").trim();
    if (!cityName) return;
    const city = cityOptions.find((c) => String(c.name || "").toLowerCase() === cityName.toLowerCase());
    if (!city) return;
    setValues((prev) => ({ ...prev, cityId: String(city._id), city: city.name }));
  }, [initialDelivery, cityOptions, values.cityId]);

  useEffect(() => {
    if (!initialDelivery) return;
    setValues(deliveryToFormValues(initialDelivery));
    setProfileFile(null);
    setLicenseFrontFile(null);
    setLicenseBackFile(null);
    setAadhaarFrontFile(null);
    setAadhaarBackFile(null);
    setPreviewUrl(null);
    setLicenseFrontPreview(mediaUrl(initialDelivery.drivingLicenseFront));
    setLicenseBackPreview(mediaUrl(initialDelivery.drivingLicenseBack));
    setAadhaarFrontPreview(mediaUrl(initialDelivery.aadhaarCardFront || initialDelivery.aadhaarCard));
    setAadhaarBackPreview(mediaUrl(initialDelivery.aadhaarCardBack));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialDelivery]);

  useEffect(() => {
    if (!profileFile) return;
    const url = URL.createObjectURL(profileFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);
  useEffect(() => {
    if (!licenseFrontFile) return;
    const url = URL.createObjectURL(licenseFrontFile);
    setLicenseFrontPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [licenseFrontFile]);
  useEffect(() => {
    if (!licenseBackFile) return;
    const url = URL.createObjectURL(licenseBackFile);
    setLicenseBackPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [licenseBackFile]);
  useEffect(() => {
    if (!aadhaarFrontFile) return;
    const url = URL.createObjectURL(aadhaarFrontFile);
    setAadhaarFrontPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [aadhaarFrontFile]);
  useEffect(() => {
    if (!aadhaarBackFile) return;
    const url = URL.createObjectURL(aadhaarBackFile);
    setAadhaarBackPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [aadhaarBackFile]);

  const handleChange = (field) => (e) => setValues((p) => ({ ...p, [field]: e.target.value }));
  const handleAlpha = (field, max) => (e) =>
    setValues((p) => ({ ...p, [field]: e.target.value.replace(/[^A-Za-z ]+/g, "").slice(0, max) }));
  const handleAlphaNum = (field, max) => (e) =>
    setValues((p) => ({ ...p, [field]: e.target.value.replace(/[^A-Za-z0-9 ]+/g, "").slice(0, max) }));
  const handleRegNo = (e) =>
    setValues((p) => ({ ...p, vehicleRegistrationNumber: e.target.value.replace(/[^A-Za-z0-9 -]+/g, "").slice(0, VEHICLE_REG_MAX) }));
  const handleLicenseNo = (e) =>
    setValues((p) => ({ ...p, licenseNumber: e.target.value.replace(/[^A-Za-z0-9/-]+/g, "").toUpperCase().slice(0, LICENSE_MAX) }));
  const handleAccountNumber = (e) =>
    setValues((p) => ({ ...p, accountNumber: e.target.value.replace(/\D+/g, "").slice(0, ACCOUNT_NO_MAX) }));
  const handleIfsc = (e) =>
    setValues((p) => ({ ...p, ifscCode: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, IFSC_MAX) }));
  const handlePhone = (field) => (e) => setValues((p) => ({ ...p, [field]: sanitizePhoneInput(e.target.value) }));

  const handleCityChange = (e) => {
    const cityId = e.target.value;
    const selectedCity = cityOptions.find((c) => sameId(c._id, cityId));
    setValues((prev) => ({
      ...prev,
      cityId,
      city: selectedCity?.name || "",
      subDistrictId: "",
      subDistrict: "",
    }));
  };

  const handleSubDistrictChange = (e) => {
    const subDistrictId = e.target.value;
    const sd = citySubDistrictOptions.find((s) => sameId(s._id, subDistrictId));
    setValues((prev) => ({
      ...prev,
      subDistrictId,
      subDistrict: sd?.name || "",
      city: sd?.city?.name || prev.city,
      cityId: refId(sd?.city) || prev.cityId,
    }));
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > FILE_MAX_BYTES) {
      e.target.value = "";
      await Swal.fire({ icon: "error", title: "Validation error", text: "Profile image must be 5 MB or less." });
      return;
    }
    setProfileFile(file);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!adminToken) return;

    const sections = tabs.map((t) => ({ id: t.id, element: tabSectionRefs[t.id]?.current }));
    const htmlValid = reportSectionsValidity(sections, (failedTabId) => {
      setTab(failedTabId);
      setFormError("");
    });
    if (!htmlValid) return;

    const validationOptions = {
      mode,
      files: {
        licenseFrontFile,
        licenseBackFile,
        aadhaarFrontFile,
        aadhaarBackFile,
      },
      initialDelivery,
    };
    const msg = validate(values, mode, validationOptions);
    if (msg) {
      const failedTab =
        validateDeliveryTab(values, "personal", validationOptions)?.tab ||
        validateDeliveryTab(values, "vehicle", validationOptions)?.tab ||
        validateDeliveryTab(values, "bank", validationOptions)?.tab ||
        validateDeliveryTab(values, "documents", validationOptions)?.tab ||
        "personal";
      setTab(failedTab);
      setFormError(msg);
      await Swal.fire({ icon: "error", title: "Validation error", text: msg });
      return;
    }
    setFormError("");
    const selectedSubDistrict = citySubDistrictOptions.find((row) => sameId(row._id, values.subDistrictId));
    const selectedCity = values.cityId
      ? cityOptions.find((c) => sameId(c._id, values.cityId))
      : null;
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      city: selectedCity?.name || selectedSubDistrict?.city?.name || values.city || "",
      subDistrictId: values.subDistrictId,
      subDistrict: selectedSubDistrict?.name || values.subDistrict || "",
      address: values.address.trim(),
      dob: values.dob || "",
      gender: values.gender,
      vehicleRegistrationNumber: values?.vehicleRegistrationNumber?.trim(),
      licenseNumber: values?.licenseNumber?.trim(),
      vehicleType: values?.vehicleType?.trim(),
      bankAccountName: values?.bankAccountName?.trim(),
      accountNumber: values?.accountNumber?.trim(),
      bankName: values?.bankName?.trim(),
      branchName: values?.branchName?.trim(),
      ifscCode: values?.ifscCode?.trim().toUpperCase(),
      status: values.status,
      approvalStatus: values.approvalStatus,
      password: values?.password || undefined,
      drivingLicenseFront: values?.drivingLicenseFront || "",
      drivingLicenseBack: values?.drivingLicenseBack || "",
      aadhaarCardFront: values?.aadhaarCardFront || "",
      aadhaarCardBack: values?.aadhaarCardBack || "",
    };
    setSubmitting(true);
    try {
      const deliveryBoy =
        mode === "create"
          ? await adminCreateDeliveryBoy(adminToken, payload, {
              file: profileFile,
              drivingLicenseFront: licenseFrontFile,
              drivingLicenseBack: licenseBackFile,
              aadhaarCardFront: aadhaarFrontFile,
              aadhaarCardBack: aadhaarBackFile,
            })
          : await adminUpdateDeliveryBoy(adminToken, deliveryId, payload, {
              file: profileFile,
              drivingLicenseFront: licenseFrontFile,
              drivingLicenseBack: licenseBackFile,
              aadhaarCardFront: aadhaarFrontFile,
              aadhaarCardBack: aadhaarBackFile,
            });
      onSuccess?.(deliveryBoy);
    } catch (e2) {
      if (e2?.status === 401) return dispatch(logout());
      await Swal.fire({ icon: "error", title: "Request failed", text: e2.message || "Could not save delivery partner." });
    } finally {
      setSubmitting(false);
    }
  };

  const goToPreviousTab = () => {
    if (isFirstTab) return;
    setFormError("");
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
      const currentTabId = tabs[i].id;
      if (i !== tabIndex) {
        setTab(currentTabId);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      const section = tabSectionRefs[currentTabId]?.current;
      if (!reportStepValidity(section)) {
        setTab(currentTabId);
        setFormError("");
        return;
      }

      const validationError = validateDeliveryTab(values, currentTabId, {
        mode,
        files: {
          licenseFrontFile,
          licenseBackFile,
          aadhaarFrontFile,
          aadhaarBackFile,
        },
        initialDelivery,
      });
      if (validationError) {
        setTab(currentTabId);
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

  const avatar = previewUrl || mediaUrl(initialDelivery?.profileImage);

  return (
    <form className="user-form" onSubmit={onSubmit} onKeyDown={handleFormKeyDown}>
      {formError ? <p className="user-form__error">{formError}</p> : null}
      <div className="vendor-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`vendor-tabs__tab${tab === t.id ? " vendor-tabs__tab--active" : ""}`}
            onClick={() => goToTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section
        ref={personalTabRef}
        className={`vendor-read-section vendor-tab-panel${tab === "personal" ? "" : " vendor-tab-panel--hidden"}`}
        aria-hidden={tab !== "personal"}
      >
          <h3 className="vendor-read-section__title">Personal Details</h3>
          <div className="user-form__upload-row">
            <div className="user-upload user-upload--with-preview">
              <input ref={fileInputRef} id={fileInputId} type="file" className="user-upload__input" accept="image/*" onChange={handleFile} />
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
          <div className="user-form__grid">
            <label className="user-field"><span className="user-field__label">Name <span className="required-dot">*</span></span><input name="name" value={values.name} onChange={handleAlpha("name", NAME_MAX)} maxLength={NAME_MAX} pattern="[A-Za-z ]+" title="Enter name using letters and spaces only" required /></label>
            <label className="user-field"><span className="user-field__label">Email <span className="required-dot">*</span></span><input name="email" type="email" value={values.email} onChange={handleChange("email")} maxLength={EMAIL_MAX} required /></label>
            <label className="user-field"><span className="user-field__label">Phone <span className="required-dot">*</span></span><input name="phone" inputMode="numeric" value={values.phone} onChange={handlePhone("phone")} maxLength={10} minLength={10} pattern="[6-9][0-9]{9}" title="Enter a valid 10-digit Indian mobile number" required /></label>
            <label className="user-field">
              <span className="user-field__label">City <span className="required-dot">*</span></span>
              <select name="cityId" value={values.cityId} onChange={handleCityChange} required disabled={loadingCities}>
                <option value="">{loadingCities ? "Loading cities..." : "Select city"}</option>
                {cityOptions.map((city) => (
                  <option key={city._id} value={city._id}>
                    {city.name}
                    {city.state?.name ? `, ${city.state.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field">
              <span className="user-field__label">Sub-district <span className="required-dot">*</span></span>
              <select
                name="subDistrictId"
                value={values.subDistrictId}
                onChange={handleSubDistrictChange}
                required
                disabled={!values.cityId || loadingSubDistricts}
              >
                <option value="">
                  {!values.cityId
                    ? "Select city first"
                    : loadingSubDistricts
                      ? "Loading sub-districts..."
                      : citySubDistrictOptions.length
                        ? "Select sub-district"
                        : "No sub-districts for this city"}
                </option>
                {citySubDistrictOptions.map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-field user-field--full"><span className="user-field__label">Address</span><input name="address" value={values.address} onChange={handleChange("address")} maxLength={ADDRESS_MAX} /></label>
            <label className="user-field"><span className="user-field__label">DOB</span><input name="dob" type="date" value={values.dob} onChange={handleChange("dob")} min={yearsAgoDateInputValue(100)} max={todayDateInputValue()} /></label>
            <label className="user-field"><span className="user-field__label">Gender</span><select name="gender" value={values.gender} onChange={handleChange("gender")}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
            <label className="user-field">
              <span className="user-field__label">
                {mode === "create" ? "Password" : "New Password"}
                {mode === "create" ? <span className="required-dot"> *</span> : null}
              </span>
              <div className="profile-password-row">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                  onChange={handleChange("password")}
                  required={mode === "create"}
                  minLength={mode === "create" ? 8 : undefined}
                  title={mode === "create" ? "Password must be at least 8 characters" : undefined}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="profile-password-eye"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((open) => !open)}
                >
                  {showPassword ? <IoEyeOffOutline size={18} /> : <IoEyeOutline size={18} />}
                </button>
              </div>
            </label>
            <label className="user-field"><span className="user-field__label">Status <span className="required-dot">*</span></span><select name="status" value={values.status} onChange={handleChange("status")} required><option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option></select></label>
            <label className="user-field"><span className="user-field__label">Approval Status <span className="required-dot">*</span></span><select name="approvalStatus" value={values.approvalStatus} onChange={handleChange("approvalStatus")} required><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
          </div>
        </section>

      <section
        ref={vehicleTabRef}
        className={`vendor-read-section vendor-tab-panel${tab === "vehicle" ? "" : " vendor-tab-panel--hidden"}`}
        aria-hidden={tab !== "vehicle"}
      >
          <h3 className="vendor-read-section__title">Vehicle Details</h3>
          <p className="vendor-read-section__sub">All vehicle fields are required for delivery partners.</p>
          <div className="user-form__grid">
            <label className="user-field">
              <span className="user-field__label">
                Vehicle Registration No. <span className="required-dot">*</span>
              </span>
              <input
                name="vehicleRegistrationNumber"
                value={values.vehicleRegistrationNumber}
                onChange={handleRegNo}
                maxLength={VEHICLE_REG_MAX}
                placeholder="e.g. MH 12 AB 1234"
                required
              />
            </label>
            <label className="user-field">
              <span className="user-field__label">
                Driving License No. <span className="required-dot">*</span>
              </span>
              <input
                name="licenseNumber"
                value={values.licenseNumber}
                onChange={handleLicenseNo}
                maxLength={LICENSE_MAX}
                placeholder="10–20 characters"
                minLength={10}
                required
              />
            </label>
            <label className="user-field">
              <span className="user-field__label">
                Vehicle Type <span className="required-dot">*</span>
              </span>
              <input
                name="vehicleType"
                value={values.vehicleType}
                onChange={handleAlphaNum("vehicleType", VEHICLE_TYPE_MAX)}
                maxLength={VEHICLE_TYPE_MAX}
                placeholder="e.g. Bike, Scooter, Car"
                required
              />
            </label>
          </div>
        </section>

      <section
        ref={bankTabRef}
        className={`vendor-read-section vendor-tab-panel${tab === "bank" ? "" : " vendor-tab-panel--hidden"}`}
        aria-hidden={tab !== "bank"}
      >
          <h3 className="vendor-read-section__title">Bank Details</h3>
          <p className="vendor-read-section__sub">All bank fields are required for delivery partners.</p>
          <div className="user-form__grid">
            <label className="user-field"><span className="user-field__label">Bank Account Name <span className="required-dot">*</span></span><input name="bankAccountName" value={values.bankAccountName} onChange={handleAlphaNum("bankAccountName", BANK_ACCOUNT_NAME_MAX)} maxLength={BANK_ACCOUNT_NAME_MAX} minLength={2} required /></label>
            <label className="user-field"><span className="user-field__label">Account Number <span className="required-dot">*</span></span><input name="accountNumber" inputMode="numeric" value={values.accountNumber} onChange={handleAccountNumber} maxLength={ACCOUNT_NO_MAX} minLength={9} pattern="\d{9,18}" title="Enter a valid account number (9–18 digits)" required /></label>
            <label className="user-field"><span className="user-field__label">Bank Name <span className="required-dot">*</span></span><input name="bankName" value={values.bankName} onChange={handleAlphaNum("bankName", BANK_NAME_MAX)} maxLength={BANK_NAME_MAX} minLength={2} required /></label>
            <label className="user-field"><span className="user-field__label">Branch Name <span className="required-dot">*</span></span><input name="branchName" value={values.branchName} onChange={handleAlphaNum("branchName", BRANCH_MAX)} maxLength={BRANCH_MAX} minLength={2} required /></label>
            <label className="user-field"><span className="user-field__label">IFSC <span className="required-dot">*</span></span><input name="ifscCode" value={values.ifscCode} onChange={handleIfsc} maxLength={IFSC_MAX} pattern="[A-Z]{4}0[A-Z0-9]{6}" title="Enter a valid IFSC code (e.g. SBIN0001234)" required /></label>
          </div>
        </section>

      <section
        ref={documentsTabRef}
        className={`vendor-read-section vendor-tab-panel${tab === "documents" ? "" : " vendor-tab-panel--hidden"}`}
        aria-hidden={tab !== "documents"}
      >
          <h3 className="vendor-read-section__title">Documents</h3>
          <p className="vendor-read-section__sub">Upload driving license and Aadhaar images (front and back). All four documents are required.</p>
          <div className="vendor-doc-grid">
            {[
              { key: "drivingLicenseFront", label: "Driving License Front * (up to 5 MB)", preview: licenseFrontPreview, setter: setLicenseFrontFile },
              { key: "drivingLicenseBack", label: "Driving License Back * (up to 5 MB)", preview: licenseBackPreview, setter: setLicenseBackFile },
              { key: "aadhaarCardFront", label: "Aadhaar Card Front * (up to 5 MB)", preview: aadhaarFrontPreview, setter: setAadhaarFrontFile },
              { key: "aadhaarCardBack", label: "Aadhaar Card Back * (up to 5 MB)", preview: aadhaarBackPreview, setter: setAadhaarBackFile },
            ].map((doc) => (
              <label key={doc.key} className="vendor-doc-slot">
                <span className="vendor-doc-slot__label">{doc.label}</span>
                <input
                  name={doc.key}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.pdf"
                  className="user-upload__input"
                  required={!doc.preview}
                  onChange={async (e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && file.size > FILE_MAX_BYTES) {
                      e.target.value = "";
                      await Swal.fire({ icon: "error", title: "Validation error", text: "Document must be 5 MB or less." });
                      return;
                    }
                    doc.setter(file);
                  }}
                />
                <span className="vendor-doc-slot__box">
                  {doc.preview ? (
                    doc.preview.toLowerCase().includes(".pdf") ? (
                      <a href={doc.preview} target="_blank" rel="noreferrer" className="vendor-doc-slot__inner">View PDF</a>
                    ) : (
                      <img src={doc.preview} alt={doc.label} className="user-upload__preview-img" />
                    )
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
        </section>

      <div className="user-form__actions vendor-editor-page__footer">
        {/* {onCancel ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        ) : null} */}
        <button type="button" className="btn btn--ghost" onClick={goToPreviousTab} disabled={submitting || isFirstTab}>
          Back
        </button>
        {isLastTab ? (
          <button key="submit-btn" type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create Delivery Partner" : "Save Changes"}
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

export function DeliveryAdd() {
  const navigate = useNavigate();
  return (
    <div className="user-page vendor-editor-page">
      <div className="user-page__toolbar">
        <button type="button" className="user-back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <div>
          <p className="vendor-editor-page__eyebrow">Add Delivery Partner</p>
          <h2 className="user-page__title">Add New Delivery Partner</h2>
        </div>
      </div>
      <div className="user-page__card vendor-editor-page__card">
        <DeliveryForm
          mode="create"
          onCancel={() => navigate(-1)}
          onSuccess={async () => {
            await Swal.fire({ icon: "success", title: "Delivery partner created", timer: 1500 });
            navigate("/admin/delivery");
          }}
        />
      </div>
    </div>
  );
}
