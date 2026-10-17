import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
  vendorPanelRegister,
  vendorPanelSendRegisterOtp,
  vendorPanelVerifyRegisterOtp,
} from "../api/vendorPanelAuth.js";
import { publicListCategories } from "../api/publicCatalog.js";
import { publicListCities, publicListSubDistricts } from "../api/publicLocations.js";
import { setCredentials } from "../store/authSlice.js";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  BUSINESS_NAME_MAX,
  MAX_FILE_BYTES,
  NAME_MIN,
  NAME_MAX,
  sanitizeBusinessNameInput,
  sanitizeNameInput,
  sanitizePhoneInput,
  validateBusinessAddress,
  validateBusinessName,
  validateEmailMessage,
  validateFullName,
  validateIndianMobileMessage,
  validateVenueVendorDocuments,
} from "../utils/venueVendorFormValidation.js";
import { reportFormValidity, reportStepValidity } from "../utils/formValidation.js";
import { normalizePanelAuthSession } from "../utils/panelAuthSession.js";

const STEPS = [
  { id: 1, label: "Vendor Type" },
  { id: 2, label: "Verify Mobile" },
  { id: 3, label: "Personal Details" },
  { id: 4, label: "Documents & Shop" },
];
const LAST_STEP = STEPS.length;
const OTP_LENGTH = 4;
const DEFAULT_RESEND_COOLDOWN = 30;

const VENDOR_TYPES = [
  { id: "ecom", title: "E-commerce", description: "Sell products online through the marketplace." },
  { id: "service", title: "Service Provider", description: "Offer venue and event services for booking." },
  { id: "both", title: "Both", description: "Run an online shop and offer services from one account." },
];

const INITIAL_FORM = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  businessAddress: "",
};

function needsServiceFlow(type) {
  return type === "service" || type === "both";
}

function needsShopImages(type) {
  return type === "ecom" || type === "both";
}

function needsShopCategory(type) {
  return type === "ecom";
}

function categoryId(item) {
  return item?._id || item?.id || "";
}

/** Live backend still requires category on register — pick one silently for Both vendors. */
async function resolveRegistrationCategoryForBoth(existingCategories) {
  const cached = (existingCategories || []).map(categoryId).find(Boolean);
  if (cached) return cached;

  const items = await publicListCategories({ mode: "ecom", limit: 100, includeEmpty: true });
  const fetched = (items ?? []).map(categoryId).find(Boolean);
  if (!fetched) {
    throw new Error("Shop setup is temporarily unavailable. Please contact support.");
  }
  return fetched;
}

function validateIndianMobile(phone) {
  return validateIndianMobileMessage(phone, { required: true, label: "Mobile number" });
}

function unwrapApiPayload(data) {
  if (Array.isArray(data?.data) && data.data[0] && typeof data.data[0] === "object") return data.data[0];
  if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) return data.data;
  return data ?? {};
}

function readDevOtp(data) {
  const otp = unwrapApiPayload(data)?.otp ?? data?.otp;
  return otp === undefined || otp === null || otp === "" ? "" : String(otp);
}

function readResendSeconds(data) {
  const seconds = Number(unwrapApiPayload(data)?.resendAfterSeconds ?? data?.resendAfterSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RESEND_COOLDOWN;
}

function parseResendWaitSeconds(message) {
  const match = String(message ?? "").match(/wait\s+(\d+)\s+seconds/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
      <path d="M9 9h1M14 9h1M9 13h1M14 13h1" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function RegisterStepper({ currentStep }) {
  return (
    <div className="vendor-register-stepper" role="list" aria-label="Registration progress">
      {STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;
        const circleClass = isActive || isCompleted ? "is-active" : "is-upcoming";
        const lineClass = step.id < currentStep ? "is-done" : "is-upcoming";

        return (
          <div key={step.id} className="vendor-register-stepper__step" role="listitem">
            <div className="vendor-register-stepper__node">
              <div className={`vendor-register-stepper__circle ${circleClass}`}>{step.id}</div>
              <span className={`vendor-register-stepper__label ${isActive || isCompleted ? "is-active" : ""}`}>
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 ? (
              <div className={`vendor-register-stepper__line ${lineClass}`} aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FormField({ label, children, className = "", required = false }) {
  return (
    <label className={`vendor-register-field ${className}`.trim()}>
      <span className="vendor-register-field__label">
        {label}
        {required ? <span className="required-dot"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/"));
}

function FileUploadZone({ label, file, onFile, inputId, required = false }) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleChange = (nextFile) => {
    if (!nextFile) {
      onFile(null);
      return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      Swal.fire({
        icon: "error",
        title: "File too large",
        text: "Maximum file size is 5MB.",
        confirmButtonColor: "#141414",
      });
      return;
    }
    onFile(nextFile);
  };

  return (
    <div className="vendor-register-field">
      <span className="vendor-register-field__label">
        {label}
        {required ? <span className="required-dot"> *</span> : null}
      </span>
      <label htmlFor={inputId} className={`vendor-register-upload${preview || file ? " has-file" : ""}`}>
        <input
          id={inputId}
          type="file"
          accept="image/*,.pdf,application/pdf"
          className="vendor-register-upload__input"
          required={required && !file}
          onChange={(e) => {
            handleChange(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="vendor-register-upload__preview" />
        ) : (
          <UploadIcon />
        )}
        {file ? (
          <>
            <p className="vendor-register-upload__name">{file.name}</p>
            <p className="vendor-register-upload__hint">Click to replace · PDF or Image (max. 5MB)</p>
          </>
        ) : (
          <>
            <p className="vendor-register-upload__text">
              <span className="vendor-register-upload__link">Click to upload</span> or drag and drop
            </p>
            <p className="vendor-register-upload__hint">PDF or Image (max. 5MB)</p>
          </>
        )}
      </label>
    </div>
  );
}

function VendorTypePicker({ value, onChange }) {
  return (
    <div className="vendor-type-picker" role="radiogroup" aria-label="Choose vendor type">
      {VENDOR_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          role="radio"
          aria-checked={value === type.id}
          className={`vendor-type-picker__card${value === type.id ? " is-selected" : ""}`}
          onClick={() => onChange(type.id)}
        >
          <span className="vendor-type-picker__title">{type.title}</span>
          <span className="vendor-type-picker__desc">{type.description}</span>
        </button>
      ))}
    </div>
  );
}

export function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const aadhaarFrontInputId = useId();
  const aadhaarBackInputId = useId();
  const panInputId = useId();
  const shopImagesInputId = useId();

  const [step, setStep] = useState(1);
  const [vendorPanelType, setVendorPanelType] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [aadhaarFrontFile, setAadhaarFrontFile] = useState(null);
  const [aadhaarBackFile, setAadhaarBackFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [shopImages, setShopImages] = useState([]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [cities, setCities] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [cityId, setCityId] = useState("");
  const [subDistrictId, setSubDistrictId] = useState("");
  const formRef = useRef(null);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timerId = window.setTimeout(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => window.clearTimeout(timerId);
  }, [resendCooldown]);

  useEffect(() => {
    let cancelled = false;
    publicListCities({ limit: 500 })
      .then((rows) => {
        if (!cancelled) setCities(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSubDistrictId("");
    if (!cityId) {
      setSubDistricts([]);
      return undefined;
    }
    let cancelled = false;
    publicListSubDistricts({ city: cityId, limit: 500 })
      .then((rows) => {
        if (!cancelled) setSubDistricts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setSubDistricts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  useEffect(() => {
    document.title = "Vendor Registration";
    document.body.classList.add("vendor-register-active");
    return () => document.body.classList.remove("vendor-register-active");
  }, []);

  useEffect(() => {
    if (!needsShopImages(vendorPanelType)) {
      setCategory("");
      setCategories([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const items = await publicListCategories({ mode: "ecom", limit: 100, includeEmpty: true });
        if (!cancelled) setCategories(items ?? []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorPanelType]);

  useEffect(() => {
    if (token) {
      navigate("/vendor/dashboard", { replace: true });
    }
  }, [navigate, token]);

  const onChange = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const otpValue = otpDigits.join("");

  const resetOtp = () => {
    setOtpSent(false);
    setPhoneVerified(false);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setDevOtpHint("");
    setResendCooldown(0);
  };

  const sendRegisterOtp = async () => {
    const phoneError = validateIndianMobile(form.phone);
    if (phoneError) {
      await Swal.fire({ icon: "error", title: "Invalid mobile", text: phoneError, confirmButtonColor: "#141414" });
      return;
    }
    setLoading(true);
    try {
      const data = await vendorPanelSendRegisterOtp({ phone: form.phone, vendorPanelType });
      const devOtp = readDevOtp(data);
      setDevOtpHint(devOtp);
      setOtpSent(true);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setResendCooldown(readResendSeconds(data));
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch (err) {
      const waitSeconds = parseResendWaitSeconds(err?.message);
      if (waitSeconds) setResendCooldown(waitSeconds);
      await Swal.fire({
        icon: "error",
        title: "Could not send OTP",
        text: err?.message || "Please check your mobile number and try again.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyRegisterOtp = async () => {
    if (otpValue.length !== OTP_LENGTH) {
      await Swal.fire({
        icon: "error",
        title: "Enter OTP",
        text: `Enter the ${OTP_LENGTH}-digit code sent to your mobile.`,
        confirmButtonColor: "#141414",
      });
      return;
    }
    setLoading(true);
    try {
      await vendorPanelVerifyRegisterOtp({ phone: form.phone, otp: otpValue });
      setPhoneVerified(true);
      setDevOtpHint("");
      setStep(3);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Verification failed",
        text: err?.message || "Invalid or expired OTP. Try again or resend.",
        confirmButtonColor: "#141414",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = String(value ?? "").replace(/\D/g, "").slice(0, 1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === "Enter") {
      e.preventDefault();
      verifyRegisterOtp();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = String(e.clipboardData.getData("text") ?? "").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setOtpDigits(next);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const validateStep = async (stepNum) => {
    if (stepNum === 1) {
      if (!vendorPanelType) {
        await Swal.fire({
          icon: "error",
          title: "Required",
          text: "Please choose a vendor type.",
          confirmButtonColor: "#141414",
        });
        return false;
      }
    }

    if (stepNum === 2) {
      if (!phoneVerified) {
        await Swal.fire({
          icon: "error",
          title: "Verify mobile",
          text: "Send the OTP and verify your mobile number to continue.",
          confirmButtonColor: "#141414",
        });
        return false;
      }
    }

    if (stepNum === 3) {
      const nameError = validateFullName(form.name);
      if (nameError) {
        await Swal.fire({ icon: "error", title: "Required", text: nameError, confirmButtonColor: "#141414" });
        return false;
      }
      const emailError = validateEmailMessage(form.email, { required: false });
      if (emailError) {
        await Swal.fire({ icon: "error", title: "Invalid email", text: emailError, confirmButtonColor: "#141414" });
        return false;
      }
      const businessNameError = validateBusinessName(form.businessName);
      if (businessNameError) {
        await Swal.fire({ icon: "error", title: "Required", text: businessNameError, confirmButtonColor: "#141414" });
        return false;
      }
      if (needsServiceFlow(vendorPanelType)) {
        const addressError = validateBusinessAddress(form.businessAddress);
        if (addressError) {
          await Swal.fire({ icon: "error", title: "Required", text: addressError, confirmButtonColor: "#141414" });
          return false;
        }
      }
      if (!cityId || !subDistrictId) {
        await Swal.fire({
          icon: "error",
          title: "Required",
          text: !cityId ? "Please select your city." : "Please select your sub-district.",
          confirmButtonColor: "#141414",
        });
        return false;
      }
    }

    if (stepNum === 4) {
      if (needsServiceFlow(vendorPanelType)) {
        const documentsError = validateVenueVendorDocuments({ aadhaarFrontFile, aadhaarBackFile });
        if (documentsError) {
          await Swal.fire({ icon: "error", title: "Required", text: documentsError, confirmButtonColor: "#141414" });
          return false;
        }
      }
      if (needsShopCategory(vendorPanelType) && !category) {
        await Swal.fire({
          icon: "error",
          title: "Required",
          text: "Please select a shop category.",
          confirmButtonColor: "#141414",
        });
        return false;
      }
      if (needsShopImages(vendorPanelType)) {
        if (!shopImages.length) {
          await Swal.fire({
            icon: "error",
            title: "Required",
            text: "Upload at least one shop image.",
            confirmButtonColor: "#141414",
          });
          return false;
        }
      }
    }

    return true;
  };

  const handleNext = async (e) => {
    e?.preventDefault?.();
    const stepEl = formRef.current?.querySelector(`[data-register-step="${step}"]`);
    if (!reportStepValidity(stepEl)) return;

    const ok = await validateStep(step);
    if (!ok) return;
    setStep((s) => Math.min(LAST_STEP, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  useEffect(
    () => () => {
      shopImages.forEach((row) => {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      });
    },
    [shopImages],
  );

  const handleShopImagesChange = async (files) => {
    const picked = Array.from(files || []);
    if (!picked.length) return;

    const tooLarge = picked.filter((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge.length) {
      await Swal.fire({
        icon: "error",
        title: "File too large",
        text: "Each shop image must be 5 MB or less.",
        confirmButtonColor: "#141414",
      });
    }

    const valid = picked.filter((file) => file.size <= MAX_FILE_BYTES);
    if (!valid.length) return;

    const slotsLeft = 5 - shopImages.length;
    if (slotsLeft <= 0) {
      await Swal.fire({
        icon: "info",
        title: "Limit reached",
        text: "You can upload up to 5 shop images.",
        confirmButtonColor: "#141414",
      });
      return;
    }

    const next = valid.slice(0, slotsLeft).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      key: `${file.name}-${file.size}-${file.lastModified}`,
    }));
    setShopImages((prev) => [...prev, ...next]);
  };

  const removeShopImage = (key) => {
    setShopImages((prev) => {
      const target = prev.find((row) => row.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((row) => row.key !== key);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!reportFormValidity(formEl)) {
      const invalid = formEl?.querySelector(":invalid");
      const stepEl = invalid?.closest("[data-register-step]");
      if (stepEl?.dataset?.registerStep) {
        setStep(Number(stepEl.dataset.registerStep));
      }
      return;
    }

    for (let stepNum = 1; stepNum <= LAST_STEP; stepNum += 1) {
      const ok = await validateStep(stepNum);
      if (!ok) {
        setStep(stepNum);
        return;
      }
    }

    setLoading(true);
    try {
      let registrationCategory = category;
      if (vendorPanelType === "both") {
        registrationCategory = await resolveRegistrationCategoryForBoth(categories);
      }

      const data = await vendorPanelRegister(
        {
          vendorPanelType,
          name: form.name.trim(),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          phone: form.phone,
          businessName: form.businessName.trim(),
          businessPhone: form.phone,
          ...(needsServiceFlow(vendorPanelType) ? { businessAddress: form.businessAddress.trim() } : {}),
          ...(registrationCategory ? { category: registrationCategory } : {}),
          cityId,
          subDistrictId,
        },
        {
          aadhaarCardFront: aadhaarFrontFile,
          aadhaarCardBack: aadhaarBackFile,
          panCard: panFile,
          shopImages: shopImages.map((row) => row.file),
        },
      );

      const session = normalizePanelAuthSession(data);

      const approved =
        session.approvalRequired === false ||
        String(session.user?.approvalStatus || "").toLowerCase() === "approved";

      await Swal.fire({
        icon: "success",
        title: approved ? "Registration successful" : "Registration submitted",
        text: approved
          ? "Your account is ready. You can start using the vendor panel."
          : "Your application is pending admin approval.",
        confirmButtonColor: "#141414",
        timer: 1600,
        showConfirmButton: false,
      });

      dispatch(setCredentials(session));
      navigate("/vendor/dashboard", { replace: true });
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Registration failed",
        text: err.message || "Could not create account.",
        confirmButtonColor: "#141414",
      });
      if (/verify your mobile|session expired/i.test(String(err?.message || ""))) {
        resetOtp();
        setStep(2);
      }
    } finally {
      setLoading(false);
    }
  };

  const sectionTitle = STEPS[step - 1]?.label ?? "";
  const showServiceDocs = needsServiceFlow(vendorPanelType);
  const showShopCategory = needsShopCategory(vendorPanelType);
  const showShopImages = needsShopImages(vendorPanelType);

  return (
    <div className="vendor-register-page">
      <div className="vendor-register-card">
        <header className="vendor-register-header">
          <div className="vendor-register-header__title">
            <BuildingIcon />
            <span>Vendor Registration</span>
          </div>
          <RegisterStepper currentStep={step} />
        </header>

        <form ref={formRef} className="vendor-register-form" onSubmit={handleSubmit}>
          <div className="vendor-register-body">
            <h2 className="vendor-register-body__title">{sectionTitle}</h2>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 1 ? "" : " d-none"}`}
              data-register-step="1"
            >
              <VendorTypePicker value={vendorPanelType} onChange={setVendorPanelType} />
            </div>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 2 ? "" : " d-none"}`}
              data-register-step="2"
            >
              <FormField label="Mobile Number" required>
                <input
                  className="vendor-register-input"
                  type="tel"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, phone: sanitizePhoneInput(e.target.value) }));
                    if (otpSent || phoneVerified) resetOtp();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !otpSent) {
                      e.preventDefault();
                      sendRegisterOtp();
                    }
                  }}
                  placeholder="9876543210"
                  minLength={10}
                  maxLength={10}
                  autoComplete="tel"
                  readOnly={phoneVerified}
                  required
                />
              </FormField>

              {phoneVerified ? (
                <p className="vendor-register-verified" role="status">
                  ✓ +91 {form.phone} verified
                  <button type="button" className="vendor-login-link-btn" onClick={resetOtp} disabled={loading}>
                    Change number
                  </button>
                </p>
              ) : !otpSent ? (
                <button
                  type="button"
                  className="btn btn--primary vendor-register-footer__btn"
                  onClick={sendRegisterOtp}
                  disabled={loading}
                >
                  {loading ? "Sending…" : "Send OTP"}
                </button>
              ) : (
                <div className="vendor-register-field">
                  <span className="vendor-register-field__label">
                    Enter the OTP sent to +91 {form.phone}
                    <span className="required-dot"> *</span>
                  </span>
                  <div className="vendor-login-otp" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          otpRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        className="vendor-login-otp__box"
                        value={digit}
                        maxLength={1}
                        aria-label={`Digit ${index + 1}`}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      />
                    ))}
                  </div>
                  {devOtpHint ? (
                    <p className="vendor-login-dev-otp" role="status">
                      Test OTP (SMS not active): <strong>{devOtpHint}</strong>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--primary vendor-register-footer__btn vendor-register-verify-btn"
                    onClick={verifyRegisterOtp}
                    disabled={loading}
                  >
                    {loading ? "Verifying…" : "Verify OTP"}
                  </button>
                  <div className="vendor-login-otp-actions">
                    <button
                      type="button"
                      className="vendor-login-link-btn"
                      onClick={sendRegisterOtp}
                      disabled={loading || resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
                    </button>
                    <button type="button" className="vendor-login-link-btn" onClick={resetOtp} disabled={loading}>
                      Change number
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 3 ? "" : " d-none"}`}
              data-register-step="3"
            >
              <FormField label="Full Name" required>
                <input
                  className="vendor-register-input"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: sanitizeNameInput(e.target.value) }))}
                  placeholder="Enter your full name"
                  minLength={NAME_MIN}
                  maxLength={NAME_MAX}
                  autoComplete="name"
                  required
                />
              </FormField>
              <FormField label="Email Address">
                <input
                  className="vendor-register-input"
                  type="email"
                  value={form.email}
                  onChange={onChange("email")}
                  placeholder="your.email@example.co.in (optional)"
                  autoComplete="email"
                />
              </FormField>
              <FormField label="Business Name" required>
                <input
                  className="vendor-register-input"
                  value={form.businessName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, businessName: sanitizeBusinessNameInput(e.target.value) }))
                  }
                  maxLength={BUSINESS_NAME_MAX}
                  required
                />
              </FormField>
              {needsServiceFlow(vendorPanelType) ? (
                <FormField label="Address" required>
                  <textarea
                    className="vendor-register-input vendor-register-textarea"
                    value={form.businessAddress}
                    onChange={onChange("businessAddress")}
                    rows={3}
                    minLength={ADDRESS_MIN}
                    maxLength={ADDRESS_MAX}
                    required
                  />
                </FormField>
              ) : null}
              <FormField label="City" required>
                <select
                  className="vendor-register-input"
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  required
                >
                  <option value="">Select city</option>
                  {cities.map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Sub-district (Tehsil)" required>
                <select
                  className="vendor-register-input"
                  value={subDistrictId}
                  onChange={(e) => setSubDistrictId(e.target.value)}
                  disabled={!cityId}
                  required
                >
                  <option value="">{cityId ? "Select sub-district" : "Select city first"}</option>
                  {subDistricts.map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div
              className={`vendor-register-fields vendor-register-fields--stack${step === 4 ? "" : " d-none"}`}
              data-register-step="4"
            >
              {showShopCategory || showShopImages ? (
                <>
                  {showShopCategory ? (
                    <FormField label="Shop Category" required>
                      <select
                        className="vendor-register-input"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                          <option key={cat._id || cat.id} value={cat._id || cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ) : null}
                  {showShopImages ? (
                  <div className="vendor-register-field vendor-register-shop-images">
                    <span className="vendor-register-field__label">
                      Shop Images<span className="required-dot"> *</span>
                    </span>
                    <p className="vendor-register-shop-images__hint">
                      At least 1 image, up to 5 (max. 5MB each)
                    </p>
                    <div className="vendor-shop-images__grid">
                      {shopImages.map((row) => (
                        <div key={row.key} className="vendor-shop-images__tile is-pending">
                          <img src={row.previewUrl} alt="" />
                          <button
                            type="button"
                            className="vendor-shop-images__remove"
                            onClick={() => removeShopImage(row.key)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}

                      {shopImages.length < 5 ? (
                        <label htmlFor={shopImagesInputId} className="vendor-shop-images__add">
                          <span>+ Add image</span>
                          <input
                            id={shopImagesInputId}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(e) => {
                              handleShopImagesChange(e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                  ) : null}
                </>
              ) : null}

              {showServiceDocs ? (
                <>
                  <FileUploadZone
                    label="Aadhaar Front"
                    file={aadhaarFrontFile}
                    onFile={setAadhaarFrontFile}
                    inputId={aadhaarFrontInputId}
                    required
                  />
                  <FileUploadZone
                    label="Aadhaar Back"
                    file={aadhaarBackFile}
                    onFile={setAadhaarBackFile}
                    inputId={aadhaarBackInputId}
                    required
                  />
                  <FileUploadZone label="PAN Card" file={panFile} onFile={setPanFile} inputId={panInputId} />
                </>
              ) : null}
            </div>
          </div>

          <footer className={`vendor-register-footer${step === 1 ? " vendor-register-footer--solo" : ""}`}>
            {step > 1 ? (
              <button type="button" className="btn btn--ghost vendor-register-footer__btn" onClick={handleBack} disabled={loading}>
                <ChevronLeft />
                Back
              </button>
            ) : null}

            {step === 2 && !phoneVerified ? null : step < LAST_STEP ? (
              <button
                type="button"
                className="btn btn--primary vendor-register-footer__btn vendor-register-footer__btn--next"
                onClick={handleNext}
                disabled={loading}
              >
                Next
                <ChevronRight />
              </button>
            ) : (
              <button type="submit" className="btn btn--primary vendor-register-footer__btn vendor-register-footer__btn--next" disabled={loading}>
                {loading ? "Submitting…" : "Submit"}
                <ChevronRight />
              </button>
            )}
          </footer>

          {step === 1 ? (
            <p className="vendor-register-login-link">
              Already have an account? <Link to={VENDOR_LOGIN_PATH}>Login</Link>
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
